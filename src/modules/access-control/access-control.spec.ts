import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Peer, Sysinfo } from '../../common/entities';
import { AddressBook } from '../address-book/entities/address-book.entity';
import { AddressBookPeerTag } from '../address-book/entities/address-book-peer-tag.entity';
import { AddressBookPeer } from '../address-book/entities/address-book-peer.entity';
import { AddressBookRule } from '../address-book/entities/address-book-rule.entity';
import { AddressBookTag } from '../address-book/entities/address-book-tag.entity';
import { LoginSession } from '../auth/entities/login-session.entity';
import { DeviceGroupUserPermission } from '../device-group/entities/device-group-user-permission.entity';
import { DeviceGroup } from '../device-group/entities/device-group.entity';
import { UserUserPermission } from '../device-group/entities/user-user-permission.entity';
import { DeviceGroupService } from '../device-group/device-group.service';
import { PeerService } from '../device-group/peer.service';
import { Strategy } from '../strategy/entities/strategy.entity';
import { UserGroup } from '../user-group/entities/user-group.entity';
import { Invitation } from '../user/entities/invitation.entity';
import { UserToken } from '../user/entities/user-token.entity';
import { User, UserStatus } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { AccessControlService } from './access-control.service';
import { UserGroupDeviceGroupPermission } from './entities/user-group-device-group-permission.entity';
import { UserGroupUserGroupPermission } from './entities/user-group-user-group-permission.entity';

jest.mock('uuid', () => {
  const c = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { v4: c.randomUUID };
});
jest.mock('openid-client', () => ({}));

describe('Access control visibility resolution', () => {
  let ds: DataSource;
  let access: AccessControlService;
  let peers: PeerService;
  let dgs: DeviceGroupService;
  let users: UserService;

  const q = { current: 1, pageSize: 100 };
  const userNames = async (viewer: string) =>
    (await users.getAccessibleUsers(viewer, q)).data.map((u) => u.name).sort();
  const peerIds = async (viewer: string) =>
    (await peers.getAccessiblePeers(viewer, q)).data.map((p) => p.id).sort();
  const dgNames = async (viewer: string) =>
    (await dgs.getAccessibleDeviceGroups(viewer, q)).data
      .map((g) => g.name)
      .sort();

  let shared: UserGroup;
  let other: UserGroup;
  let third: UserGroup;
  let alice: User;
  let bob: User;
  let carol: User;
  let dave: User;
  let dg: DeviceGroup;

  const mkGroup = (name: string) =>
    ds.getRepository(UserGroup).save({
      guid: randomUUID(),
      name,
      normalizedName: name.toLowerCase(),
      note: null,
      isDefault: false,
    } as UserGroup);
  const mkUser = (username: string, userGroupGuid: string | null) =>
    ds.getRepository(User).save(
      ds.getRepository(User).create({
        guid: randomUUID(),
        username,
        email: null,
        password: 'x',
        note: '',
        status: UserStatus.ACTIVE,
        isAdmin: false,
        userGroupGuid,
      }),
    );
  const mkPeer = (id: string, owner: User, deviceGroupGuid?: string) =>
    ds.getRepository(Peer).insert({
      uuid: randomUUID(),
      id,
      userGuid: owner.guid,
      deviceGroupGuid: deviceGroupGuid ?? null,
      ver: 1,
      modifiedAt: 0,
    });

  beforeEach(async () => {
    ds = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [
        UserGroup,
        User,
        UserToken,
        LoginSession,
        Strategy,
        Invitation,
        Peer,
        Sysinfo,
        DeviceGroup,
        DeviceGroupUserPermission,
        UserUserPermission,
        UserGroupUserGroupPermission,
        UserGroupDeviceGroupPermission,
        AddressBook,
        AddressBookPeer,
        AddressBookTag,
        AddressBookPeerTag,
        AddressBookRule,
      ],
    });
    await ds.initialize();
    const rbac = {
      getEffectiveProtectionMap: jest.fn().mockResolvedValue(new Map()),
    };
    access = new AccessControlService(ds, { record: jest.fn() } as never);
    peers = new PeerService(
      ds.getRepository(Peer),
      ds.getRepository(Sysinfo),
      ds.getRepository(User),
      ds.getRepository(Strategy),
    );
    dgs = new DeviceGroupService(
      ds.getRepository(DeviceGroup),
      ds.getRepository(User),
      ds.getRepository(Peer),
      ds.getRepository(Sysinfo),
      ds.getRepository(DeviceGroupUserPermission),
      ds.getRepository(Strategy),
      ds,
      {} as never,
    );
    users = new UserService(
      ds.getRepository(User),
      ds.getRepository(UserToken),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ds,
      rbac as never,
      ds.getRepository(LoginSession),
    );

    shared = await mkGroup('Shared Group');
    other = await mkGroup('Other');
    third = await mkGroup('Third');
    alice = await mkUser('alice', shared.guid);
    bob = await mkUser('bob', shared.guid);
    carol = await mkUser('carol', other.guid);
    dave = await mkUser('dave', third.guid);
    dg = await ds.getRepository(DeviceGroup).save({
      guid: randomUUID(),
      name: 'Lab',
      note: null,
    } as unknown as DeviceGroup);
    await mkPeer('A1', alice);
    await mkPeer('B1', bob);
    await mkPeer('C1', carol);
    await mkPeer('D1', dave, dg.guid);
  });

  afterEach(async () => ds.destroy());

  it('sees only self by default', async () => {
    expect(await userNames(alice.guid)).toEqual(['alice']);
    expect(await peerIds(alice.guid)).toEqual(['A1']);
    expect(await dgNames(alice.guid)).toEqual([]);
  });

  it('shared flag: members see each other, outsiders do not, new members inherit', async () => {
    await access.updateUserGroupAccess(
      shared.guid,
      { members_see_each_other: true },
      'admin',
    );
    expect(await userNames(alice.guid)).toEqual(['alice', 'bob']);
    expect(await peerIds(bob.guid)).toEqual(['A1', 'B1']);
    expect(await userNames(carol.guid)).toEqual(['carol']);
    expect(await peerIds(carol.guid)).toEqual(['C1']);

    const newbie = await mkUser('newbie', shared.guid);
    await mkPeer('N1', newbie);
    expect(await userNames(newbie.guid)).toEqual(['alice', 'bob', 'newbie']);
    expect(await peerIds(newbie.guid)).toEqual(['A1', 'B1', 'N1']);
    expect(await peerIds(alice.guid)).toEqual(['A1', 'B1', 'N1']);
    expect(await ds.getRepository(UserUserPermission).count()).toBe(0);

    await access.updateUserGroupAccess(
      shared.guid,
      { members_see_each_other: false },
      'admin',
    );
    expect(await userNames(alice.guid)).toEqual(['alice']);
  });

  it('user group -> user group rule is one-directional and removable', async () => {
    await access.updateUserGroupAccess(
      other.guid,
      { user_group_guids: [shared.guid] },
      'admin',
    );
    expect(await userNames(carol.guid)).toEqual(['alice', 'bob', 'carol']);
    expect(await peerIds(carol.guid)).toEqual(['A1', 'B1', 'C1']);
    expect(await userNames(alice.guid)).toEqual(['alice']);
    const got = await access.getUserGroupAccess(other.guid);
    expect(got.user_group_guids).toEqual([shared.guid]);
    expect(got.members_see_each_other).toBe(false);

    await access.updateUserGroupAccess(
      other.guid,
      { user_group_guids: [] },
      'admin',
    );
    expect(await userNames(carol.guid)).toEqual(['carol']);
  });

  it('user group -> device group rule grants group and its devices', async () => {
    await access.updateUserGroupAccess(
      shared.guid,
      { device_group_guids: [dg.guid] },
      'admin',
    );
    expect(await dgNames(alice.guid)).toEqual(['Lab']);
    expect(await peerIds(alice.guid)).toEqual(['A1', 'D1']);
    expect(await userNames(alice.guid)).toEqual(['alice', 'dave']);
    expect(await dgNames(carol.guid)).toEqual([]);
    await access.updateUserGroupAccess(
      shared.guid,
      { device_group_guids: [] },
      'admin',
    );
    expect(await peerIds(alice.guid)).toEqual(['A1']);
    expect(await dgNames(alice.guid)).toEqual([]);
  });

  it('legacy per-user rows keep working and per-user editor manages them', async () => {
    await ds
      .getRepository(UserUserPermission)
      .insert({ userGuid: alice.guid, targetUserGuid: carol.guid });
    expect(await peerIds(alice.guid)).toEqual(['A1', 'C1']);
    // untouched rows survive an unrelated update
    await access.updateUserAccess(
      alice.guid,
      { device_group_guids: [dg.guid] },
      'admin',
    );
    expect((await access.getUserAccess(alice.guid)).user_guids).toEqual([
      carol.guid,
    ]);
    expect(await dgNames(alice.guid)).toEqual(['Lab']);
    await access.updateUserAccess(alice.guid, { user_guids: [] }, 'admin');
    expect(await peerIds(alice.guid)).toEqual(['A1', 'D1']);
  });

  it('rejects unknown guids', async () => {
    await expect(
      access.updateUserGroupAccess(
        shared.guid,
        { user_group_guids: [randomUUID()] },
        'admin',
      ),
    ).rejects.toThrow('Unknown user group');
  });
});
