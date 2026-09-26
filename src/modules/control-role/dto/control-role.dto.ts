import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateControlRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  /** { keyboard: 'deny', file: 'deny', ... } - see CONTROL_PERMISSION_KEYS */
  @IsObject()
  @IsOptional()
  permissions?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;
}

export class UpdateControlRoleDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @IsObject()
  @IsOptional()
  permissions?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;
}

export class AssignControlRoleDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  user_guids: string[];
}

/** Body of the relay -> console authorization call. */
export class RelayAuthorizeDto {
  @IsString()
  @IsOptional()
  @MaxLength(4096)
  token?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  target_id?: string;
}
