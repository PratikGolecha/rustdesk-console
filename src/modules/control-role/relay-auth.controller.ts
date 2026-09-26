import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { ControlRoleService } from './control-role.service';
import { RelayAuthorizeDto } from './dto/control-role.dto';

/**
 * Server-to-server endpoint called by the relay (hbbs) before it forwards a
 * connection request. Protected by a shared secret (env RELAY_SHARED_SECRET),
 * NOT by a user JWT. When the env var is unset the endpoint does not exist.
 */
@Controller('relay')
export class RelayAuthController {
  constructor(private readonly service: ControlRoleService) {}

  @Post('authorize')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async authorize(
    @Headers('x-relay-secret') secret: string | undefined,
    @Body() dto: RelayAuthorizeDto,
  ) {
    const expected = process.env.RELAY_SHARED_SECRET;
    if (!expected) throw new NotFoundException();
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid relay secret');
    }
    return this.service.authorizeForRelay(dto.token);
  }
}
