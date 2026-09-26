import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { WebClientService } from './web-client.service';

/**
 * Web client bootstrap endpoints (public: the values are what any RustDesk
 * client needs to know anyway - server address and *public* key).
 *
 * - GET /api/web-client/config     JSON, used by the console UI
 * - GET /api/web-client/config.js  script for the browser client (nginx maps
 *                                  /webclient-config/index.js to it)
 */
@Controller('web-client')
export class WebClientController {
  constructor(private readonly service: WebClientService) {}

  @Public()
  @Get('config')
  getConfig(@Req() req: Request) {
    return this.service.getConfig(this.info(req));
  }

  @Public()
  @Get('config.js')
  getConfigScript(@Req() req: Request, @Res() res: Response) {
    if (!this.service.isEnabled()) throw new NotFoundException();
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(
      this.service.renderConfigScript(this.service.getConfig(this.info(req))),
    );
  }

  private info(req: Request) {
    const fwdHost = req.headers['x-forwarded-host'];
    const fwdProto = req.headers['x-forwarded-proto'];
    return {
      host: (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ?? req.headers.host,
      protocol:
        (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)?.split(',')[0] ??
        req.protocol,
    };
  }
}
