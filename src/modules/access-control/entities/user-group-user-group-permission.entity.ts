import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserGroup } from '../../user-group/entities/user-group.entity';

/**
 * Group-level rule: members of `userGroupGuid` can access the users (and the
 * devices owned by the users) of `targetUserGroupGuid`.
 *
 * A row where userGroupGuid === targetUserGroupGuid is the "members can see
 * each other" (shared group) flag. Rules are evaluated dynamically in SQL, so
 * users added to a group later inherit the visibility with no per-user rows.
 */
@Entity('user_group_user_group_permissions')
export class UserGroupUserGroupPermission {
  @PrimaryColumn()
  @Index()
  userGroupGuid: string;

  @PrimaryColumn()
  @Index()
  targetUserGroupGuid: string;

  @ManyToOne(() => UserGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userGroupGuid' })
  userGroup: UserGroup;

  @ManyToOne(() => UserGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetUserGroupGuid' })
  targetUserGroup: UserGroup;

  @CreateDateColumn()
  createdAt: Date;
}
