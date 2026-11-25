import { Body, Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ChatwootService } from './chatwoot.service';

// Webhook publico para el Agent Bot de Chatwoot (sin JWT; protegido por CHATWOOT_WEBHOOK_SECRET).
// Acepta Record<string, any> para que el ValidationPipe global (forbidNonWhitelisted) no rechace
// campos extra del payload de Chatwoot.
@ApiExcludeController()
@Controller('chatbot/chatwoot')
export class ChatwootWebhookController {
  constructor(private readonly chatwoot: ChatwootService) {}

  @Post('webhook')
  @HttpCode(200)
  handle(
    @Query('secret') querySecret: string | undefined,
    @Headers('x-chatwoot-secret') headerSecret: string | undefined,
    @Body() payload: Record<string, any>,
  ) {
    this.chatwoot.verifySecret(headerSecret ?? querySecret);
    return this.chatwoot.handleWebhook(payload);
  }
}
