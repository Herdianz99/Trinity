import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CrossSellRuleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { productSearchTsQuery } from '../../common/product-search';
import { VARIANT_RE, extractMeasures, normalizeTerm, ruleKey, sharesMeasure, wasOffered } from './cross-sell-utils';
import { CrossSellRuleDto, TestCrossSellRuleDto, UpdateCrossSellRuleDto } from './dto/cross-sell.dto';

const SOURCE_PRODUCTS = 3;   // solo los primeros resultados de buscar_productos llevan sugerencias
const MAX_PER_PRODUCT = 2;   // maximo de complementos por producto cotizado
const RULES_TTL_MS = 60_000;

type ActiveRule = { id: string; trigger: string; offerTerms: string[]; excludeTerms: string[] };
type CandRow = { id: string; code: string; name: string; priceDetal: number; categoryId: string | null; stock: number; sold: number };

export interface CrossSellPick { productId: string; code: string; name: string; priceDetal: number; categoryId: string | null }
export interface CrossSellCandidate extends CrossSellPick { ruleId: string }

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
      select: { id: true, trigger: true, offerTerms: true, excludeTerms: true },
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

  // Mejor producto disponible para un termino a ofrecer: misma medida que el cotizado -> mas vendido.
  // Nunca el mismo producto, ni uno que tambien dispararia la regla (evita "rodillo -> rodillo").
  private async pickCandidate(
    term: string, trigger: string, excludeIds: string[], measures: Set<string>, reserved: Record<string, number>,
  ): Promise<CrossSellPick | null> {
    const tsq = productSearchTsQuery(term);
    const trigTsq = productSearchTsQuery(trigger);
    if (!tsq || !trigTsq) return null;
    const rows = await this.prisma.$queryRaw<CandRow[]>`
      SELECT p.id, p.code, p.name, p."priceDetal", p."categoryId",
        COALESCE((SELECT SUM(s.quantity) FROM "Stock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
                  WHERE s."productId" = p.id AND w."countsForSale" = true), 0)::float AS stock,
        COALESCE((SELECT COUNT(DISTINCT ii."invoiceId") FROM "InvoiceItem" ii JOIN "Invoice" i ON i.id = ii."invoiceId"
                  WHERE ii."productId" = p.id AND i.status IN ('PAID', 'PARTIAL_RETURN')
                    AND i."createdAt" >= now() - interval '90 days'), 0)::float AS sold
      FROM "Product" p
      WHERE p."isActive" AND p."priceDetal" > 0 AND NOT p."saleBlocked" AND NOT p."isService"
        AND p."searchVector" @@ to_tsquery('spanish', ${tsq})
        AND NOT (p."searchVector" @@ to_tsquery('spanish', ${trigTsq}))
        AND NOT (p.id = ANY(${excludeIds}::text[]))
      ORDER BY sold DESC
      LIMIT 60`;
    const ok = rows
      .filter((r) => Number(r.stock) - (reserved[r.id] || 0) > 0 && !VARIANT_RE.test(r.name))
      .map((r) => ({ r, same: sharesMeasure(measures, extractMeasures(r.name)) }))
      .sort((a, b) => Number(b.same) - Number(a.same) || Number(b.r.sold) - Number(a.r.sold));
    const best = ok[0]?.r;
    return best ? { productId: best.id, code: best.code, name: best.name, priceDetal: Number(best.priceDetal), categoryId: best.categoryId } : null;
  }

  // Sugerencias para los primeros productos de buscar_productos. conversationId null = prueba sin conversacion.
  async suggestFor(conversationId: string | null, products: { id: string; name: string }[]): Promise<Map<string, CrossSellCandidate[]>> {
    const result = new Map<string, CrossSellCandidate[]>();
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
    for (const p of src) {
      const list: CrossSellCandidate[] = [];
      const measures = extractMeasures(p.name);
      for (const ruleId of matches.get(p.id) ?? []) {
        if (offered.has(ruleId) || list.length >= MAX_PER_PRODUCT) continue;
        const rule = byId.get(ruleId)!;
        for (const term of rule.offerTerms) {
          if (list.length >= MAX_PER_PRODUCT) break;
          const pick = await this.pickCandidate(term, rule.trigger, [p.id, ...list.map((c) => c.productId)], measures, reserved);
          if (pick) list.push({ ruleId, ...pick });
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
    const examples: { product: { code: string; name: string; priceDetal: number }; offers: CrossSellPick[] }[] = [];
    for (const s of sample) {
      const offers: CrossSellPick[] = [];
      for (const term of dto.offerTerms.slice(0, MAX_PER_PRODUCT)) {
        const pick = await this.pickCandidate(term, dto.trigger, [s.id, ...offers.map((o) => o.productId)], extractMeasures(s.name), reserved);
        if (pick) offers.push(pick);
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
      data: { key, trigger, offerTerms, excludeTerms: this.clean(dto.excludeTerms), status: dto.status ?? 'PAUSED', createdById: userId },
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
    const seen = new Set<string>();
    for (const t of toolLog) {
      if (t.name !== 'buscar_productos') continue;
      const productos = ((t.result as any)?.productos ?? []) as { ofrecer_tambien?: { codigo: string; nombre: string; regla_id: string }[] }[];
      for (const p of productos) {
        for (const o of p.ofrecer_tambien ?? []) {
          if (seen.has(o.regla_id) || !wasOffered(o.nombre, finalText)) continue;
          seen.add(o.regla_id);
          const prod = await this.prisma.product.findFirst({ where: { code: o.codigo }, select: { id: true } });
          if (!prod) continue;
          try {
            await this.prisma.$transaction([
              this.prisma.chatbotCrossSellOffer.create({ data: { conversationId, ruleId: o.regla_id, productId: prod.id } }),
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
