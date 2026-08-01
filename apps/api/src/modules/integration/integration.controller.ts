import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationTokenGuard } from './integration-token.guard';
import { IntegrationService } from './integration.service';
import { getIntegrationConfig } from './integration.config';

@ApiTags('Integration')
@Controller('integration')
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  // ── ENTRANTES (los llama el SOCIO, protegidos por X-Integration-Token) ──

  @Get('ping')
  @UseGuards(IntegrationTokenGuard)
  ping() {
    return { ok: true, name: getIntegrationConfig().partnerName };
  }

  @Get('products/lookup')
  @UseGuards(IntegrationTokenGuard)
  lookup(@Query('code') code: string) {
    return this.service.lookupLocal(code);
  }

  // ── INTERNO (lo llama MI frontend, protegido por JWT de usuario) ──

  @Get('partner/product/:code')
  @UseGuards(AuthGuard('jwt'))
  partnerProduct(@Param('code') code: string) {
    return this.service.lookupPartner(code);
  }
}
