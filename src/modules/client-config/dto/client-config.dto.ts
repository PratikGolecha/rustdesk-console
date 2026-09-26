import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** PUT /api/client-config/settings body. Every field is optional (partial update). */
export class UpdateClientConfigDto {
  /** ID / rendezvous server (hbbs) as host[:port] */
  @IsOptional()
  @IsString()
  @MaxLength(260)
  idServer?: string;

  /** Relay servers (hbbr) as host[:port]; documented in docs/relay-servers.md */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  relayServers?: string[];

  /** Put the (single) relay into the client config instead of letting hbbs choose */
  @IsOptional()
  @IsBoolean()
  pinRelay?: boolean;

  /** API server URL clients talk to (this console); empty = fall back to the general site backend URL */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiServer?: string;

  /** Manual public-key override; empty string clears it (the key file is used again) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  publicKey?: string;
}
