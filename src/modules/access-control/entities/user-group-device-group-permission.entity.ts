import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserGroup } from '../../user-group/entities/user-group.entity';
import { DeviceGroup } from '../../device-group/entities/device-group.entity';

/** Group-level rule: members of `userGroupGuid` can access device group `deviceGroupGuid`. */
@Entity('user_group_device_group_permissions')
export class UserGroupDeviceGroupPermission {
  @PrimaryColumn()
  @Index()
  userGroupGuid: string;

  @PrimaryColumn()
  @Index()
  deviceGroupGuid: string;

  @ManyToOne(() => UserGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userGroupGuid' })
  userGroup: UserGroup;

  @ManyToOne(() => DeviceGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deviceGroupGuid' })
  deviceGroup: DeviceGroup;

  @CreateDateColumn()
  createdAt: Date;
}
