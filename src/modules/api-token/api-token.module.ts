import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Peer } from '../../common/entities/peer.entity';
import { User } from '../user/entities/user.entity';
import { DeviceGroup } from '../device-group/entities/device-group.entity';
import { Strategy } from '../strategy/entities/strategy.entity';
import { RbacModule } from '../rbac/rbac.module';
import { AddressBookModule } from '../address-book/address-book.module';
import { ApiToken } from './entities/api-token.entity';
import { ApiTokenService } from './api-token.service';
import { ApiTokenController } from './api-token.controller';
import { DevicesCliController } from './devices-cli.controller';
import { DeviceAssignService } from './device-assign.service';

/** Global: the JWT guard (also used via @UseGuards) needs ApiTokenService. */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiToken, Peer, User, DeviceGroup, Strategy]),
    RbacModule,
    AddressBookModule,
  ],
  controllers: [ApiTokenController, DevicesCliController],
  providers: [ApiTokenService, DeviceAssignService],
  exports: [ApiTokenService],
})
export class ApiTokenModule {}
