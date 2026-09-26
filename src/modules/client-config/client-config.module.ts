import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { SettingsModule } from '../settings/settings.module';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ClientConfigController } from './client-config.controller';
import { ClientConfigService } from './client-config.service';

/** Client setup / "Automatic Configs" generator. Stores its settings in system_settings (no new table). */
@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting]), SettingsModule],
  controllers: [ClientConfigController],
  providers: [ClientConfigService, AdminGuard],
})
export class ClientConfigModule {}
