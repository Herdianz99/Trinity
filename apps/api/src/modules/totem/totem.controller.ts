import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { TotemAllowed } from '../../common/decorators/totem-allowed.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { TotemService } from './totem.service';
import { TotemMediaService } from './totem-media.service';
import {
  CreateTotemAdDto, DeleteTotemMediaDto, ReorderTotemAdsDto, StartTotemUploadDto, TotemSendMessageDto,
  TotemUploadChunkDto, UpdateTotemAdDto, UpdateTotemConfigDto,
} from './dto/totem.dto';

// Lo que usa la pantalla del totem (rol TOTEM o personal con el modulo chatbot).
@ApiTags('Totem')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('totem', 'chatbot')
@TotemAllowed()
@Controller('totem')
export class TotemController {
  constructor(private service: TotemService) {}

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

  @Post('conversations/:id/call-seller')
  callSeller(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.callSeller(id, userId);
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
