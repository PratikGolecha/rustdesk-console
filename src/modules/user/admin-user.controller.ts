import { Controller, Get, Query } from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import { AdminUserQueryDto } from './dto/admin-user.dto';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AllowApiToken } from '../api-token/decorators/allow-api-token.decorator';

@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @AllowApiToken('read')
  @Get()
  @RequirePermission('users.view')
  async getAdminUsers(
    @Query() query: AdminUserQueryDto,
    @CurrentUser('id') actorGuid: string,
  ) {
    return this.adminUserService.getAdminUsers(query, actorGuid);
  }
}
