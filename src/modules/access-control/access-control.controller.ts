import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AccessControlService } from './access-control.service';
import {
  UpdateUserAccessDto,
  UpdateUserGroupAccessDto,
} from './dto/access-control.dto';

@Controller('access-control')
export class AccessControlController {
  constructor(private readonly service: AccessControlService) {}

  @Get('options')
  @RequirePermission('access_control.view')
  getOptions() {
    return this.service.getOptions();
  }

  @Get('user-groups/:guid')
  @RequirePermission('access_control.view')
  getUserGroupAccess(@Param('guid', ParseUUIDPipe) guid: string) {
    return this.service.getUserGroupAccess(guid);
  }

  @Put('user-groups/:guid')
  @RequirePermission('access_control.edit')
  @HttpCode(HttpStatus.OK)
  updateUserGroupAccess(
    @Param('guid', ParseUUIDPipe) guid: string,
    @Body() dto: UpdateUserGroupAccessDto,
    @CurrentUser('id') actorGuid: string,
  ) {
    return this.service.updateUserGroupAccess(guid, dto, actorGuid);
  }

  @Get('users/:guid')
  @RequirePermission('access_control.view')
  getUserAccess(@Param('guid', ParseUUIDPipe) guid: string) {
    return this.service.getUserAccess(guid);
  }

  @Put('users/:guid')
  @RequirePermission('access_control.edit')
  @HttpCode(HttpStatus.OK)
  updateUserAccess(
    @Param('guid', ParseUUIDPipe) guid: string,
    @Body() dto: UpdateUserAccessDto,
    @CurrentUser('id') actorGuid: string,
  ) {
    return this.service.updateUserAccess(guid, dto, actorGuid);
  }
}
