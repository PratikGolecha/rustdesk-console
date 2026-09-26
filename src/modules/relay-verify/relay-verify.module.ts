import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RelayVerifyController } from './relay-verify.controller';

@Module({
  imports: [AuthModule],
  controllers: [RelayVerifyController],
})
export class RelayVerifyModule {}
