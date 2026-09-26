import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ClientConfigService } from './client-config.service';
import { UpdateClientConfigDto } from './dto/client-config.dto';

/**
 * Client setup ("Automatic Configs") endpoints.
 *
 * - GET/PUT /api/client-config/settings  administrators only (same convention
 *   as the other settings/* controllers)
 * - GET     /api/client-config/setup     any logged-in user: the output holds
 *   only what every client must know anyway (server hosts, API URL, PUBLIC key)
 *   so staff can configure their own machines without an admin.
 */
@Controller('client-config')
export class ClientConfigController {
  constructor(private readonly service: ClientConfigService) {}

  @Get('settings')
  @UseGuards(AdminGuard)
  getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  updateSettings(@Body() dto: UpdateClientConfigDto) {
    return this.service.updateSettings(dto);
  }

  @Get('setup')
  getSetup() {
    return this.service.getSetup();
  }
}
