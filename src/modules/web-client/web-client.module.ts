import { Module } from '@nestjs/common';
import { WebClientController } from './web-client.controller';
import { WebClientService } from './web-client.service';

/** Browser (web) client bootstrap configuration. */
@Module({
  controllers: [WebClientController],
  providers: [WebClientService],
})
export class WebClientModule {}
