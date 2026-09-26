import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ControlRoleService } from './control-role.service';
import {
  AssignControlRoleDto,
  CreateControlRoleDto,
  UpdateControlRoleDto,
} from './dto/control-role.dto';
import { CONTROL_PERMISSION_KEYS } from './control-role.constants';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

/**
 * Control roles: named bundles of permissions (keyboard, clipboard, file
 * transfer, terminal ...) that the relay injects into the controlled device's
 * connection request for the assigned controlling user.
 */
@Controller('control-roles')
export class ControlRoleController {
  constructor(private readonly service: ControlRoleService) {}

  @Get()
  @RequirePermission('control_roles.view')
  async list() {
    return {
      permission_keys: CONTROL_PERMISSION_KEYS,
      data: await this.service.list(),
    };
  }

  @Get(':guid')
  @RequirePermission('control_roles.view')
  async get(@Param('guid') guid: string) {
    return this.service.get(guid);
  }

  @Post()
  @RequirePermission('control_roles.edit')
  @HttpCode(HttpStatus.OK)
  async create(@Body() dto: CreateControlRoleDto) {
    return this.service.create(dto);
  }

  @Patch(':guid')
  @RequirePermission('control_roles.edit')
  @HttpCode(HttpStatus.OK)
  async update(@Param('guid') guid: string, @Body() dto: UpdateControlRoleDto) {
    return this.service.update(guid, dto);
  }

  @Delete(':guid')
  @RequirePermission('control_roles.edit')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('guid') guid: string) {
    await this.service.remove(guid);
    return { message: 'Control role deleted successfully' };
  }

  @Get(':guid/users')
  @RequirePermission('control_roles.view')
  async users(@Param('guid') guid: string) {
    return this.service.listAssignments(guid);
  }

  @Post(':guid/assign')
  @RequirePermission('control_roles.edit')
  @HttpCode(HttpStatus.OK)
  async assign(@Param('guid') guid: string, @Body() dto: AssignControlRoleDto) {
    return this.service.assign(guid, dto.user_guids);
  }

  @Post(':guid/unassign')
  @RequirePermission('control_roles.edit')
  @HttpCode(HttpStatus.OK)
  async unassign(
    @Param('guid') guid: string,
    @Body() dto: AssignControlRoleDto,
  ) {
    return this.service.unassign(guid, dto.user_guids);
  }
}
