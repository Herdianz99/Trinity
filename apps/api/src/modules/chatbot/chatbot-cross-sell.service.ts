import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CrossSellRuleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { productSearchTsQuery } from '../../common/product-search';
import { VARIANT_RE, extractMeasures, normalizeTerm, ruleKey, wasOffered } from './cross-sell-utils';
import { CrossSellRuleDto, TestCrossSellRuleDto, UpdateCrossSellRuleDto } from './dto/cross-sell.dto';

const SOURCE_PRODUCTS = 10;  // productos DISPONIBLES del resultado que llevan sugerencias (el cliente puede elegir cualquiera)
const MAX_PER_PRODUCT = 2;   // maximo de complementos por producto cotizado
const RULES_TTL_MS = 60_000;

type ActiveRule = { id: string; trigger: string; offerTerms: string[]; excludeTerms: string[]; useMeasure: boolean };
type CandRow = { id: string; name: string; stock: number };
type Availability = { measure: string | null; count: number };

// Que ofrecer: el TIPO de producto ("brochas", "discos de corte"), nunca uno especifico: hay muchos tamaños y
// marcas y el bot no puede elegir por el cliente. measure = medida del producto cotizado cuando hay complementos
// disponibles de esa misma medida ("discos de corte para 4-1/2"). count = cuantos hay (solo para la pantalla).
export interface CrossSellOffer extends Availability { ruleId: string; term: string }

@Injectable()
export class ChatbotCrossSellService {
  private cache: { at: number; rules: ActiveRule[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
  ) {}

  invalidate() { this.cache = null; }

  private async activeRules(): Promise<ActiveRule[]> {
    if (this.cache && Date.now() - this.cache.at < RULES_TTL_MS) return this.cache.rules;
    const rules = await this.prisma.chatbotCrossSellRule.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, trigger: true, offerTerms: true, excludeTerms: true, useMeasure: true },
      orderBy: { createdAt: 'asc' },
    });
    this.cache = { at: Date.now(), rules };
    return rules;
  }

  // tsquery OR de varios terminos: "(a:* & b:*) | (c:*)". '' si no hay ninguno.
  private orTsQuery(terms: string[]): string {
    return terms.map(productSearchTsQuery).filter(Boolean).map((q) => `(${q})`).join(' | ');
  }

  // productId -> ids de reglas cuyo trigger coincide con el producto (y ningun termino excluido).
  private async matchRules(productIds: string[], rules: ActiveRule[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const usable = rules
      .map((r) => ({ id: r.id, tsq: productSearchTsQuery(r.trigger), ex: this.orTsQuery(r.excludeTerms) }))
      .filter((r) => r.tsq);
    if (!productIds.length || !usable.length) return out;
    const rows = await this.prisma.$queryRaw<{ productId: string; ruleId: string }[]>`
      SELECT p.id AS "productId", x.rid AS "ruleId"
      FROM unnest(${usable.map((r) => r.id)}::text[], ${usable.map((r) => r.tsq)}::text[], ${usable.map((r) => r.ex)}::text[])
        AS x(rid, tsq, ex)
      JOIN "Product" p ON p.id = ANY(${productIds}::text[])
       AND p."searchVector" @@ to_tsquery('spanish', x.tsq)
       AND (CASE WHEN x.ex = '' THEN true ELSE NOT (p."searchVector" @@ to_tsquery('spanish', x.ex)) END)`;
    const order = new Map(usable.map((r, i) => [r.id, i]));
    for (const r of rows) out.set(r.productId, [...(out.get(r.productId) ?? []), r.ruleId]);
    for (const [k, v] of out) out.set(k, v.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
    return out;
  }

  // Hay complementos disponibles para este termino? Si el cotizado tiene medida y hay de esa misma medida, se
  // ofrecen "para <medida>". Excluye variantes (ROTO/SEGUNDA), bloqueados y los que tambien dispararian la regla
  // (evita "rodillo -> rodillo"). null = no hay ninguno disponible: no se menciona.
  private async termAvailability(
    term: string, trigger: string, measures: Set<string>, reserved: Record<string, number>,
  ): Promise<Availability | null> {
    const tsq = productSearchTsQuery(term);
    const trigTsq = productSearchTsQuery(trigger);
    if (!tsq || !trigTsq) return null;
    const rows = await this.prisma.$queryRaw<CandRow[]>`
      SELECT p.id, p.name,
        COALESCE((SELECT SUM(s.quantity) FROM "Stock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
                  WHERE s."productId" = p.id AND w."countsForSale" = true), 0)::float AS stock
      FROM "Product" p
      WHERE p."isActive" AND p."priceDetal" > 0 AND NOT p."saleBlocked" AND NOT p."isService"
        AND p."searchVector" @@ to_tsquery('spanish', ${tsq})
        AND NOT (p."searchVector" @@ to_tsquery('spanish', ${trigTsq}))
      LIMIT 500`;
    const ok = rows.filter((r) => Number(r.stock) - (reserved[r.id] || 0) > 0 && !VARIANT_RE.test(r.name));
    if (!ok.length) return null;
    for (const m of measures) {
      const same = ok.filter((r) => extractMeasures(r.name).has(m)).length;
      if (same) return { measure: m, count: same };
    }
    return { measure: null, count: ok.length };
  }

  // Sugerencias para los productos DISPONIBLES de buscar_productos (el llamador ya filtra agotados/bloqueados).
  // conversationId null = prueba sin conversacion.
  async suggestFor(conversationId: string | null, products: { id: string; name: string }[]): Promise<Map<string, CrossSellOffer[]>> {
    const result = new Map<string, CrossSellOffer[]>();
    const rules = await this.activeRules();
    const src = products.slice(0, SOURCE_PRODUCTS);
    if (!rules.length || !src.length) return result;
    const matches = await this.matchRules(src.map((p) => p.id), rules);
    if (!matches.size) return result;
    const offered = new Set(
      conversationId
        ? (await this.prisma.chatbotCrossSellOffer.findMany({ where: { conversationId }, select: { ruleId: true } })).map((o) => o.ruleId)
        : [],
    );
    const reserved = await this.invoices.getReservedStock();
    const byId = new Map(rules.map((r) => [r.id, r]));
    // Productos parecidos (5 esmeriles de 4-1/2) dan la misma respuesta: se calcula una vez por regla/termino/medida.
    const memo = new Map<string, Availability | null>();
    for (const p of src) {
      const list: CrossSellOffer[] = [];
      const productMeasures = extractMeasures(p.name);
      for (const ruleId of matches.get(p.id) ?? []) {
        if (offered.has(ruleId) || list.length >= MAX_PER_PRODUCT) continue;
        const rule = byId.get(ruleId)!;
        const measures = rule.useMeasure ? productMeasures : new Set<string>();
        for (const term of rule.offerTerms) {
          if (list.length >= MAX_PER_PRODUCT) break;
          const key = `${rule.trigger}|${term}|${[...measures].sort().join(',')}`;
          if (!memo.has(key)) memo.set(key, await this.termAvailability(term, rule.trigger, measures, reserved));
          const av = memo.get(key);
          if (av) list.push({ ruleId, term, ...av });
        }
      }
      if (list.length) result.set(p.id, list);
    }
    return result;
  }

  // "Probar regla": cuantos productos la disparan y ejemplos reales (los mas vendidos) con lo que ofreceria.
  async testRule(dto: TestCrossSellRuleDto) {
    const tsq = productSearchTsQuery(dto.trigger);
    if (!tsq) throw new BadRequestException('Escribe al menos una palabra en "Si cotiza"');
    const ex = this.orTsQuery(dto.excludeTerms ?? []);
    const where = Prisma.sql`p."isActive" AND p."priceDetal" > 0
      AND p."searchVector" @@ to_tsquery('spanish', ${tsq})
      AND (CASE WHEN ${ex} = '' THEN true ELSE NOT (p."searchVector" @@ to_tsquery('spanish', ${ex})) END)`;
    const [{ n }] = await this.prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Product" p WHERE ${where}`;
    const sample = await this.prisma.$queryRaw<{ id: string; code: string; name: string; priceDetal: number }[]>`
      SELECT p.id, p.code, p.name, p."priceDetal" FROM "Product" p WHERE ${where}
      ORDER BY (SELECT COUNT(*) FROM "InvoiceItem" ii WHERE ii."productId" = p.id) DESC, p.name
      LIMIT 8`;
    const reserved = await this.invoices.getReservedStock();
    const examples: { product: { code: string; name: string; priceDetal: number }; offers: (Availability & { term: string })[] }[] = [];
    for (const s of sample) {
      const offers: (Availability & { term: string })[] = [];
      for (const term of dto.offerTerms.slice(0, MAX_PER_PRODUCT)) {
        const av = await this.termAvailability(term, dto.trigger, dto.useMeasure === false ? new Set<string>() : extractMeasures(s.name), reserved);
        if (av) offers.push({ term, ...av });
      }
      examples.push({ product: { code: s.code, name: s.name, priceDetal: Number(s.priceDetal) }, offers });
    }
    return { matchCount: n, examples };
  }

  // ---------- CRUD ----------

  async list(status?: CrossSellRuleStatus) {
    const [rules, cfg] = await Promise.all([
      this.prisma.chatbotCrossSellRule.findMany({
        where: status ? { status } : { status: { in: ['ACTIVE', 'PAUSED', 'SUGGESTED'] } },
        orderBy: [{ status: 'asc' }, { trigger: 'asc' }],
      }),
      this.prisma.chatbotConfig.findUnique({ where: { id: 'default' }, select: { crossSellAnalyzedAt: true } }),
    ]);
    return { rules, analyzedAt: cfg?.crossSellAnalyzedAt ?? null };
  }

  private clean(terms: string[] | undefined) {
    return [...new Set((terms ?? []).map(normalizeTerm).filter(Boolean))];
  }

  private async assertFreeKey(key: string, exceptId?: string) {
    const dup = await this.prisma.chatbotCrossSellRule.findUnique({ where: { key }, select: { id: true, status: true } });
    if (dup && dup.id !== exceptId) {
      throw new ConflictException(dup.status === 'DISMISSED'
        ? 'Esa regla fue descartada antes; búscala en Sugeridas o cambia las palabras.'
        : 'Ya existe una regla igual.');
    }
  }

  async create(dto: CrossSellRuleDto, userId: string) {
    const trigger = normalizeTerm(dto.trigger);
    const offerTerms = this.clean(dto.offerTerms);
    if (!trigger || !offerTerms.length) throw new BadRequestException('Indica qué cotiza y qué ofrecer');
    const key = ruleKey(trigger, offerTerms);
    await this.assertFreeKey(key);
    const rule = await this.prisma.chatbotCrossSellRule.create({
      data: {
        key, trigger, offerTerms, excludeTerms: this.clean(dto.excludeTerms), useMeasure: dto.useMeasure ?? true,
        status: dto.status ?? 'PAUSED', createdById: userId,
      },
    });
    this.invalidate();
    return rule;
  }

  async update(id: string, dto: UpdateCrossSellRuleDto) {
    const rule = await this.prisma.chatbotCrossSellRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regla no encontrada');
    const trigger = dto.trigger !== undefined ? normalizeTerm(dto.trigger) : rule.trigger;
    const offerTerms = dto.offerTerms !== undefined ? this.clean(dto.offerTerms) : rule.offerTerms;
    if (!trigger || !offerTerms.length) throw new BadRequestException('Indica qué cotiza y qué ofrecer');
    const key = ruleKey(trigger, offerTerms);
    if (key !== rule.key) await this.assertFreeKey(key, id);
    const updated = await this.prisma.chatbotCrossSellRule.update({
      where: { id },
      data: {
        key, trigger, offerTerms,
        ...(dto.excludeTerms !== undefined ? { excludeTerms: this.clean(dto.excludeTerms) } : {}),
        ...(dto.useMeasure !== undefined ? { useMeasure: dto.useMeasure } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    this.invalidate();
    return updated;
  }

  async remove(id: string) {
    await this.prisma.$transaction([
      this.prisma.chatbotCrossSellOffer.deleteMany({ where: { ruleId: id } }),
      this.prisma.chatbotCrossSellRule.delete({ where: { id } }),
    ]);
    this.invalidate();
    return { ok: true };
  }

  // Tras cada respuesta del bot: lo que el texto final realmente menciono cuenta como "ofrecido"
  // (no se repite en la conversacion y suma a "Veces ofrecida").
  async recordOffered(conversationId: string, toolLog: { name: string; result: unknown }[], finalText: string) {
    // El bot suele ofrecer el complemento cuando el cliente ELIGE un producto de una lista anterior, sin
    // volver a buscar: por eso tambien se miran las busquedas de los ultimos mensajes del bot.
    const previous = await this.prisma.chatbotMessage.findMany({
      where: { conversationId, role: 'BOT' },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { toolCalls: true },
    });
    const logs = [
      ...toolLog,
      ...previous.flatMap((m) => ((m.toolCalls ?? []) as unknown as { name: string; result: unknown }[])),
    ];
    const seen = new Set<string>();
    for (const t of logs) {
      // buscar_productos trae ofertas por producto; enviar_foto las trae sueltas en el resultado.
      const res = (t.result ?? {}) as any;
      const productos = [...(res.productos ?? []), res] as { ofrecer_tambien?: { que: string; regla_id: string }[] }[];
      for (const p of productos) {
        for (const o of p.ofrecer_tambien ?? []) {
          if (!o.que || seen.has(o.regla_id) || !wasOffered(o.que, finalText)) continue;
          seen.add(o.regla_id);
          try {
            await this.prisma.$transaction([
              this.prisma.chatbotCrossSellOffer.create({ data: { conversationId, ruleId: o.regla_id, term: o.que } }),
              this.prisma.chatbotCrossSellRule.update({ where: { id: o.regla_id }, data: { timesOffered: { increment: 1 } } }),
            ]);
          } catch (e) {
            // P2002 = ya se registro en esta conversacion; P2025 = la regla se borro entre medio.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025'].includes(e.code))) throw e;
          }
        }
      }
    }
  }
}
