import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateUserGroupAccessDto {
  /** Shared group: members can see each other's users and devices. */
  @IsOptional()
  @IsBoolean()
  members_see_each_other?: boolean;

  /** Replaces the set of other user groups this group can access. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  user_group_guids?: string[];

  /** Replaces the set of device groups this group can access. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  device_group_guids?: string[];
}

export class UpdateUserAccessDto {
  /** Replaces the set of other users this user can access. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  user_guids?: string[];

  /** Replaces the set of device groups this user can access. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  device_group_guids?: string[];
}
