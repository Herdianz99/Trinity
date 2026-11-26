import type { ChatbotChannel } from '@prisma/client';

export const INSTAGRAM_MAX_CHARS = 980;
export const DEFAULT_WEB_DEBOUNCE_MS = 4_500;
export const DEFAULT_SOCIAL_DEBOUNCE_MS = 8_000;
export const MAX_WEB_CARDS = 4;

export interface ChatwootCardAction {
  type: 'link';
  text: string;
  uri: string;
}

export interface ChatwootCardItem {
  media_url: string;
  title: string;
  description: string;
  actions: ChatwootCardAction[];
}

export interface WebStoreProduct {
  code: string;
  name: string;
  priceUsd: number;
  imageUrl: string | null;
  available?: boolean;
}

export interface WebProductCandidate {
  code: string;
  available?: boolean;
}

export interface BuiltWebCards {
  items: ChatwootCardItem[];
  cardCodes: string[];
  fallbackText: string;
  linkOnlyProducts: { code: string; name: string; url: string }[];
}

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

/**
 * Slug de producto identico al de `store-export.builder.ts` (`${slugify(name)}-${code.toLowerCase()}`).
 * Se mantiene puro aqui para que `chatwoot.check.ts` corra con Node sin dependencias externas.
 */
export function buildStoreProductSlug(name: string, code: string): string {
  const base = (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const cleanCode = (code || '').trim().toLowerCase();
  return cleanCode ? `${base}-${cleanCode}` : base;
}

/** URL directa a la ficha del producto en la tienda online (`/productos/<slug>`). */
export function buildStoreProductUrl(storeUrl: string | null | undefined, name: string, code: string): string | null {
  const base = (storeUrl || '').trim().replace(/\/+$/, '');
  const cleanCode = (code || '').trim();
  if (!base || !cleanCode) return null;
  const slug = buildStoreProductSlug(name, cleanCode);
  return `${base}/productos/${encodeURIComponent(slug)}`;
}

/**
 * Une y deduplica los productos cotizados en el turno (fotos enviadas por `enviar_foto` + productos de
 * `buscar_productos` cuyo precio salio en la respuesta), preservando orden y tope de tarjetas.
 */
export function collectWebCandidateProducts(
  productImages: { code: string; name?: string }[],
  mentioned: { codigo: string; disponible?: boolean }[],
  maxCards = MAX_WEB_CARDS,
): WebProductCandidate[] {
  const availabilityByCode = new Map<string, boolean | undefined>();
  for (const m of mentioned) {
    const code = (m.codigo || '').trim();
    if (code && !availabilityByCode.has(code)) availabilityByCode.set(code, m.disponible);
  }

  const seen = new Set<string>();
  const out: WebProductCandidate[] = [];
  const push = (rawCode: string, available?: boolean) => {
    const code = (rawCode || '').trim();
    if (!code || seen.has(code) || out.length >= maxCards) return;
    seen.add(code);
    out.push({ code, available });
  };

  for (const img of productImages) {
    const code = (img.code || '').trim();
    push(code, availabilityByCode.get(code));
  }
  for (const m of mentioned) {
    push(m.codigo, m.disponible);
  }
  return out;
}

function isHttpUrl(raw?: string | null): raw is string {
  if (!raw) return false;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Construye tarjetas interactivas (`content_type: 'cards'`) para el widget web de Chatwoot.
 * - Productos publicados CON foto -> tarjeta visual (foto + nombre + precio + boton "Ver en la tienda").
 * - Productos publicados SIN foto -> `linkOnlyProducts` para anexar enlace directo sin imagen rota.
 */
export function buildChatwootProductCards(
  products: WebStoreProduct[],
  storeUrl?: string | null,
  maxCards = MAX_WEB_CARDS,
): BuiltWebCards {
  const items: ChatwootCardItem[] = [];
  const cardCodes: string[] = [];
  const linkOnlyProducts: { code: string; name: string; url: string }[] = [];
  const seen = new Set<string>();

  for (const p of products) {
    const code = (p.code || '').trim();
    if (!code || seen.has(code)) continue;
    if (items.length + linkOnlyProducts.length >= maxCards) break;
    seen.add(code);

    const uri = buildStoreProductUrl(storeUrl, p.name, code);
    if (!uri) continue;

    const title = (p.name || code).trim().slice(0, 120);
    if (isHttpUrl(p.imageUrl)) {
      const priceLabel = `${(Math.round(Number(p.priceUsd) * 100) / 100).toFixed(2)}$ bcv`;
      const availLabel = p.available === true ? ' · Disponible' : p.available === false ? ' · Agotado' : '';
      items.push({
        media_url: p.imageUrl.trim(),
        title,
        description: `${priceLabel}${availLabel}`,
        actions: [{ type: 'link', text: 'Ver en la tienda', uri }],
      });
      cardCodes.push(code);
    } else {
      linkOnlyProducts.push({ code, name: title, url: uri });
    }
  }

  const fallbackText =
    items.length === 1
      ? `Ver en la tienda: ${items[0].title} (${items[0].actions[0].uri})`
      : items.length > 1
        ? `Productos en la tienda:\n${items.map((it) => `- ${it.title}: ${it.actions[0].uri}`).join('\n')}`
        : '';

  return { items, cardCodes, fallbackText, linkOnlyProducts };
}

/** En el chat web agrega enlace(s) directo(s) al texto para productos publicados sin foto (o respaldo). */
export function appendWebProductLinks(text: string, links: { name: string; url: string }[]): string {
  const pending = links.filter((l) => l.url && !text.includes(l.url));
  if (!pending.length) return text;
  if (pending.length === 1) {
    return `${text}\n\nVer en la tienda: ${pending[0].url}`;
  }
  const block = pending.map((l) => `- ${l.name}: ${l.url}`).join('\n');
  return `${text}\n\nVer en la tienda:\n${block}`;
}
