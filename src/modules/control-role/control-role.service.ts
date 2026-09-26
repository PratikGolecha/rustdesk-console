import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as uuid from 'uuid';
import { ControlRole } from './entities/control-role.entity';
import { ControlRoleAssignment } from './entities/control-role-assignment.entity';
import { User, UserStatus } from '../user/entities/user.entity';
import { AuthService } from '../auth/services/auth.service';
import {
  CONTROL_PERMISSION_KEYS,
  ControlPermissionKey,
  ControlPermissionMap,
  encodeControlPermissions,
} from './control-role.constants';
import {
  CreateControlRoleDto,
  UpdateControlRoleDto,
} from './dto/control-role.dto';

export interface RelayAuthorizeResult {
  /** true when the token is a valid, non-revoked token of an active user */
  authenticated: boolean;
  user?: string;
  /** u64 bitmap for the client's ControlPermissions; null = do not restrict */
  control_permissions: number | null;
  role?: string;
}

@Injectable()
export class ControlRoleService {
  constructor(
    @InjectRepository(ControlRole)
    private readonly roleRepository: Repository<ControlRole>,
    @InjectRepository(ControlRoleAssignment)
    private readonly assignmentRepository: Repository<ControlRoleAssignment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authService: AuthService,
  ) {}

  /** Validate `{ key: 'allow' | 'deny' | 'default' }` and drop 'default' entries. */
  private normalizePermissions(
    input?: Record<string, string>,
  ): ControlPermissionMap {
    const out: ControlPermissionMap = {};
    for (const [key, value] of Object.entries(input ?? {})) {
      if (!(CONTROL_PERMISSION_KEYS as readonly string[]).includes(key)) {
        throw new BadRequestException(`Unknown control permission: ${key}`);
      }
      if (value === 'default') continue;
      if (value !== 'allow' && value !== 'deny') {
        throw new BadRequestException(
          `Invalid value for ${key}: expected allow, deny or default`,
        );
      }
      out[key as ControlPermissionKey] = value;
    }
    return out;
  }

  private serialize(role: ControlRole, userCount?: number) {
    return {
      guid: role.guid,
      name: role.name,
      note: role.note ?? '',
      permissions: JSON.parse(role.permissions || '{}') as ControlPermissionMap,
      is_default: role.isDefault,
      user_count: userCount,
      updated_at: role.updatedAt,
    };
  }

  async list() {
    const roles = await this.roleRepository.find({ order: { name: 'ASC' } });
    const assignments = await this.assignmentRepository.find();
    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.roleGuid, (counts.get(a.roleGuid) ?? 0) + 1);
    }
    return roles.map((r) => this.serialize(r, counts.get(r.guid) ?? 0));
  }

  async get(guid: string) {
    const role = await this.roleRepository.findOne({ where: { guid } });
    if (!role) throw new NotFoundException('Control role not found');
    return this.serialize(role);
  }

  async create(dto: CreateControlRoleDto) {
    if (await this.roleRepository.findOne({ where: { name: dto.name } })) {
      throw new BadRequestException('Control role name already exists');
    }
    const role = new ControlRole();
    role.guid = uuid.v4();
    role.name = dto.name;
    role.note = dto.note ?? '';
    role.permissions = JSON.stringify(
      this.normalizePermissions(dto.permissions),
    );
    role.isDefault = !!dto.is_default;
    if (role.isDefault) await this.clearDefault();
    await this.roleRepository.save(role);
    return this.serialize(role, 0);
  }

  async update(guid: string, dto: UpdateControlRoleDto) {
    const role = await this.roleRepository.findOne({ where: { guid } });
    if (!role) throw new NotFoundException('Control role not found');
    if (dto.name !== undefined && dto.name !== role.name) {
      if (await this.roleRepository.findOne({ where: { name: dto.name } })) {
        throw new BadRequestException('Control role name already exists');
      }
      role.name = dto.name;
    }
    if (dto.note !== undefined) role.note = dto.note;
    if (dto.permissions !== undefined) {
      role.permissions = JSON.stringify(
        this.normalizePermissions(dto.permissions),
      );
    }
    if (dto.is_default !== undefined) {
      if (dto.is_default) await this.clearDefault(guid);
      role.isDefault = dto.is_default;
    }
    await this.roleRepository.save(role);
    return this.serialize(role);
  }

  async remove(guid: string) {
    const role = await this.roleRepository.findOne({ where: { guid } });
    if (!role) throw new NotFoundException('Control role not found');
    await this.assignmentRepository.delete({ roleGuid: guid });
    await this.roleRepository.remove(role);
  }

  private async clearDefault(exceptGuid?: string) {
    const defaults = await this.roleRepository.find({
      where: { isDefault: true },
    });
    for (const d of defaults) {
      if (d.guid !== exceptGuid) {
        d.isDefault = false;
        await this.roleRepository.save(d);
      }
    }
  }

  async listAssignments(roleGuid: string) {
    await this.get(roleGuid);
    const rows = await this.assignmentRepository.find({ where: { roleGuid } });
    const users = rows.length
      ? await this.userRepository.find({
          where: { guid: In(rows.map((r) => r.userGuid)) },
        })
      : [];
    return users.map((u) => ({
      guid: u.guid,
      username: u.username,
      email: u.email ?? '',
    }));
  }

  /** Assigning moves the user: a user has at most one control role. */
  async assign(roleGuid: string, userGuids: string[]) {
    await this.get(roleGuid);
    const users = await this.userRepository.find({
      where: { guid: In(userGuids) },
    });
    if (users.length !== new Set(userGuids).size) {
      throw new BadRequestException('One or more users do not exist');
    }
    for (const u of users) {
      await this.assignmentRepository.save({ userGuid: u.guid, roleGuid });
    }
    return { assigned: users.length };
  }

  async unassign(roleGuid: string, userGuids: string[]) {
    await this.get(roleGuid);
    await this.assignmentRepository.delete({
      roleGuid,
      userGuid: In(userGuids),
    });
    return { message: 'Users unassigned' };
  }

  /**
   * Called by the relay for every connection attempt.
   * Never throws for bad tokens: it reports authenticated=false instead, and the
   * relay decides (MUST_LOGIN) whether that is fatal.
   */
  async authorizeForRelay(token?: string): Promise<RelayAuthorizeResult> {
    let user: User | null = null;
    if (token) {
      const payload = await this.authService.validateToken(token);
      if (payload) {
        const found = await this.userRepository.findOne({
          where: { guid: payload.sub },
        });
        if (found && found.status === UserStatus.ACTIVE) user = found;
      }
    }

    let role: ControlRole | null = null;
    if (user) {
      const assignment = await this.assignmentRepository.findOne({
        where: { userGuid: user.guid },
      });
      if (assignment) {
        role = await this.roleRepository.findOne({
          where: { guid: assignment.roleGuid },
        });
      }
    }
    if (!role) {
      role = await this.roleRepository.findOne({ where: { isDefault: true } });
    }

    const bits = role
      ? encodeControlPermissions(
          JSON.parse(role.permissions || '{}') as ControlPermissionMap,
        )
      : 0;
    return {
      authenticated: !!user,
      user: user?.username,
      role: role?.name,
      control_permissions: bits > 0 ? bits : null,
    };
  }
}
