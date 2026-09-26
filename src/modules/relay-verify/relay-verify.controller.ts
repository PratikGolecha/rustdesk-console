import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { AuthTokenService } from '../auth/services/auth-token.service';

export class RelayVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;
}

function secretsMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Token check for the relay (hbbs "must login" enforcement).
 *
 * The relay cannot verify console tokens itself: they are HS256 JWTs with a
 * `sub` GUID claim and can be revoked in the database, which a stateless
 * shared-key check would miss. Instead hbbs POSTs the token the RustDesk
 * client put in its punch-hole request here.
 *
 * Disabled unless RELAY_VERIFY_SECRET is set; callers must present it in the
 * `X-Relay-Secret` header. Only public claims are returned.
 */
@Controller('relay')
export class RelayVerifyController {
  constructor(private readonly authTokenService: AuthTokenService) {}

  @Public()
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() dto: RelayVerifyDto,
    @Headers('x-relay-secret') provided?: string,
  ) {
    const expected = process.env.RELAY_VERIFY_SECRET;
    if (!expected) {
      throw new ForbiddenException('Relay token verification is disabled');
    }
    if (!provided || !secretsMatch(expected, provided)) {
      throw new UnauthorizedException('Invalid relay secret');
    }
    const payload = await this.authTokenService.validateToken(dto.token);
    if (!payload) {
      return { valid: false };
    }
    return {
      valid: true,
      user_guid: payload.sub,
      username: payload.username,
      device_id: payload.deviceId ?? null,
    };
  }
}
