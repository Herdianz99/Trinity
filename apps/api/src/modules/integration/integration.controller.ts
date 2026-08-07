import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IntegrationTokenGuard } from './integration-token.guard';
import { IntegrationService } from './integration.service';
import { PartnerTransfersService } from './partner-transfers.service';
import { getIntegrationConfig } from './integration.config';

@ApiTags('Integration')
@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly service: IntegrationService,
    private readonly transfers: PartnerTransfersService,
  ) {}

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

  @Post('products/upsert')
  @UseGuards(IntegrationTokenGuard)
  upsert(@Body() body: any) {
    return this.service.receiveUpsert(body);
  }

  @Get('products/catalog')
  @UseGuards(IntegrationTokenGuard)
  catalog() {
    return this.service.localCatalog();
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

  @Post('partner/sync/reconcile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  reconcile() {
    return this.service.reconcileFromPartner();
  }

  // ═══ TRASLADOS ENTRE EMPRESAS ═══

  // ── Internos (JWT): acciones del usuario ──
  @Get('transfers')
  @UseGuards(AuthGuard('jwt'))
  listTransfers(
    @Query('status') status?: string,
    @Query('direction') direction?: string,
    @Query('kind') kind?: string,
  ) {
    return this.transfers.findAll({ status, direction, kind });
  }

  @Get('transfers/:key')
  @UseGuards(AuthGuard('jwt'))
  getTransfer(@Param('key') key: string) {
    return this.transfers.findOne(key);
  }

  @Post('transfers/send')
  @UseGuards(AuthGuard('jwt'))
  sendTransfer(
    @Body() body: { fromWarehouseId: string; items: { code: string; quantity: number }[]; notes?: string; costBasis?: 'COST' | 'COST_BREGA' },
    @CurrentUser('id') userId: string,
  ) {
    return this.transfers.send(body, userId);
  }

  @Post('transfers/request')
  @UseGuards(AuthGuard('jwt'))
  requestTransfer(
    @Body() body: { items: { code: string; quantity: number }[]; notes?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.transfers.request(body, userId);
  }

  @Post('transfers/:id/approve')
  @UseGuards(AuthGuard('jwt'))
  approveTransfer(
    @Param('id') id: string,
    @Body() body: { fromWarehouseId: string; costBasis?: 'COST' | 'COST_BREGA'; sendNote?: string; items?: { code: string; sendQuantity: number }[] },
    @CurrentUser('id') userId: string,
  ) {
    return this.transfers.approve(id, body, userId);
  }

  @Post('transfers/:id/reject')
  @UseGuards(AuthGuard('jwt'))
  rejectTransfer(@Param('id') id: string) {
    return this.transfers.reject(id);
  }

  @Post('transfers/:id/receive')
  @UseGuards(AuthGuard('jwt'))
  receiveTransfer(
    @Param('id') id: string,
    @Body() body: { toWarehouseId: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.transfers.receive(id, body, userId);
  }

  // ── Entrantes (los llama el SOCIO, token) ──
  @Post('transfers/incoming')
  @UseGuards(IntegrationTokenGuard)
  transferIncoming(@Body() body: { number: string; items: any; notes?: string; sendNote?: string }) {
    return this.transfers.receiveIncoming(body);
  }

  @Post('transfers/requests')
  @UseGuards(IntegrationTokenGuard)
  transferRequest(@Body() body: { number: string; items: any; notes?: string }) {
    return this.transfers.receiveRequest(body);
  }

  @Post('transfers/:number/ack')
  @UseGuards(IntegrationTokenGuard)
  transferAck(@Param('number') number: string) {
    return this.transfers.ack(number);
  }

  @Post('transfers/:number/rejected')
  @UseGuards(IntegrationTokenGuard)
  transferRejected(@Param('number') number: string) {
    return this.transfers.rejected(number);
  }
}
