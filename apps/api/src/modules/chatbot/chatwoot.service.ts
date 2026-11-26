import { Injectable, Logger, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { ChatbotChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasParts } from '../../common/timezone';
import { SpacesService } from '../product-images/spaces.service';
import { ChatbotService } from './chatbot.service';
import {
  DEFAULT_SOCIAL_DEBOUNCE_MS,
  DEFAULT_WEB_DEBOUNCE_MS,
  IncomingChatwootMessage,
  appendWebProductLink,
  isSafeAttachmentUrl,
  isWithinHourRange,
  parseChatwootPayload,
  splitForChannel,
} from './chatwoot-helpers';
import { ChatwootBurstQueue } from './chatwoot-queue';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_INCOMING_IMAGES = 4;
const DEDUP_TTL_MS = 10 * 60_000;
const UNSUPPORTED_ATTACHMENT_REPLY =
  'Recibí tu nota de voz o archivo. Te paso con un asesor para que lo revise y te atienda en breve.';

@Injectable()
export class ChatwootService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatwootService.name);
  private readonly seenMessages = new Map<number, number>();
  private readonly queue: ChatwootBurstQueue<IncomingChatwootMessage>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly chatbot: ChatbotService,
    private readonly spaces: SpacesService,
  ) {
    this.queue = new ChatwootBurstQueue<IncomingChatwootMessage>(
      (key, batch, epoch) => this.processBatch(key, batch, epoch),
      (key, err) => this.logger.error(`Error procesando lote Chatwoot ${key}: ${(err as Error)?.message ?? err}`),
    );
  }

  onModuleDestroy() {
    this.queue.clearAll();
  }

  private chatwootUrl(): string {
    return (this.config.get<string>('CHATWOOT_URL') || '').trim().replace(/\/+$/, '');
  }

  private botToken(): string {
    return (this.config.get<string>('CHATWOOT_BOT_TOKEN') || '').trim();
  }

  private webhookSecret(): string {
    return (this.config.get<string>('CHATWOOT_WEBHOOK_SECRET') || '').trim();
  }

  private storeUrl(): string {
    return (this.config.get<string>('STORE_URL') || 'https://ferreteriaeltrebol.com').trim().replace(/\/+$/, '');
  }

  private enabledChannels(): Set<string> {
    const raw = (this.config.get<string>('CHATWOOT_ENABLED_CHANNELS') || 'WEB,INSTAGRAM,WHATSAPP,FACEBOOK').trim();
    return new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
  }

  private debounceMsFor(channel: ChatbotChannel): number {
    const override = Number(this.config.get<string>('CHATWOOT_DEBOUNCE_MS') || 0);
    if (Number.isFinite(override) && override >= 500) return override;
    return channel === 'WEB' ? DEFAULT_WEB_DEBOUNCE_MS : DEFAULT_SOCIAL_DEBOUNCE_MS;
  }

  /** Verificacion en tiempo constante del secreto del webhook (query ?secret=... o header x-chatwoot-secret). */
  verifySecret(candidate?: string): void {
    const expected = this.webhookSecret();
    if (!expected) {
      throw new UnauthorizedException('CHATWOOT_WEBHOOK_SECRET no está configurado en el servidor');
    }
    const provided = (candidate || '').trim();
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Secreto de webhook inválido');
    }
  }

  private isDuplicate(messageId: number): boolean {
    if (!messageId) return false;
    const now = Date.now();
    if (this.seenMessages.size > 1000) {
      for (const [id, ts] of this.seenMessages) {
        if (now - ts > DEDUP_TTL_MS) this.seenMessages.delete(id);
      }
    }
    const prev = this.seenMessages.get(messageId);
    if (prev && now - prev < DEDUP_TTL_MS) return true;
    this.seenMessages.set(messageId, now);
    return false;
  }

  private convKey(accountId: number, conversationId: number): string {
    return `${accountId}:${conversationId}`;
  }

  /** Punto de entrada sincrono del webhook: valida, encola y responde 200 rapido a Chatwoot. */
  async handleWebhook(payload: Record<string, any>): Promise<{ ok: true; action: string }> {
    const evt = parseChatwootPayload(payload);

    if (evt.kind === 'ignore') {
      return { ok: true, action: `ignored:${evt.reason}` };
    }

    const key = this.convKey(evt.accountId, evt.conversationId);

    if (evt.kind === 'status_changed') {
      if (evt.status === 'open') {
        this.queue.cancel(key);
        await this.markExternalStatus(key, 'ESCALATED', 'asesor tomó la conversación en Chatwoot');
      } else if (evt.status === 'resolved') {
        this.queue.cancel(key);
        await this.markExternalStatus(key, 'CLOSED');
      }
      return { ok: true, action: `status:${evt.status}` };
    }

    if (evt.kind === 'human_replied') {
      this.queue.cancel(key);
      await this.markExternalStatus(key, 'ESCALATED', 'asesor respondió en Chatwoot');
      return { ok: true, action: 'human_takeover' };
    }

    // Evento incoming del cliente:
    if (this.isDuplicate(evt.messageId)) {
      return { ok: true, action: 'duplicate' };
    }

    // Solo respondemos cuando la conversacion esta asignada al bot ('pending' en Chatwoot).
    // Si ya esta 'open' (con asesor) o 'resolved', el bot se mantiene en silencio.
    if (evt.conversationStatus && evt.conversationStatus !== 'pending') {
      return { ok: true, action: `skip_status:${evt.conversationStatus}` };
    }

    // Si el canal no esta habilitado para el bot, abrir directo para asesores (nunca dejar en pending).
    if (!this.enabledChannels().has(evt.channel)) {
      void this.handoffToHuman(evt.accountId, evt.conversationId, `Canal ${evt.channel} configurado solo para asesores.`);
      return { ok: true, action: `channel_disabled:${evt.channel}` };
    }

    // Horario de asesor humano para WhatsApp (opcional, via CHATWOOT_WA_HUMAN_HOURS="8-17" hora Caracas).
    if (evt.channel === 'WHATSAPP') {
      const humanHours = this.config.get<string>('CHATWOOT_WA_HUMAN_HOURS');
      const { hour } = caracasParts(new Date());
      if (isWithinHourRange(hour, humanHours)) {
        void this.handoffToHuman(evt.accountId, evt.conversationId, 'Horario de atención de asesores en WhatsApp.');
        return { ok: true, action: 'wa_human_hours' };
      }
    }

    this.queue.enqueue(key, evt, this.debounceMsFor(evt.channel));
    return { ok: true, action: 'queued' };
  }

  private async markExternalStatus(externalId: string, status: 'ESCALATED' | 'CLOSED', reason?: string): Promise<void> {
    try {
      const where = status === 'ESCALATED'
        ? { externalId, status: 'BOT' as const }
        : { externalId, status: { not: 'CLOSED' as const } };
      await this.prisma.chatbotConversation.updateMany({
        where,
        data: {
          status,
          ...(reason ? { escalationReason: reason.slice(0, 200), escalatedAt: new Date() } : {}),
        },
      });
    } catch (e) {
      this.logger.warn(`No se pudo actualizar estado local ${externalId}: ${(e as Error).message}`);
    }
  }

  private async findOrCreateConversation(first: IncomingChatwootMessage) {
    const externalId = this.convKey(first.accountId, first.conversationId);
    let conv = await this.prisma.chatbotConversation.findFirst({
      where: { channel: first.channel, externalId, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'desc' },
    });

    if (!conv) {
      conv = await this.prisma.chatbotConversation.create({
        data: {
          channel: first.channel,
          externalId,
          contactName: first.contactName,
          contactPhone: first.contactPhone,
          status: 'BOT',
        },
      });
    } else if (
      (first.contactName && first.contactName !== conv.contactName) ||
      (first.contactPhone && first.contactPhone !== conv.contactPhone)
    ) {
      conv = await this.prisma.chatbotConversation.update({
        where: { id: conv.id },
        data: {
          ...(first.contactName ? { contactName: first.contactName } : {}),
          ...(first.contactPhone ? { contactPhone: first.contactPhone } : {}),
        },
      });
    }

    return conv;
  }

  private async downloadCustomerImages(urls: string[]): Promise<string[]> {
    const allowed = [this.chatwootUrl(), this.spaces.cdnUrl('')].filter(Boolean);
    const token = this.botToken();
    const out: string[] = [];

    for (const url of urls.slice(0, MAX_INCOMING_IMAGES)) {
      if (!isSafeAttachmentUrl(url, allowed)) {
        this.logger.warn(`Adjunto ignorado por origen no permitido: ${url}`);
        continue;
      }
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_ATTACHMENT_BYTES) continue;
        const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        if (!ct.startsWith('image/')) continue;
        out.push(`data:${ct};base64,${buf.toString('base64')}`);
      } catch (e) {
        this.logger.warn(`No se pudo descargar adjunto de Chatwoot: ${(e as Error).message}`);
      }
    }
    return out;
  }

  /** Procesa un lote de mensajes agrupados de una misma conversacion (en serie, nunca en paralelo). */
  private async processBatch(key: string, batch: IncomingChatwootMessage[], startEpoch: number): Promise<void> {
    const first = batch[0];
    const { accountId, conversationId, channel } = first;

    // Si el bot esta apagado en Trinity, abrir en Chatwoot para que no quede colgado en pending.
    const cfg = await this.chatbot.getConfig();
    if (!cfg.enabled) {
      await this.handoffToHuman(accountId, conversationId, 'El bot está apagado en Trinity (Chatbot → Configuración).');
      return;
    }

    const conv = await this.findOrCreateConversation(first);
    if (conv.status !== 'BOT') {
      await this.toggleStatus(accountId, conversationId, 'open');
      return;
    }

    const combinedText = batch.map((m) => m.text).filter(Boolean).join('\n').trim();
    const allAttachments = batch.flatMap((m) => m.attachments);
    const imageUrls = allAttachments.filter((a) => a.fileType === 'image').map((a) => a.dataUrl);
    const hasUnsupportedOnly = !combinedText && imageUrls.length === 0 && allAttachments.length > 0;

    if (hasUnsupportedOnly) {
      await this.prisma.chatbotConversation.update({
        where: { id: conv.id },
        data: {
          status: 'ESCALATED',
          escalationReason: 'audio o archivo adjunto',
          escalationSummary: 'El cliente envió una nota de voz o archivo que el bot no puede procesar.',
          escalatedAt: new Date(),
        },
      });
      await this.sendText(accountId, conversationId, UNSUPPORTED_ATTACHMENT_REPLY, false);
      await this.handoffToHuman(
        accountId,
        conversationId,
        '🤖 Escalado por el bot\nMotivo: audio o archivo adjunto\nResumen: El cliente envió una nota de voz o archivo.',
      );
      return;
    }

    const images = imageUrls.length ? await this.downloadCustomerImages(imageUrls) : [];
    if (!combinedText && images.length === 0) return;

    // Si un asesor tomo la conversacion mientras descargabamos adjuntos, abortar.
    if (this.queue.epoch(key) !== startEpoch) return;

    let result: Awaited<ReturnType<ChatbotService['reply']>>;
    try {
      result = await this.chatbot.reply(conv.id, combinedText, images);
    } catch (e) {
      this.logger.error(`ChatbotService.reply falló para Chatwoot ${key}: ${(e as Error).message}`);
      await this.handoffToHuman(accountId, conversationId, `🤖 Error del bot: ${(e as Error).message}`);
      return;
    }

    // Verificar de nuevo si un asesor entro mientras la IA pensaba.
    if (this.queue.epoch(key) !== startEpoch) {
      this.logger.log(`Respuesta descartada para ${key}: un asesor tomó la conversación durante el turno`);
      return;
    }

    const productImages = Array.isArray(result.message.productImages) ? result.message.productImages : [];
    let replyText = result.message.text || '';
    if (channel === 'WEB' && productImages.length === 1) {
      replyText = appendWebProductLink(replyText, productImages, this.storeUrl());
    }

    const chunks = splitForChannel(replyText, channel);

    if (productImages.length > 0 && chunks.length > 0) {
      // Foto + texto juntos como pie de foto (en WhatsApp cuenta como 1 solo mensaje entregado).
      await this.sendImageWithCaption(accountId, conversationId, productImages[0].url, chunks[0]);
      for (const extraChunk of chunks.slice(1)) {
        await this.sendText(accountId, conversationId, extraChunk, false);
      }
      for (const extraImg of productImages.slice(1)) {
        await this.sendImageWithCaption(accountId, conversationId, extraImg.url, extraImg.name);
      }
    } else {
      for (const chunk of chunks) {
        await this.sendText(accountId, conversationId, chunk, false);
      }
    }

    if (result.status === 'ESCALATED') {
      const note = [
        '🤖 Escalado por el bot',
        `Motivo: ${result.escalationReason || 'sin especificar'}`,
        result.escalationSummary ? `Resumen: ${result.escalationSummary}` : null,
      ].filter(Boolean).join('\n');
      await this.handoffToHuman(accountId, conversationId, note);
    }
  }

  // ---------- Cliente REST hacia Chatwoot ----------

  private async handoffToHuman(accountId: number, conversationId: number, privateNote: string): Promise<void> {
    await this.sendText(accountId, conversationId, privateNote, true);
    await this.toggleStatus(accountId, conversationId, 'open');
  }

  private async sendText(accountId: number, conversationId: number, content: string, isPrivate: boolean): Promise<void> {
    const base = this.chatwootUrl();
    const token = this.botToken();
    if (!base || !token) {
      this.logger.warn('CHATWOOT_URL o CHATWOOT_BOT_TOKEN no configurado; no se pudo enviar mensaje');
      return;
    }
    const url = `${base}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, message_type: 'outgoing', private: isPrivate }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Chatwoot sendText ${res.status} en ${accountId}:${conversationId}: ${body.slice(0, 200)}`);
    }
  }

  private async sendImageWithCaption(accountId: number, conversationId: number, imageUrl: string, caption: string): Promise<void> {
    const base = this.chatwootUrl();
    const token = this.botToken();
    if (!base || !token) return;

    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const ct = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';

      const form = new FormData();
      form.append('content', caption);
      form.append('message_type', 'outgoing');
      form.append('private', 'false');
      form.append('attachments[]', new Blob([buf], { type: ct }), `producto.${ext}`);

      const url = `${base}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Chatwoot ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (e) {
      this.logger.warn(`No se pudo enviar foto a Chatwoot (${(e as Error).message}); enviando solo texto`);
      await this.sendText(accountId, conversationId, caption, false);
    }
  }

  private async toggleStatus(accountId: number, conversationId: number, status: 'open' | 'pending' | 'resolved'): Promise<void> {
    const base = this.chatwootUrl();
    const token = this.botToken();
    if (!base || !token) return;

    const url = `${base}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Chatwoot toggle_status(${status}) ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}
