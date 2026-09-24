import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { MeService } from './me.service';

@ApiTags('Me - Mi Perfil')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('mi-perfil')
@Controller('me')
export class MeController {
  constructor(private service: MeService) {}

  @Get('perfil')
  getPerfil(@CurrentUser('id') userId: string) {
    return this.service.getPerfil(userId);
  }

  @Get('cxc')
  getCxc(@CurrentUser('id') userId: string) {
    return this.service.getCxc(userId);
  }

  @Get('facturas')
  getFacturas(@CurrentUser('id') userId: string) {
    return this.service.getFacturas(userId);
  }

  @Get('recibos')
  getRecibos(@CurrentUser('id') userId: string) {
    return this.service.getRecibos(userId);
  }

  @Get('amonestaciones')
  getAmonestaciones(@CurrentUser('id') userId: string) {
    return this.service.getAmonestaciones(userId);
  }

  @Get('resumen')
  getResumen(@CurrentUser('id') userId: string) {
    return this.service.getResumen(userId);
  }

  @Get('recibos/:lineId/pdf')
  async getReciboPdf(
    @CurrentUser('id') userId: string,
    @Param('lineId') lineId: string,
    @Query('overtime') overtime: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.getReciboPdf(userId, lineId, overtime !== 'false');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-${lineId}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
