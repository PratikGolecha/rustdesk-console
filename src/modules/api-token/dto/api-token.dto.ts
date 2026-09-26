import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { API_TOKEN_SCOPES } from '../decorators/allow-api-token.decorator';

export class CreateApiTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Optional expiry as ISO-8601 timestamp with timezone; omitted = never. */
  @IsOptional()
  @IsISO8601({ strict: true })
  expires_at?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(API_TOKEN_SCOPES, { each: true })
  scopes: string[];
}

/** Body of POST /api/devices/cli, sent by `rustdesk --assign`. */
export class DeviceCliAssignDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  uuid: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  user_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  strategy_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_group_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_book_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_book_tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_book_alias?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address_book_password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_book_note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_name?: string;
}
