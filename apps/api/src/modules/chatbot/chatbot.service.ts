import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { ChatbotConfig, ChatbotConversationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { parseDataUri } from '../product-images/image-processing';
import { caracasDayStart, caracasToday } from '../../common/timezone';
import { ChatbotToolsService, ProductImageOut } from './chatbot-tools.service';
import { ChatbotCrossSellService } from './chatbot-cross-sell.service';
import { buildChatbotSystemPrompt } from './chatbot-prompt';
import { numbersIn, unverifiedPrices } from './price-guard';
import { chatbotCostUsd } from './chatbot-pricing';
import { UpdateChatbotConfigDto } from './dto/chatbot.dto';

const sharp = require('sharp') as typeof import('sharp').default;

const MAX_TOOL_ROUNDS = 6;
const MAX_IMAGES = 4;
// Herramientas que acompanan la respuesta al cliente: el texto de su vuelta se conserva.
const REPLY_TOOLS = new Set(['enviar_foto', 'escalar_a_asesor']);
const FALLBACK_TEXT ='En este momento no puedo responderte. Te paso con un asesor que te atenderá en breve.';

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_productos',
    description:
      'Busca productos en el inventario de la tienda (precio, disponibilidad, marca, si tiene foto). ' +
      'Pasa las palabras del cliente tal cual (ej. "cabilla 3/8", "cemento", "cable #8"). Devuelve hasta 10 productos. ' +
      'Los productos disponibles pueden traer "ofrecer_tambien" (complementos para ofrecer).',
    input_schema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Lo que busca el cliente, con sus palabras' },
        cantidad: {
          type: 'number',
          description: 'Solo si el cliente dijo cuántas quiere (ej. "20 sacos" -> 20). Cada producto trae "alcanza" (si hay esa cantidad).',
        },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'enviar_foto',
    description: 'Envía al cliente la foto principal de un producto (por su código, tomado de buscar_productos).',
    input_schema: {
      type: 'object',
      properties: { codigo: { type: 'string', description: 'Código del producto' } },
      required: ['codigo'],
    },
  },
  {
    name: 'calcular_bolivares',
    description:
      'Convierte a bolívares con la tasa BCV del día. Úsala SOLO si el cliente pide el monto en Bs. ' +
      'Pasa el código del producto, o un monto en dólares (ej. un total).',
    input_schema: {
      type: 'object',
      properties: {
        codigo: { type: 'string', description: 'Código del producto (opcional)' },
        monto_usd: { type: 'number', description: 'Monto en dólares BCV (opcional)' },
      },
    },
  },
  {
    name: 'escalar_a_asesor',
    description:
      'Pasa la conversación a un asesor humano, solo en los casos indicados en tus instrucciones. ' +
      'NO la uses para preguntas de precio, disponibilidad o fotos: esas las respondes tú (salvo que no alcance la cantidad pedida). ' +
      'Después de usarla solo despídete; no sigas cotizando.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo corto (ej. "pregunta técnica", "cerrar compra", "delivery")' },
        resumen: { type: 'string', description: 'Resumen para el asesor: qué quiere el cliente y qué se le cotizó' },
        codigo: { type: 'string', description: 'Solo si escalas porque no alcanza la cantidad: código del producto' },
        cantidad: { type: 'number', description: 'Solo si escalas porque no alcanza la cantidad: cuántas pidió el cliente' },
      },
      required: ['motivo', 'resumen'],
    },
  },
];

export interface ToolCallLog {
  name: string;
  input: unknown;
  result: unknown;
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private client: Anthropic | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private tools: ChatbotToolsService,
    private spaces: SpacesService,
    private crossSell: ChatbotCrossSellService,
  ) {}

  private apiKey(): string {
    return (this.config.get<string>('ANTHROPIC_API_KEY') || '').trim();
  }

  private anthropic(): Anthropic {
    if (!this.client) this.client = new Anthropic({ apiKey: this.apiKey(), maxRetries: 2, timeout: 60_000 });
    return this.client;
  }

  // ---------- Configuracion ----------

  async getConfig(): Promise<ChatbotConfig> {
    return this.prisma.chatbotConfig.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } });
  }

  async getConfigView() {
    // crossSellAnalyzedAt no va: la pantalla de Configuracion reenvia todo en el PATCH y el DTO lo rechazaria
    // (la fecha del analisis la da GET /chatbot/cross-sell/rules).
    const { crossSellAnalyzedAt: _analyzedAt, ...cfg } = await this.getConfig();
    return { ...cfg, apiKeyConfigured: !!this.apiKey() };
  }

  async updateConfig(dto: UpdateChatbotConfigDto) {
    await this.getConfig();
    const data: Prisma.ChatbotConfigUpdateInput = { ...dto };
    await this.prisma.chatbotConfig.update({ where: { id: 'default' }, data });
    return this.getConfigView();
  }

  // ---------- Conversaciones ----------

  async createTestConversation(userId: string) {
    return this.prisma.chatbotConversation.create({
      data: { channel: 'TEST', contactName: 'Prueba', createdById: userId },
    });
  }

  async listConversations(status?: string) {
    const where: Prisma.ChatbotConversationWhereInput = { messages: { some: {} } }; // sin las vacias
    if (status && ['BOT', 'ESCALATED', 'CLOSED'].includes(status)) where.status = status as ChatbotConversationStatus;
    const rows = await this.prisma.chatbotConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { messages: true } },
        messages: { where: { role: 'USER' }, orderBy: { createdAt: 'asc' }, take: 1, select: { text: true } },
      },
    });
    return rows.map(({ messages, _count, ...c }) => ({
      ...c,
      messageCount: _count.messages,
      firstMessage: messages[0]?.text ?? '',
    }));
  }

  async getConversation(id: string) {
    const conv = await this.prisma.chatbotConversation.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, role: true, text: true, imageUrls: true, productImages: true, toolCalls: true,
            inputTokens: true, outputTokens: true, cacheReadTokens: true, costUsd: true, rating: true, createdAt: true,
          },
        },
      },
    });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    return conv;
  }

  async rateMessage(id: string, rating: number) {
    const msg = await this.prisma.chatbotMessage.findUnique({ where: { id }, select: { role: true } });
    if (!msg || msg.role !== 'BOT') throw new NotFoundException('Respuesta del bot no encontrada');
    return this.prisma.chatbotMessage.update({
      where: { id },
      data: { rating: rating === 0 ? null : rating, ratedAt: rating === 0 ? null : new Date() },
      select: { id: true, rating: true },
    });
  }

  async resetConversation(id: string) {
    await this.getConversation(id);
    return this.prisma.chatbotConversation.update({
      where: { id },
      data: { status: 'BOT', escalationReason: null, escalationSummary: null, escalatedAt: null },
    });
  }

  private monthStart(): Date {
    return caracasDayStart(`${caracasToday().slice(0, 7)}-01`);
  }

  async monthCostUsd(): Promise<number> {
    const agg = await this.prisma.chatbotMessage.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: this.monthStart() } },
    });
    return agg._sum.costUsd ?? 0;
  }

  async stats() {
    const since = this.monthStart();
    const [cfg, cost, conversations, escalated, good, bad] = await Promise.all([
      this.getConfig(),
      this.monthCostUsd(),
      this.prisma.chatbotConversation.count({ where: { createdAt: { gte: since }, messages: { some: {} } } }),
      this.prisma.chatbotConversation.count({ where: { createdAt: { gte: since }, status: 'ESCALATED' } }),
      this.prisma.chatbotMessage.count({ where: { createdAt: { gte: since }, rating: 1 } }),
      this.prisma.chatbotMessage.count({ where: { createdAt: { gte: since }, rating: -1 } }),
    ]);
    return { monthCostUsd: cost, monthlyBudgetUsd: cfg.monthlyBudgetUsd, conversations, escalated, ratedGood: good, ratedBad: bad };
  }

  async missedSearches(days = 30) {
    const since = new Date(Date.now() - Math.max(1, Math.min(days, 365)) * 86_400_000);
    return this.prisma.$queryRaw<{ query: string; times: number; lastAt: Date }[]>`
      SELECT lower(trim(query)) AS query, COUNT(*)::int AS times, MAX("createdAt") AS "lastAt"
      FROM "ChatbotSearchLog"
      WHERE "resultCount" = 0 AND "createdAt" >= ${since}
      GROUP BY lower(trim(query))
      ORDER BY times DESC, "lastAt" DESC
      LIMIT 300`;
  }

  // Solo imagenes de NUESTRO CDN (evita usar el endpoint para descargar URLs arbitrarias).
  async imagePng(url: string): Promise<Buffer> {
    const base = this.spaces.cdnUrl('');
    if (!url || !url.startsWith(base)) throw new BadRequestException('URL de imagen no permitida');
    const res = await fetch(url);
    if (!res.ok) throw new NotFoundException('No se pudo leer la imagen');
    const buf = Buffer.from(await res.arrayBuffer());
    return sharp(buf, { failOn: 'none' }).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  }

  async testSearch(q: string) {
    return this.tools.searchProducts(await this.getConfig(), null, q);
  }

  // ---------- Responder ----------

  private async escalate(conversationId: string, reason: string, summary: string) {
    await this.prisma.chatbotConversation.update({
      where: { id: conversationId },
      data: { status: 'ESCALATED', escalationReason: reason.slice(0, 200), escalationSummary: summary.slice(0, 2000), escalatedAt: new Date() },
    });
  }

  // Fotos del cliente: se normalizan (JPEG <= 1200px) y se suben a Spaces; la IA las lee por URL.
  private async uploadCustomerImages(conversationId: string, images: string[]): Promise<string[]> {
    const urls: string[] = [];
    for (const dataUri of images.slice(0, MAX_IMAGES)) {
      const { buffer } = parseDataUri(dataUri);
      const jpg = await sharp(buffer, { failOn: 'none' }).rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      urls.push(await this.spaces.uploadPublic(`chatbot/${conversationId}/${randomUUID()}.jpg`, jpg, 'image/jpeg'));
    }
    return urls;
  }

  // Historial para la IA: los turnos crudos guardados en orden (append-only; los bloques de
  // razonamiento se reenvian intactos, como exige el modelo).
  private async history(conversationId: string): Promise<Anthropic.MessageParam[]> {
    const msgs = await this.prisma.chatbotMessage.findMany({
      where: { conversationId, apiContent: { not: Prisma.DbNull } },
      orderBy: { createdAt: 'asc' },
      select: { apiContent: true },
    });
    return msgs.flatMap((m) => (m.apiContent as unknown as Anthropic.MessageParam[]) ?? []);
  }

  private async runTool(
    cfg: ChatbotConfig,
    conversationId: string,
    block: Anthropic.ToolUseBlock,
    out: { images: ProductImageOut[]; escalated: boolean },
  ): Promise<unknown> {
    const input = (block.input ?? {}) as Record<string, any>;
    switch (block.name) {
      case 'buscar_productos':
        return this.tools.searchProducts(
          cfg, conversationId, String(input.consulta ?? ''),
          input.cantidad !== undefined ? Number(input.cantidad) : undefined,
        );
      case 'enviar_foto': {
        const img = await this.tools.productImage(String(input.codigo ?? ''));
        if (!img) return { error: 'Ese producto no tiene foto. Dilo, o pasa a un asesor si el cliente la necesita.' };
        if (!out.images.some((i) => i.code === img.code)) out.images.push(img);
        const extra = await this.tools.crossSellFor(conversationId, img.code);
        return {
          ok: true,
          enviada: img.name,
          ...(extra.length
            ? { ofrecer_tambien: extra, nota: 'Si estás cotizando este producto, menciona también estos complementos (el tipo, no un producto) en esta misma respuesta.' }
            : {}),
        };
      }
      case 'calcular_bolivares':
        return this.tools.toBolivares(
          input.monto_usd !== undefined ? Number(input.monto_usd) : undefined,
          input.codigo ? String(input.codigo) : undefined,
        );
      case 'escalar_a_asesor': {
        // El bot no conoce la existencia exacta: se agrega aqui al resumen para que el asesor no la busque.
        const note = input.codigo
          ? await this.tools.stockNote(String(input.codigo), input.cantidad !== undefined ? Number(input.cantidad) : undefined)
          : null;
        const summary = String(input.resumen ?? '');
        await this.escalate(conversationId, String(input.motivo ?? 'sin motivo'), note ? `${summary}\n${note}` : summary);
        out.escalated = true;
        return { ok: true, nota: 'Conversación pasada a un asesor. Despídete brevemente.' };
      }
      default:
        return { error: `Herramienta desconocida: ${block.name}` };
    }
  }

  async reply(conversationId: string, text: string, images: string[] = []) {
    const conv = await this.prisma.chatbotConversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    if (conv.status !== 'BOT') throw new ConflictException('Esta conversación ya la está atendiendo un asesor');
    const cfg = await this.getConfig();
    if (!cfg.enabled) throw new ConflictException('El bot está apagado (Chatbot → Configuración)');
    if (!this.apiKey()) throw new ConflictException('Falta configurar ANTHROPIC_API_KEY en el servidor');
    const clean = (text || '').trim().slice(0, 2000);
    if (!clean && images.length === 0) throw new ConflictException('Mensaje vacío');

    const imageUrls = images.length ? await this.uploadCustomerImages(conversationId, images) : [];
    const userContent: Anthropic.ContentBlockParam[] = [
      ...imageUrls.map((url): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'url', url } })),
      ...(clean ? [{ type: 'text' as const, text: clean }] : [{ type: 'text' as const, text: '(el cliente envió una foto)' }]),
    ];
    const userTurn: Anthropic.MessageParam = { role: 'user', content: userContent };
    await this.prisma.chatbotMessage.create({
      data: { conversationId, role: 'USER', text: clean, imageUrls, apiContent: [userTurn] as unknown as Prisma.InputJsonValue },
    });

    // Tope de gasto mensual: no se llama a la IA.
    if ((await this.monthCostUsd()) >= cfg.monthlyBudgetUsd) {
      await this.escalate(conversationId, 'tope_gasto', 'Se alcanzó el tope de gasto mensual del bot');
      return this.saveBotMessage(conversationId, FALLBACK_TEXT, { escalated: true });
    }

    const company = await this.prisma.companyConfig.findFirst({ select: { companyName: true } });
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: buildChatbotSystemPrompt(cfg, company?.companyName ?? ''), cache_control: { type: 'ephemeral' } },
    ];
    const messages = await this.history(conversationId);
    const newTurns: Anthropic.MessageParam[] = [];
    const toolLog: ToolCallLog[] = [];
    const out = { images: [] as ProductImageOut[], escalated: false };
    const usage = { input: 0, output: 0, cacheRead: 0, cost: 0 };
    // Texto de las vueltas intermedias: el modelo a veces escribe la cotizacion y en la misma vuelta llama a
    // enviar_foto o escalar_a_asesor; si solo se tomara la ultima vuelta, esa parte se perderia. En vueltas
    // que solo buscan o calculan, el texto es el modelo pensando en voz alta ("Let me try one more search…")
    // y no debe llegar al cliente.
    const texts: string[] = [];
    const collectText = (content: Anthropic.ContentBlock[]) => {
      const t = content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (t) texts.push(t);
    };
    let finalText = '';
    let failure: string | null = null;

    try {
      for (let round = 0; ; round++) {
        if (round >= MAX_TOOL_ROUNDS) { failure = 'demasiadas_vueltas'; break; }
        const res = await this.anthropic().messages.create({
          model: cfg.model,
          max_tokens: 4096,
          system,
          tools: TOOLS,
          messages: [...messages, ...newTurns],
          output_config: { effort: cfg.effort as 'low' | 'medium' | 'high' },
        });
        usage.input += res.usage.input_tokens;
        usage.output += res.usage.output_tokens;
        usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
        usage.cost += chatbotCostUsd(cfg.model, res.usage);

        if (res.stop_reason === 'tool_use') {
          newTurns.push({ role: 'assistant', content: res.content as Anthropic.ContentBlockParam[] });
          const toolBlocks = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
          if (toolBlocks.some((b) => REPLY_TOOLS.has(b.name))) collectText(res.content);
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolBlocks) {
            let result: unknown;
            try {
              // Haiku a veces agrega en paralelo un escalar_a_asesor basura (motivo "prueba", resumen
              // "PLACEHOLDER") junto a enviar_foto. Escalar de verdad es siempre una accion sola.
              if (block.name === 'escalar_a_asesor' && toolBlocks.length > 1) {
                result = { ignorado: true, nota: 'No se escaló: escalar debe ser la única acción del turno. Si de verdad corresponde, hazlo solo.' };
              } else {
                result = await this.runTool(cfg, conversationId, block, out);
              }
            } catch (e) {
              this.logger.error(`Herramienta ${block.name} falló: ${(e as Error).message}`);
              result = { error: 'La herramienta falló. Pasa la conversación a un asesor.' };
            }
            toolLog.push({ name: block.name, input: block.input, result });
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
          }
          newTurns.push({ role: 'user', content: results });
          continue;
        }
        if (res.stop_reason === 'end_turn' || res.stop_reason === 'stop_sequence') {
          newTurns.push({ role: 'assistant', content: res.content as Anthropic.ContentBlockParam[] });
          collectText(res.content);
          finalText = texts.join('\n\n');
          break;
        }
        failure = `stop_${res.stop_reason}`;
        break;
      }
    } catch (e) {
      this.logger.error(`Error de la IA en conversación ${conversationId}: ${(e as Error).message}`);
      failure = e instanceof Anthropic.APIError ? `error_ia_${e.status ?? 'red'}` : 'error_ia';
    }

    // Control de precios: todo monto en $ debe salir de una herramienta (ver price-guard.ts). Si no, se le pide
    // una vez que reescriba sin herramientas; si vuelve a fallar, no se envia y pasa a un asesor.
    if (!failure && finalText) {
      try {
        const { known, quantities } = await this.priceEvidence(conversationId, cfg, clean, toolLog);
        const bad = unverifiedPrices(finalText, known, quantities);
        if (bad.length) {
          this.logger.warn(`Conversación ${conversationId}: precios sin respaldo ${bad.join(', ')}; se pide reescribir`);
          const flawed = newTurns.pop()!;
          const res = await this.anthropic().messages.create({
            model: cfg.model,
            max_tokens: 4096,
            system,
            tools: TOOLS,
            tool_choice: { type: 'none' },
            messages: [...messages, ...newTurns, flawed, {
              role: 'user',
              content: `[Revisión automática, no la escribió el cliente] Tu respuesta tiene precios que no salieron de ninguna herramienta: ${bad.map((b) => `${b}$`).join(', ')}. `
                + 'Reescribe la respuesta COMPLETA para el cliente usando solo los precios exactos de los resultados (o cantidad × precio). No menciones esta revisión.',
            }],
            output_config: { effort: cfg.effort as 'low' | 'medium' | 'high' },
          });
          usage.input += res.usage.input_tokens;
          usage.output += res.usage.output_tokens;
          usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
          usage.cost += chatbotCostUsd(cfg.model, res.usage);
          const fixed = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
          if (res.stop_reason === 'end_turn' && fixed && !unverifiedPrices(fixed, known, quantities).length) {
            newTurns.push({ role: 'assistant', content: res.content as Anthropic.ContentBlockParam[] });
            finalText = fixed;
          } else {
            failure = 'precio_no_verificado';
          }
        }
      } catch (e) {
        this.logger.error(`Control de precios falló en ${conversationId}: ${(e as Error).message}`);
        failure = 'precio_no_verificado';
      }
    }

    if (failure || !finalText) {
      if (!out.escalated) await this.escalate(conversationId, failure ?? 'respuesta_vacia', 'El bot no pudo responder; revisar la conversación');
      // Si fallo a mitad del bucle no se guardan los turnos parciales (el historial debe quedar valido).
      return this.saveBotMessage(conversationId, FALLBACK_TEXT, {
        escalated: true, toolLog, usage, images: out.images, apiTurns: failure ? null : newTurns,
      });
    }
    // Venta cruzada: marcar como ofrecido lo que la respuesta realmente menciono (nunca rompe la respuesta).
    await this.crossSell.recordOffered(conversationId, toolLog, finalText).catch((e) =>
      this.logger.error(`Venta cruzada: no se pudo registrar lo ofrecido: ${(e as Error).message}`));
    return this.saveBotMessage(conversationId, finalText, {
      escalated: out.escalated, toolLog, usage, images: out.images, apiTurns: newTurns,
    });
  }

  // Numeros que respaldan un precio (resultados de herramientas de toda la conversacion + textos de la
  // configuracion, ej. el costo del delivery) y cantidades mencionadas (cliente + input de herramientas).
  private async priceEvidence(conversationId: string, cfg: ChatbotConfig, userText: string, toolLog: ToolCallLog[]) {
    const prev = await this.prisma.chatbotMessage.findMany({
      where: { conversationId },
      select: { role: true, text: true, toolCalls: true },
    });
    const calls = [...prev.flatMap((m) => (Array.isArray(m.toolCalls) ? (m.toolCalls as unknown as ToolCallLog[]) : [])), ...toolLog];
    const known = [
      ...calls.flatMap((t) => numbersIn(JSON.stringify(t.result ?? ''))),
      ...numbersIn([cfg.addressText, cfg.hoursText, cfg.deliveryText, cfg.paymentText, cfg.partnersText, cfg.extraInfo].join(' ')),
    ];
    const quantities = [
      ...prev.filter((m) => m.role === 'USER').flatMap((m) => numbersIn(m.text ?? '')),
      ...numbersIn(userText),
      ...calls.flatMap((t) => numbersIn(JSON.stringify(t.input ?? ''))),
    ];
    return { known, quantities };
  }

  private async saveBotMessage(
    conversationId: string,
    text: string,
    o: {
      escalated: boolean;
      toolLog?: ToolCallLog[];
      usage?: { input: number; output: number; cacheRead: number; cost: number };
      images?: ProductImageOut[];
      apiTurns?: Anthropic.MessageParam[] | null;
    },
  ) {
    const u = o.usage ?? { input: 0, output: 0, cacheRead: 0, cost: 0 };
    const msg = await this.prisma.chatbotMessage.create({
      data: {
        conversationId,
        role: 'BOT',
        text,
        productImages: (o.images ?? []) as unknown as Prisma.InputJsonValue,
        toolCalls: (o.toolLog ?? []) as unknown as Prisma.InputJsonValue,
        apiContent: o.apiTurns ? (o.apiTurns as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        inputTokens: u.input,
        outputTokens: u.output,
        cacheReadTokens: u.cacheRead,
        costUsd: u.cost,
      },
    });
    const conv = await this.prisma.chatbotConversation.update({
      where: { id: conversationId },
      data: {
        costUsd: { increment: u.cost },
        inputTokens: { increment: u.input },
        outputTokens: { increment: u.output },
      },
    });
    return {
      message: {
        id: msg.id, role: msg.role, text: msg.text, productImages: o.images ?? [], toolCalls: o.toolLog ?? [],
        inputTokens: u.input, outputTokens: u.output, cacheReadTokens: u.cacheRead, costUsd: u.cost, rating: null, createdAt: msg.createdAt,
      },
      status: conv.status,
      escalationReason: conv.escalationReason,
      escalationSummary: conv.escalationSummary,
    };
  }
}
