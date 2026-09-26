import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControlRole } from './entities/control-role.entity';
import { ControlRoleAssignment } from './entities/control-role-assignment.entity';
import { User } from '../user/entities/user.entity';
import { ControlRoleController } from './control-role.controller';
import { RelayAuthController } from './relay-auth.controller';
import { ControlRoleService } from './control-role.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ControlRole, ControlRoleAssignment, User]),
    AuthModule,
    RbacModule,
  ],
  controllers: [ControlRoleController, RelayAuthController],
  providers: [ControlRoleService],
})
export class ControlRoleModule {}
