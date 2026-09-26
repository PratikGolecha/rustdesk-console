import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { ApiTokenService } from './api-token.service';
import { CreateApiTokenDto } from './dto/api-token.dto';

/** Management of console API tokens. JWT-only: tokens cannot manage tokens. */
@Controller('api-tokens')
export class ApiTokenController {
  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Get()
  @RequirePermission('api_tokens.view')
  list() {
    return this.apiTokenService.list();
  }

  /** Returns the plaintext token exactly once. */
  @Post()
  @RequirePermission('api_tokens.create')
  @HttpCode(HttpStatus.OK)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateApiTokenDto) {
    return this.apiTokenService.create(userId, dto);
  }

  @Delete(':guid')
  @RequirePermission('api_tokens.revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('guid') guid: string) {
    return this.apiTokenService.revoke(guid);
  }
}
