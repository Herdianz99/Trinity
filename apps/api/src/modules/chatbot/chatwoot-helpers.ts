import type { ChatbotChannel } from '@prisma/client';

export const INSTAGRAM_MAX_CHARS = 980;
export const DEFAULT_WEB_DEBOUNCE_MS = 4_500;
export const DEFAULT_SOCIAL_DEBOUNCE_MS = 8_000;

export interface ParsedChatwootAttachment {
  fileType: string;
  dataUrl: string;
}

export interface IncomingChatwootMessage {
  kind: 'incoming';
  accountId: number;
  conversationId: number;
  conversationStatus: string;
  messageId: number;
  channel: ChatbotChannel;
  text: string;
  attachments: ParsedChatwootAttachment[];
  contactName: string | null;
  contactPhone: string | null;
}

export interface HumanRepliedEvent {
  kind: 'human_replied';
  accountId: number;
  conversationId: number;
}

export interface StatusChangedEvent {
  kind: 'status_changed';
  accountId: number;
  conversationId: number;
  status: string;
}

export type ParsedChatwootEvent =
  | IncomingChatwootMessage
  | HumanRepliedEvent
  | StatusChangedEvent
  | { kind: 'ignore'; reason: string };

/** Mapea el tipo de canal de Chatwoot al enum ChatbotChannel de Trinity. */
export function mapChatwootChannel(raw?: string | null): ChatbotChannel {
  const s = (raw || '').toLowerCase();
  if (s.includes('whatsapp') || s.includes('twilio')) return 'WHATSAPP';
  if (s.includes('instagram')) return 'INSTAGRAM';
  if (s.includes('facebook')) return 'FACEBOOK';
  return 'WEB';
}

/** Interpreta un payload crudo de webhook de Chatwoot (Agent Bot o Account Webhook). */
export function parseChatwootPayload(payload: Record<string, any> | null | undefined): ParsedChatwootEvent {
  if (!payload || typeof payload !== 'object') return { kind: 'ignore', reason: 'empty_payload' };

  const event = String(payload.event || '');
  const accountId = Number(payload.account?.id ?? payload.conversation?.account_id ?? 0);

  if (event === 'conversation_status_changed') {
    const conversationId = Number(payload.id ?? payload.conversation?.id ?? 0);
    const status = String(payload.status ?? payload.conversation?.status ?? '').toLowerCase();
    if (!accountId || !conversationId || !status) return { kind: 'ignore', reason: 'incomplete_status_event' };
    return { kind: 'status_changed', accountId, conversationId, status };
  }

  if (event !== 'message_created') return { kind: 'ignore', reason: `event_${event || 'unknown'}` };

  const conversationId = Number(payload.conversation?.id ?? payload.conversation_id ?? 0);
  if (!accountId || !conversationId) return { kind: 'ignore', reason: 'missing_ids' };

  // Notas privadas internas de asesores nunca deben disparar al bot.
  if (payload.private === true) return { kind: 'ignore', reason: 'private_note' };

  const msgType = payload.message_type;
  const senderType = String(payload.sender?.type || '').toLowerCase();

  // Mensaje saliente enviado por un asesor humano (incluye eco de WhatsApp coexistencia):
  // silencia al bot en esa conversacion.
  const isOutgoing = msgType === 'outgoing' || msgType === 1;
  if (isOutgoing) {
    if (senderType === 'user') {
      return { kind: 'human_replied', accountId, conversationId };
    }
    return { kind: 'ignore', reason: `outgoing_${senderType || 'bot'}` };
  }

  const isIncoming = msgType === 'incoming' || msgType === 0;
  if (!isIncoming) return { kind: 'ignore', reason: `message_type_${String(msgType)}` };

  const messageId = Number(payload.id ?? 0);
  const conversationStatus = String(payload.conversation?.status ?? '').toLowerCase();
  const rawChannel =
    payload.conversation?.channel ??
    payload.inbox?.channel_type ??
    payload.conversation?.meta?.channel ??
    '';

  const contact = payload.conversation?.meta?.sender ?? payload.conversation?.contact ?? payload.sender ?? {};
  const contactName = typeof contact.name === 'string' && contact.name.trim() ? contact.name.trim().slice(0, 120) : null;
  const rawPhone = contact.phone_number ?? contact.phone ?? null;
  const contactPhone = typeof rawPhone === 'string' && rawPhone.trim() ? rawPhone.trim().slice(0, 40) : null;

  const rawAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const attachments: ParsedChatwootAttachment[] = rawAttachments
    .filter((a: any) => a && typeof a.data_url === 'string' && a.data_url.trim())
    .map((a: any) => ({
      fileType: String(a.file_type || 'file').toLowerCase(),
      dataUrl: String(a.data_url).trim(),
    }));

  return {
    kind: 'incoming',
    accountId,
    conversationId,
    conversationStatus,
    messageId,
    channel: mapChatwootChannel(rawChannel),
    text: typeof payload.content === 'string' ? payload.content.trim() : '',
    attachments,
    contactName,
    contactPhone,
  };
}

/** Evita SSRF: solo permite descargar adjuntos del propio servidor de Chatwoot (o CDN de confianza). */
export function isSafeAttachmentUrl(rawUrl: string, allowedBaseUrls: string[]): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return allowedBaseUrls.some((base) => {
      if (!base) return false;
      try {
        return new URL(base).origin === parsed.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Divide mensajes largos para canales con tope estricto (Instagram = 1.000 caracteres).
 * Corta preferiblemente por parrafo, linea o frase para no partir precios ni palabras.
 */
export function splitForChannel(text: string, channel: ChatbotChannel, maxLen = INSTAGRAM_MAX_CHARS): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];
  if (channel !== 'INSTAGRAM' || clean.length <= maxLen) return [clean];

  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > maxLen) {
    const slice = rest.slice(0, maxLen);
    let cut = slice.lastIndexOf('\n\n');
    if (cut < maxLen * 0.4) cut = slice.lastIndexOf('\n');
    if (cut < maxLen * 0.4) cut = slice.lastIndexOf('. ');
    if (cut < maxLen * 0.4) cut = slice.lastIndexOf(' ');
    if (cut <= 0) cut = maxLen;
    else if (slice[cut] === '.') cut += 1;

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Evalua si una hora (0..23 en Caracas) cae dentro del horario de atencion humana configurado
 * en formato "inicio-fin" (ej. "8-17" = de 8:00 a 16:59; "18-8" = cruza medianoche).
 * Vacio o invalido -> false (el bot atiende 24h).
 */
export function isWithinHourRange(hour: number, spec?: string | null): boolean {
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(spec || '');
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start < 0 || start > 23 || end < 0 || end > 23 || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** En el chat de la tienda web agrega enlace al producto cotizado si viene configurado STORE_URL. */
export function appendWebProductLink(text: string, images: { code: string; name: string }[], storeUrl?: string | null): string {
  const base = (storeUrl || '').trim().replace(/\/+$/, '');
  if (!base || images.length !== 1) return text;
  const code = images[0].code;
  if (!code || text.includes(base)) return text;
  return `${text}\n\nVer en la tienda: ${base}/productos?q=${encodeURIComponent(code)}`;
}
