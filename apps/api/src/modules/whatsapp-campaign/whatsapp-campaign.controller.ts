import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WhatsappCampaignService } from './whatsapp-campaign.service';
import {
  ContactFlagDto, CreateSendDto, ImportLocalDto, ListCampaignQueryDto, ResultsQueryDto, UpdateSettingsDto, UpdateTemplateDto,
} from './dto/campaign.dto';

// Campana de WhatsApp (Ventas > Campana WhatsApp). Permiso 'campana-whatsapp' (se asigna por usuario)
// y ademas la empresa debe tenerla activa (CompanyConfig.whatsappCampaignEnabled; solo la grande).
@Controller('whatsapp-campaign')
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('campana-whatsapp')
export class WhatsappCampaignController {
  constructor(private readonly service: WhatsappCampaignService) {}

  @Get('clientes')
  list(@Query() q: ListCampaignQueryDto) {
    return this.service.list(q);
  }

  @Post('envios')
  send(@CurrentUser('id') userId: string, @Body() dto: CreateSendDto) {
    return this.service.send(userId, dto);
  }

  @Patch('contactos/:customerId/respondio')
  replied(@Param('customerId') customerId: string, @Body() dto: ContactFlagDto) {
    return this.service.setReplied(customerId, dto.value);
  }

  @Patch('contactos/:customerId/sin-whatsapp')
  noWhatsapp(@Param('customerId') customerId: string, @Body() dto: ContactFlagDto) {
    return this.service.setNoWhatsapp(customerId, dto.value);
  }

  @Get('plantillas')
  templates() {
    return this.service.templates();
  }

  @Put('plantillas/:key')
  saveTemplate(@CurrentUser('id') userId: string, @Param('key') key: string, @Body() dto: UpdateTemplateDto) {
    return this.service.saveTemplate(userId, key, dto.text);
  }

  @Delete('plantillas/:key')
  resetTemplate(@Param('key') key: string) {
    return this.service.resetTemplate(key);
  }

  @Patch('ajustes')
  saveSettings(@Body() dto: UpdateSettingsDto) {
    return this.service.saveSettings(dto);
  }

  @Get('resultados')
  results(@Query() q: ResultsQueryDto) {
    return this.service.results(q);
  }

  @Post('importar')
  importLocal(@CurrentUser('id') userId: string, @Body() dto: ImportLocalDto) {
    return this.service.importLocal(userId, dto);
  }
}
