import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { DeviceGroup } from '../device-group/entities/device-group.entity';
import { DeviceGroupUserPermission } from '../device-group/entities/device-group-user-permission.entity';
import { UserUserPermission } from '../device-group/entities/user-user-permission.entity';
import { RbacAuditService } from '../rbac/services/rbac-audit.service';
import { UserGroup } from '../user-group/entities/user-group.entity';
import { User } from '../user/entities/user.entity';
import {
  UpdateUserAccessDto,
  UpdateUserGroupAccessDto,
} from './dto/access-control.dto';
import { UserGroupDeviceGroupPermission } from './entities/user-group-device-group-permission.entity';
import { UserGroupUserGroupPermission } from './entities/user-group-user-group-permission.entity';

type Row = Record<string, string>;

/**
 * Admin-side management of who can access whom (RustDesk Pro "Access Control"
 * and "User Group Access Settings"). The read side lives in the client-facing
 * queries via access-sql.ts.
 */
@Injectable()
export class AccessControlService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: RbacAuditService,
  ) {}

  /** Pickers for the editors: all user groups, device groups and users. */
  async getOptions() {
    const [userGroups, deviceGroups, users] = await Promise.all([
      this.dataSource.getRepository(UserGroup).find({ order: { name: 'ASC' } }),
      this.dataSource
        .getRepository(DeviceGroup)
        .find({ order: { name: 'ASC' } }),
      this.dataSource
        .getRepository(User)
        .find({ order: { username: 'ASC' }, take: 2000 }),
    ]);
    return {
      user_groups: userGroups.map((g) => ({ guid: g.guid, name: g.name })),
      device_groups: deviceGroups.map((g) => ({ guid: g.guid, name: g.name })),
      users: users.map((u) => ({
        guid: u.guid,
        name: u.username,
        user_group_guid: u.userGroupGuid,
      })),
    };
  }

  async getUserGroupAccess(guid: string) {
    await this.requireUserGroup(guid);
    const m = this.dataSource.manager;
    const [groupRules, deviceRules] = await Promise.all([
      m.find(UserGroupUserGroupPermission, { where: { userGroupGuid: guid } }),
      m.find(UserGroupDeviceGroupPermission, {
        where: { userGroupGuid: guid },
      }),
    ]);
    return {
      guid,
      members_see_each_other: groupRules.some(
        (r) => r.targetUserGroupGuid === guid,
      ),
      user_group_guids: groupRules
        .filter((r) => r.targetUserGroupGuid !== guid)
        .map((r) => r.targetUserGroupGuid),
      device_group_guids: deviceRules.map((r) => r.deviceGroupGuid),
    };
  }

  async updateUserGroupAccess(
    guid: string,
    dto: UpdateUserGroupAccessDto,
    actorGuid: string,
  ) {
    const before = await this.getUserGroupAccess(guid);
    await this.dataSource.transaction(async (m) => {
      if (
        dto.members_see_each_other !== undefined ||
        dto.user_group_guids !== undefined
      ) {
        const shared =
          dto.members_see_each_other ?? before.members_see_each_other;
        const targets = new Set(
          dto.user_group_guids ?? before.user_group_guids,
        );
        targets.delete(guid);
        await this.assertExist(m, UserGroup, [...targets], 'user group');
        if (shared) targets.add(guid);
        await this.replace(
          m,
          UserGroupUserGroupPermission,
          ['userGroupGuid', 'targetUserGroupGuid'],
          { userGroupGuid: guid },
          [...targets].map((t) => ({
            userGroupGuid: guid,
            targetUserGroupGuid: t,
          })),
        );
      }
      if (dto.device_group_guids !== undefined) {
        const ids = [...new Set(dto.device_group_guids)];
        await this.assertExist(m, DeviceGroup, ids, 'device group');
        await this.replace(
          m,
          UserGroupDeviceGroupPermission,
          ['userGroupGuid', 'deviceGroupGuid'],
          { userGroupGuid: guid },
          ids.map((d) => ({ userGroupGuid: guid, deviceGroupGuid: d })),
        );
      }
    });
    const after = await this.getUserGroupAccess(guid);
    await this.auditService.record({
      actorUserGuid: actorGuid,
      targetType: 'user_group_access',
      targetGuid: guid,
      action: 'access_control.user_group.update',
      result: 'allowed',
      beforeState: before,
      afterState: after,
    });
    return after;
  }

  async getUserAccess(guid: string) {
    await this.requireUser(guid);
    const m = this.dataSource.manager;
    const [users, groups] = await Promise.all([
      m.find(UserUserPermission, { where: { userGuid: guid } }),
      m.find(DeviceGroupUserPermission, { where: { userGuid: guid } }),
    ]);
    return {
      guid,
      user_guids: users.map((r) => r.targetUserGuid),
      device_group_guids: groups.map((r) => r.deviceGroupGuid),
    };
  }

  async updateUserAccess(
    guid: string,
    dto: UpdateUserAccessDto,
    actorGuid: string,
  ) {
    const before = await this.getUserAccess(guid);
    await this.dataSource.transaction(async (m) => {
      if (dto.user_guids !== undefined) {
        const ids = [...new Set(dto.user_guids)].filter((id) => id !== guid);
        await this.assertExist(m, User, ids, 'user');
        await this.replace(
          m,
          UserUserPermission,
          ['userGuid', 'targetUserGuid'],
          { userGuid: guid },
          ids.map((t) => ({ userGuid: guid, targetUserGuid: t })),
        );
      }
      if (dto.device_group_guids !== undefined) {
        const ids = [...new Set(dto.device_group_guids)];
        await this.assertExist(m, DeviceGroup, ids, 'device group');
        await this.replace(
          m,
          DeviceGroupUserPermission,
          ['userGuid', 'deviceGroupGuid'],
          { userGuid: guid },
          ids.map((d) => ({ userGuid: guid, deviceGroupGuid: d })),
        );
      }
    });
    const after = await this.getUserAccess(guid);
    await this.auditService.record({
      actorUserGuid: actorGuid,
      targetType: 'user_access',
      targetGuid: guid,
      action: 'access_control.user.update',
      result: 'allowed',
      beforeState: before,
      afterState: after,
    });
    return after;
  }

  /**
   * Replace-set semantics done as a diff, so untouched rows (including the
   * hand-inserted production ones) keep their createdAt: only rows missing
   * from `desired` are deleted and only new rows are inserted.
   */
  private async replace(
    m: EntityManager,
    entity: new () => object,
    keyCols: string[],
    scope: Row,
    desired: Row[],
  ) {
    const keyOf = (r: Row) => keyCols.map((c) => r[c]).join('|');
    const existing = (await m.find(entity, {
      where: scope as never,
    })) as unknown as Row[];
    const wanted = new Set(desired.map(keyOf));
    const have = new Set(existing.map(keyOf));
    for (const row of existing) {
      if (!wanted.has(keyOf(row))) {
        await m.delete(
          entity,
          Object.fromEntries(keyCols.map((c) => [c, row[c]])),
        );
      }
    }
    const toInsert = desired.filter((r) => !have.has(keyOf(r)));
    if (toInsert.length) await m.insert(entity, toInsert);
  }

  private async assertExist(
    m: EntityManager,
    entity: typeof UserGroup | typeof DeviceGroup | typeof User,
    ids: string[],
    label: string,
  ) {
    if (!ids.length) return;
    const found = await m.count(entity, {
      where: { guid: In(ids) } as never,
    });
    if (found !== ids.length) {
      throw new BadRequestException(`Unknown ${label} in request`);
    }
  }

  private async requireUserGroup(guid: string) {
    const g = await this.dataSource
      .getRepository(UserGroup)
      .findOne({ where: { guid } });
    if (!g) throw new NotFoundException('User group not found');
  }

  private async requireUser(guid: string) {
    const u = await this.dataSource
      .getRepository(User)
      .findOne({ where: { guid } });
    if (!u) throw new NotFoundException('User not found');
  }
}
