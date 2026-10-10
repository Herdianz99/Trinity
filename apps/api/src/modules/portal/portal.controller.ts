import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PortalAllowed } from '../../common/decorators/portal-allowed.decorator';
import { PortalService } from './portal.service';
import { PortalOrderDto } from './dto/portal-order.dto';

// Unico modulo que un usuario CLIENT puede llamar (ver ClientPortalGuard). Todo se acota al
// cliente vinculado al usuario (PortalService.resolveCustomer), nunca a parametros del navegador.
@ApiTags('Portal de clientes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@PortalAllowed()
@Controller('portal')
export class PortalController {
  constructor(private service: PortalService) {}

  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.service.getMe(userId);
  }

  @Get('products')
  products(@CurrentUser('id') userId: string, @Query('search') search?: string) {
    return this.service.searchProducts(userId, search || '');
  }

  @Get('orders')
  listOrders(@CurrentUser('id') userId: string) {
    return this.service.listOrders(userId);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.getOrder(userId, id);
  }

  @Post('orders')
  createOrder(@CurrentUser('id') userId: string, @Body() dto: PortalOrderDto) {
    return this.service.createOrder(userId, dto);
  }

  @Patch('orders/:id')
  updateOrder(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: PortalOrderDto) {
    return this.service.updateOrder(userId, id, dto);
  }

  @Delete('orders/:id')
  deleteOrder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteOrder(userId, id);
  }

  @Get('cuenta/cxc')
  cxc(@CurrentUser('id') userId: string) {
    return this.service.cuentaCxc(userId);
  }

  @Get('cuenta/facturas')
  facturas(@CurrentUser('id') userId: string) {
    return this.service.cuentaFacturas(userId);
  }

  @Get('cuenta/facturas/:id/pdf')
  async facturaPdf(@CurrentUser('id') userId: string, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.service.cuentaFacturaPdf(userId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="factura-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
