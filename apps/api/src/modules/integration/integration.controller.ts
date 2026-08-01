import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

  @Get('products/prices')
  @UseGuards(IntegrationTokenGuard)
  prices() {
    return this.service.localPrices();
  }

  // ── INTERNO (lo llama MI frontend, protegido por JWT de usuario) ──

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  status() {
    return this.service.status();
  }

  @Get('partner/product/:code')
  @UseGuards(AuthGuard('jwt'))
  partnerProduct(@Param('code') code: string) {
    return this.service.lookupPartner(code);
  }

  @Get('partner/prices/preview')
  @UseGuards(AuthGuard('jwt'))
  pricesPreview() {
    return this.service.partnerPricesPreview();
  }

  @Post('partner/prices/apply')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  pricesApply(@Body() body: { codes: string[] }, @CurrentUser('id') userId: string) {
    return this.service.applyPartnerPrices(body.codes || [], userId);
  }
}
