import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { CrossSellRuleStatus } from '@prisma/client';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RateChatbotMessageDto, SendChatbotMessageDto, UpdateChatbotConfigDto } from './dto/chatbot.dto';
import { ChatbotService } from './chatbot.service';
import { ChatbotCrossSellService } from './chatbot-cross-sell.service';
import { ChatbotCrossSellAnalysisService } from './chatbot-cross-sell-analysis.service';
import { CrossSellRuleDto, TestCrossSellRuleDto, UpdateCrossSellRuleDto } from './dto/cross-sell.dto';

// Chatbot de ventas (Fase 2): configuracion, pantalla de prueba y conversaciones.
@ApiTags('Chatbot')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(
    private service: ChatbotService,
    private crossSell: ChatbotCrossSellService,
    private crossSellAnalysis: ChatbotCrossSellAnalysisService,
  ) {}

  @Get('config')
  getConfig() {
    return this.service.getConfigView();
  }

  // Cambiar precios/textos/tope: permiso aparte (quien solo usa el bot en el piloto no lo tiene).
  @Patch('config')
  @RequireModule('chatbot-config')
  updateConfig(@Body() dto: UpdateChatbotConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('searches/missed')
  missed(@Query('days') days?: string) {
    return this.service.missedSearches(days ? Number(days) || 30 : 30);
  }

  // Lo que encontraria el bot para una consulta, sin llamar a la IA (no gasta).
  @Get('tools/search')
  testSearch(@Query('q') q?: string) {
    return this.service.testSearch(q ?? '');
  }

  // Foto de producto en PNG por el mismo dominio: el CDN no permite CORS, y el portapapeles del
  // navegador solo acepta PNG. Asi quien atiende el WhatsApp puede copiar y pegar la foto.
  @Get('image.png')
  async imagePng(@Query('url') url: string, @Res() res: Response) {
    const png = await this.service.imagePng(url);
    res.set({ 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'private, max-age=3600' });
    res.end(png);
  }

  @Post('conversations')
  create(@CurrentUser('id') userId: string) {
    return this.service.createTestConversation(userId);
  }

  @Get('conversations')
  list(@Query('status') status?: string) {
    return this.service.listConversations(status);
  }

  @Get('conversations/:id')
  findOne(@Param('id') id: string) {
    return this.service.getConversation(id);
  }

  @Post('conversations/:id/messages')
  send(@Param('id') id: string, @Body() dto: SendChatbotMessageDto) {
    return this.service.reply(id, dto.text ?? '', dto.images ?? []);
  }

  // Piloto: 1 = la respuesta se uso tal cual, -1 = hubo que corregirla, 0 = quitar calificacion.
  @Patch('messages/:id/rating')
  rate(@Param('id') id: string, @Body() dto: RateChatbotMessageDto) {
    return this.service.rateMessage(id, dto.rating);
  }

  @Post('conversations/:id/reset')
  reset(@Param('id') id: string) {
    return this.service.resetConversation(id);
  }

  // ---------- Venta cruzada (permiso de configuracion) ----------

  @Get('cross-sell/rules')
  @RequireModule('chatbot-config')
  crossSellRules(@Query('status') status?: string) {
    const valid = ['ACTIVE', 'PAUSED', 'SUGGESTED', 'DISMISSED'].includes(status ?? '');
    return this.crossSell.list(valid ? (status as CrossSellRuleStatus) : undefined);
  }

  @Post('cross-sell/rules/test')
  @RequireModule('chatbot-config')
  crossSellTest(@Body() dto: TestCrossSellRuleDto) {
    return this.crossSell.testRule(dto);
  }

  @Post('cross-sell/rules')
  @RequireModule('chatbot-config')
  crossSellCreate(@Body() dto: CrossSellRuleDto, @CurrentUser('id') userId: string) {
    return this.crossSell.create(dto, userId);
  }

  @Patch('cross-sell/rules/:id')
  @RequireModule('chatbot-config')
  crossSellUpdate(@Param('id') id: string, @Body() dto: UpdateCrossSellRuleDto) {
    return this.crossSell.update(id, dto);
  }

  @Delete('cross-sell/rules/:id')
  @RequireModule('chatbot-config')
  crossSellDelete(@Param('id') id: string) {
    return this.crossSell.remove(id);
  }

  @Post('cross-sell/analyze')
  @RequireModule('chatbot-config')
  crossSellAnalyze() {
    return this.crossSellAnalysis.analyze();
  }
}
