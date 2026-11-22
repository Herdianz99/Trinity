import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { TotemAllowed } from '../../common/decorators/totem-allowed.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { TotemService } from './totem.service';
import { TotemMediaService } from './totem-media.service';
import { TotemTtsService } from './totem-tts.service';
import {
  CreateTotemAdDto, DeleteTotemMediaDto, ReorderTotemAdsDto, StartTotemUploadDto, TotemDiagnosticDto, TotemSendMessageDto,
  TotemTtsDto, TotemUploadChunkDto, UpdateTotemAdDto, UpdateTotemConfigDto,
} from './dto/totem.dto';

// Lo que usa la pantalla del totem (rol TOTEM o personal con el modulo chatbot).
@ApiTags('Totem')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('totem', 'chatbot')
@TotemAllowed()
@Controller('totem')
export class TotemController {
  constructor(private service: TotemService, private tts: TotemTtsService) {}

  @Get('playlist')
  playlist() {
    return this.service.playlist();
  }

  @Post('conversations')
  create(@CurrentUser('id') userId: string) {
    return this.service.createConversation(userId);
  }

  @Post('conversations/:id/messages')
  send(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: TotemSendMessageDto) {
    return this.service.reply(id, userId, dto.text ?? '');
  }

  // Despues de llamar al vendedor: la pantalla pregunta cada pocos segundos si alguien toco "Voy yo".
  @Get('conversations/:id/status')
  status(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.callStatus(id, userId);
  }

  @Post('conversations/:id/call-seller')
  callSeller(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.callSeller(id, userId);
  }

  @Get('tts/voices')
  ttsVoices() {
    return this.tts.voicesInfo();
  }

  @Post('tts')
  @HttpCode(200)
  async synthesize(@Body() dto: TotemTtsDto, @Res() res: Response) {
    const wav = await this.tts.synthesize(dto.text, dto.voice);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(wav);
  }

  // Diagnóstico invisible de la reproducción de video (Sesión 192): la pantalla manda capacidades del
  // decodificador, cuadros perdidos y trabas; aquí solo se escribe una línea JSON en el log del API
  // (buscar "TotemDiag" en los logs de PM2). No guarda nada en la BD.
  private readonly diagLogger = new Logger('TotemDiag');

  // Responde 200 con cuerpo (no 204): el proxy de Next no admite 204 con cuerpo vacío.
  @Post('diagnostics')
  @HttpCode(200)
  diagnostics(@Body() dto: TotemDiagnosticDto, @CurrentUser('id') userId: string) {
    let data = '';
    try { data = JSON.stringify(dto.data ?? {}); } catch { data = '"<no serializable>"'; }
    if (data.length > 4000) data = data.slice(0, 4000) + '…';
    this.diagLogger.log(`${dto.event} user=${userId} ${data}`);
    return { ok: true };
  }
}

// Configuracion del totem: Chatbot -> Totem, solo con "Chatbot: configuracion". El rol TOTEM no entra (TotemGuard).
@ApiTags('Totem')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('chatbot-config')
@Controller('totem/admin')
export class TotemAdminController {
  constructor(private service: TotemService, private media: TotemMediaService) {}

  @Get('config')
  config() {
    return this.service.configView();
  }

  @Patch('config')
  updateConfig(@Body() dto: UpdateTotemConfigDto) {
    return this.service.updateConfig(dto);
  }

  @Get('ads')
  ads() {
    return this.service.listAds();
  }

  @Post('ads')
  createAd(@Body() dto: CreateTotemAdDto, @CurrentUser('id') userId: string) {
    return this.service.createAd(dto, userId);
  }

  @Post('ads/reorder')
  reorder(@Body() dto: ReorderTotemAdsDto) {
    return this.service.reorder(dto.ids);
  }

  @Patch('ads/:id')
  updateAd(@Param('id') id: string, @Body() dto: UpdateTotemAdDto) {
    return this.service.updateAd(id, dto);
  }

  @Delete('ads/:id')
  deleteAd(@Param('id') id: string) {
    return this.service.deleteAd(id);
  }

  @Get('media')
  listMedia() {
    return this.service.listMedia();
  }

  @Post('media/delete')
  deleteMedia(@Body() dto: DeleteTotemMediaDto) {
    return this.service.deleteMedia(dto.ids);
  }

  @Post('media/cleanup-expired')
  cleanupExpired() {
    return this.service.cleanupExpired();
  }

  @Post('uploads')
  startUpload(@Body() dto: StartTotemUploadDto, @CurrentUser('id') userId: string) {
    return this.media.startUpload(dto, userId);
  }

  @Post('uploads/:id/chunk')
  chunk(@Param('id') id: string, @Body() dto: TotemUploadChunkDto) {
    return this.media.appendChunk(id, dto);
  }

  @Post('uploads/:id/complete')
  complete(@Param('id') id: string) {
    return this.media.completeUpload(id);
  }
}
