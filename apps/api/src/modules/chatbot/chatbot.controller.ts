import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { SendChatbotMessageDto, UpdateChatbotConfigDto } from './dto/chatbot.dto';
import { ChatbotService } from './chatbot.service';

// Chatbot de ventas (Fase 2): configuracion, pantalla de prueba y conversaciones.
@ApiTags('Chatbot')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private service: ChatbotService) {}

  @Get('config')
  getConfig() {
    return this.service.getConfigView();
  }

  @Patch('config')
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

  @Post('conversations/:id/reset')
  reset(@Param('id') id: string) {
    return this.service.resetConversation(id);
  }
}
