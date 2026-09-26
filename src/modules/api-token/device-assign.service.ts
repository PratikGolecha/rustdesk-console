import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Peer } from '../../common/entities/peer.entity';
import { User } from '../user/entities/user.entity';
import { DeviceGroup } from '../device-group/entities/device-group.entity';
import { Strategy } from '../strategy/entities/strategy.entity';
import { RbacAuthorizationService } from '../rbac/services/rbac-authorization.service';
import { RbacAuditService } from '../rbac/services/rbac-audit.service';
import { AddressBookService } from '../address-book/services/address-book.service';
import { DeviceCliAssignDto } from './dto/api-token.dto';
import { ApiTokenPrincipal } from './api-token.service';

@Injectable()
export class DeviceAssignService {
  constructor(
    @InjectRepository(Peer)
    private readonly peerRepository: Repository<Peer>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DeviceGroup)
    private readonly deviceGroupRepository: Repository<DeviceGroup>,
    @InjectRepository(Strategy)
    private readonly strategyRepository: Repository<Strategy>,
    private readonly authorization: RbacAuthorizationService,
    private readonly audit: RbacAuditService,
    private readonly addressBookService: AddressBookService,
  ) {}

  /**
   * Handle `POST /api/devices/cli` (sent by `rustdesk --assign`).
   *
   * Everything is resolved and authorized first; nothing is written unless all
   * requested names exist and the token owner is allowed to make each change.
   * Re-running with the same arguments is a no-op.
   */
  async assign(actor: ApiTokenPrincipal, dto: DeviceCliAssignDto) {
    const peer = await this.peerRepository.findOne({
      where: { id: dto.id, uuid: dto.uuid },
    });
    if (!peer) {
      throw new NotFoundException(
        'Device not found. It registers with the console on its first heartbeat: make sure the RustDesk client is running and connected to this server, then retry.',
      );
    }

    // devices.edit within the owner's scope is required for any change.
    const { scope } = await this.authorization.assertDeviceAccess(
      actor.id,
      'devices.edit',
      peer.uuid,
    );
    const update: Partial<Peer> = {};
    const changes: Record<string, unknown> = {};

    if (dto.user_name !== undefined) {
      this.requireGlobal(scope.global, 'assign a user');
      const user = await this.userRepository
        .createQueryBuilder('u')
        .where('LOWER(u.username) = :name', {
          name: dto.user_name.trim().toLowerCase(),
        })
        .getOne();
      if (!user)
        throw new NotFoundException(`User "${dto.user_name}" does not exist`);
      if (peer.userGuid !== user.guid) {
        update.userGuid = user.guid;
        changes.user_name = user.username;
      }
    }
    if (dto.device_group_name !== undefined) {
      this.requireGlobal(scope.global, 'assign a device group');
      const group = await this.deviceGroupRepository
        .createQueryBuilder('g')
        .where('LOWER(g.name) = :name', {
          name: dto.device_group_name.trim().toLowerCase(),
        })
        .getOne();
      if (!group) {
        throw new NotFoundException(
          `Device group "${dto.device_group_name}" does not exist`,
        );
      }
      if (peer.deviceGroupGuid !== group.guid) {
        update.deviceGroupGuid = group.guid;
        changes.device_group_name = group.name;
      }
    }
    if (dto.strategy_name !== undefined) {
      const strategy = await this.strategyRepository
        .createQueryBuilder('s')
        .where('LOWER(s.name) = :name', {
          name: dto.strategy_name.trim().toLowerCase(),
        })
        .getOne();
      if (!strategy) {
        throw new NotFoundException(
          `Strategy "${dto.strategy_name}" does not exist`,
        );
      }
      await this.authorization.assertStrategyTargets(actor.id, 'device', [
        peer.uuid,
      ]);
      if (peer.strategyGuid !== strategy.guid) {
        update.strategyGuid = strategy.guid;
        changes.strategy_name = strategy.name;
      }
    }
    if (dto.note !== undefined && (peer.note ?? null) !== dto.note) {
      update.note = dto.note;
      changes.note = dto.note;
    }
    if (
      dto.device_username !== undefined &&
      (peer.deviceUsername ?? null) !== dto.device_username
    ) {
      update.deviceUsername = dto.device_username;
      changes.device_username = dto.device_username;
    }
    if (
      dto.device_name !== undefined &&
      (peer.deviceName ?? null) !== dto.device_name
    ) {
      update.deviceName = dto.device_name;
      changes.device_name = dto.device_name;
    }

    // Address book: resolve + authorize before any write.
    let book: Awaited<
      ReturnType<AddressBookService['resolveBookForAssign']>
    > | null = null;
    if (dto.address_book_name !== undefined) {
      await this.authorization.requirePermission(
        actor.id,
        'address_books.edit',
      );
      const targetUserGuid = update.userGuid ?? peer.userGuid ?? null;
      book = await this.addressBookService.resolveBookForAssign(
        dto.address_book_name,
        targetUserGuid,
        actor.id,
      );
    }

    if (Object.keys(update).length > 0) {
      await this.peerRepository.update({ uuid: peer.uuid }, update);
    }
    if (book) {
      const result = await this.addressBookService.assignPeerToBook(
        book.guid,
        peer.uuid,
        {
          alias: dto.address_book_alias,
          password: dto.address_book_password,
          note: dto.address_book_note,
          tags: dto.address_book_tag
            ? dto.address_book_tag
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : undefined,
        },
      );
      changes.address_book = {
        name: book.name,
        entry_created: result.created,
        alias: dto.address_book_alias,
        tag: dto.address_book_tag,
        note: dto.address_book_note,
        password: dto.address_book_password ? '[REDACTED]' : undefined,
      };
    }

    await this.audit.record({
      actorUserGuid: actor.id,
      targetType: 'device',
      targetGuid: peer.uuid,
      action: 'devices.assign_cli',
      result: 'allowed',
      reason: `via API token "${actor.apiTokenName}" (${actor.apiTokenGuid})`,
      afterState: { device_id: peer.id, changes },
    });
  }

  private requireGlobal(isGlobal: boolean, what: string): void {
    if (!isGlobal) {
      throw new ForbiddenException(
        `Permission to ${what} requires global device access`,
      );
    }
  }
}
