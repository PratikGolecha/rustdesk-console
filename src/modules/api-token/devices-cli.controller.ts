import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipConsoleAudit } from '../rbac/decorators/skip-console-audit.decorator';
import { AllowApiToken } from './decorators/allow-api-token.decorator';
import { DeviceCliAssignDto } from './dto/api-token.dto';
import { DeviceAssignService } from './device-assign.service';
import type { ApiTokenPrincipal } from './api-token.service';

/**
 * Endpoint called by `rustdesk --assign --token <TOKEN> ...` (see
 * src/core_main.rs in the RustDesk client): POST JSON with
 * `Authorization: Bearer <token>`. An empty 200 body makes the client print
 * "Done!"; any other body is printed verbatim as the error text.
 */
@Controller('devices')
export class DevicesCliController {
  constructor(private readonly assignService: DeviceAssignService) {}

  @Post('cli')
  @AllowApiToken('assign')
  @SkipConsoleAudit() // the service records a detailed audit entry itself
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async assign(
    @CurrentUser() actor: ApiTokenPrincipal,
    // Raw body on purpose: the global pipe forbids unknown properties, but a
    // newer RustDesk client may send fields this server does not know yet.
    @Body() body: Record<string, unknown>,
  ): Promise<void> {
    const dto = plainToInstance(DeviceCliAssignDto, body ?? {});
    const errors = await validate(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });
    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
    await this.assignService.assign(actor, dto);
  }
}
