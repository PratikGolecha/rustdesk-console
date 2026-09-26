import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ExtractJwt } from 'passport-jwt';
import type { Request } from 'express';
import { ApiTokenService } from '../../api-token/api-token.service';
import {
  ALLOW_API_TOKEN_KEY,
  ApiTokenScope,
} from '../../api-token/decorators/allow-api-token.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private apiTokenService: ApiTokenService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check whether this is a public endpoint
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Console API tokens (`Authorization: Bearer rdc_...`). They are only
    // honoured on routes that opt in with @AllowApiToken(scope); everywhere
    // else they are rejected and never reach the JWT flow.
    const request = context.switchToHttp().getRequest<Request>();
    const bearer = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (ApiTokenService.looksLikeApiToken(bearer)) {
      const scope = this.reflector.getAllAndOverride<ApiTokenScope | undefined>(
        ALLOW_API_TOKEN_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!scope) {
        throw new UnauthorizedException(
          'API tokens are not accepted on this endpoint',
        );
      }
      const ip = request.ip || request.socket?.remoteAddress || 'unknown';
      (request as Request & { user?: unknown }).user =
        await this.apiTokenService.authenticate(bearer as string, scope, ip);
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Please log in first');
    }
    if (!user) {
      throw new UnauthorizedException('Please log in first');
    }
    return user;
  }
}
