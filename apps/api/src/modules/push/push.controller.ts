import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push.dto';

// Registro de navegadores para notificaciones push. Cualquier usuario logueado registra el suyo;
// a quien le llega cada aviso lo decide quien envia (vendedores, modulo store, etc.).
@ApiTags('Push')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('push')
export class PushController {
  constructor(private push: PushService) {}

  @Get('public-key')
  publicKey() {
    return this.push.getPublicKey();
  }

  @Get('status')
  status(@CurrentUser('id') userId: string, @Query('endpoint') endpoint?: string) {
    return this.push.status(userId, endpoint);
  }

  @Post('subscribe')
  @HttpCode(200)
  subscribe(@CurrentUser('id') userId: string, @Body() dto: PushSubscribeDto, @Headers('user-agent') ua?: string) {
    return this.push.subscribe(userId, { endpoint: dto.endpoint, keys: { p256dh: dto.p256dh, auth: dto.auth } }, ua);
  }

  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@CurrentUser('id') userId: string, @Body() dto: PushUnsubscribeDto) {
    return this.push.unsubscribe(userId, dto.endpoint);
  }

  // "Probar aviso": manda una notificacion solo a los navegadores del propio usuario.
  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser('id') userId: string) {
    const sent = await this.push.sendToUsers([userId], {
      title: 'Avisos activados ✅',
      body: 'Así te llegarán los llamados del tótem y los pedidos online.',
      tag: 'push-test',
      url: '/llamados',
      renotify: true,
    });
    return { sent };
  }
}
