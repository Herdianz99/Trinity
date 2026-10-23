import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasToday, caracasDayStart, caracasDayEnd, caracasParts } from '../../common/timezone';
import { BASES, CampaignCustomer, Estado, QuoteInfo, estadoFor, firstName, segmentCustomers, waNumber } from './segmentation';
import {
  COOLING_KEY, QUOTE_KEY, DEFAULT_TEMPLATES, TEMPLATE_LABELS, TEMPLATE_DESCRIPTIONS, DEFAULT_RUBRO_DESCRIPTION,
} from './templates';
import {
  CreateSendDto, ImportLocalDto, ListCampaignQueryDto, ResultsQueryDto, UpdateSettingsDto,
} from './dto/campaign.dto';

const PAGE = 50;
const CACHE_MS = 30 * 60 * 1000;
const PAID = ['PAID', 'PARTIAL_RETURN'] as const;
const dayMs = 864e5;
// Cotizaciones pendientes: de hace 1 a QUOTE_MAX_DAYS dias. Las de hoy no entran: casi todas las que
// se convierten lo hacen el mismo dia (p95 < 24 h), el mensaje es para las que ya se enfriaron.
const QUOTE_MAX_DAYS = 7;
const QUOTE_CUSTOMER = { isDefault: false, isEmployee: false, isGroupCompany: false, isActive: true };

type Classified = {
  at: number;
  generado: string;
  customers: CampaignCustomer[];
  byId: Map<string, CampaignCustomer>;
  purchaseDays: Map<string, string[]>;
};

const isCooling = (c: { st: Estado }) => c.st === 'Enfriándose' || c.st === 'Inactivo';
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * dayMs).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

@Injectable()
export class WhatsappCampaignService {
  constructor(private readonly prisma: PrismaService) {}

  // Clasificacion en memoria por 30 min: recorre todas las ventas, no se recalcula en cada pagina.
  private cache: Classified | null = null;
  private loading: Promise<Classified> | null = null;

  async ensureEnabled() {
    const cfg = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { whatsappCampaignEnabled: true, whatsappCampaignStoreName: true, whatsappCampaignDailyLimit: true },
    });
    if (!cfg?.whatsappCampaignEnabled) throw new ForbiddenException('La campaña de WhatsApp no está activa en esta empresa');
    return cfg;
  }

  private async classified(refresh = false): Promise<Classified> {
    if (!refresh && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;
    if (!this.loading) {
      this.loading = this.classify().finally(() => { this.loading = null; });
    }
    this.cache = await this.loading;
    return this.cache;
  }

  private async classify(): Promise<Classified> {
    const todayYmd = caracasToday();
    const [invoiceAgg, lines, products] = await Promise.all([
      this.prisma.$queryRaw<{ customerId: string; dias: number; ultima: string }[]>`
        SELECT i."customerId",
               count(DISTINCT (i."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas')::date)::int AS dias,
               to_char(max((i."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas')::date), 'YYYY-MM-DD') AS ultima
        FROM "Invoice" i
        WHERE i.type = 'SALE' AND i.status IN ('PAID', 'PARTIAL_RETURN') AND i."customerId" IS NOT NULL
        GROUP BY 1`,
      this.prisma.$queryRaw<{ customerId: string; productId: string; dia: string; usd: number }[]>`
        SELECT i."customerId", ii."productId",
               to_char((i."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas')::date, 'YYYY-MM-DD') AS dia,
               round(sum(ii."totalUsd" * (1 - coalesce(ii."returnedQty", 0) / NULLIF(ii.quantity, 0)))::numeric, 2)::float8 AS usd
        FROM "InvoiceItem" ii JOIN "Invoice" i ON i.id = ii."invoiceId"
        WHERE i.type = 'SALE' AND i.status IN ('PAID', 'PARTIAL_RETURN') AND i."customerId" IS NOT NULL
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<{ id: string; name: string; cat: string | null }[]>`
        SELECT p.id, p.name, c.name AS cat FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"`,
    ]);

    const ids = invoiceAgg.map((r) => r.customerId);
    const customers: { id: string; code: string | null; name: string; documentType: string; phone: string | null; isEmployee: boolean; isGroupCompany: boolean }[] = [];
    for (let i = 0; i < ids.length; i += 5000) {
      customers.push(...await this.prisma.customer.findMany({
        where: { id: { in: ids.slice(i, i + 5000) } },
        select: { id: true, code: true, name: true, documentType: true, phone: true, isEmployee: true, isGroupCompany: true },
      }));
    }

    const { customers: list, purchaseDays } = segmentCustomers({ todayYmd, customers, invoiceAgg, products, lines });
    return { at: Date.now(), generado: todayYmd, customers: list, byId: new Map(list.map((c) => [c.id, c])), purchaseDays };
  }

  // ── Cotizaciones sin comprar ─────────────────────────────────────────────
  // Por cliente, su ultima cotizacion de hace 1-7 dias (sin convertir ni rechazar) si no ha comprado
  // desde entonces. Va en vivo (son pocas filas), no en el cache de 30 min: una venta de hace un rato
  // tiene que sacar al cliente de la lista. Los clientes que nunca compraron llegan con estado 'Nuevo'.
  private async quoteLeads(data: Classified): Promise<CampaignCustomer[]> {
    const todayYmd = caracasToday();
    const from = caracasDayStart(addDays(todayYmd, -QUOTE_MAX_DAYS));
    const quotes = await this.prisma.quotation.findMany({
      where: {
        customerId: { not: null }, convertedToInvoiceId: null, status: { in: ['DRAFT', 'SENT', 'EXPIRED'] },
        createdAt: { gte: from, lt: caracasDayStart(todayYmd) },
        customer: QUOTE_CUSTOMER,
      },
      select: {
        id: true, number: true, createdAt: true, totalUsd: true, customerId: true,
        customer: { select: { code: true, name: true, documentType: true, phone: true } },
        items: { select: { productName: true, totalUsd: true }, orderBy: { totalUsd: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const latest = new Map<string, (typeof quotes)[number]>();
    for (const q of quotes) if (!latest.has(q.customerId!)) latest.set(q.customerId!, q);
    if (!latest.size) return [];

    const buys = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: { type: 'SALE', status: { in: [...PAID] }, customerId: { in: [...latest.keys()] }, createdAt: { gte: from } },
      _max: { createdAt: true },
    });
    const lastBuy = new Map(buys.map((b) => [b.customerId!, b._max.createdAt]));

    const out: CampaignCustomer[] = [];
    for (const [cid, q] of latest) {
      const lb = lastBuy.get(cid);
      if (lb && lb >= q.createdAt) continue;
      const wa = waNumber(q.customer!.phone);
      if (!wa) continue;
      const ymd = caracasParts(q.createdAt).ymd;
      const info: QuoteInfo = {
        id: q.id, number: q.number, at: q.createdAt.toISOString(), ymd,
        daysAgo: Math.round((Date.parse(todayYmd + 'T00:00:00Z') - Date.parse(ymd + 'T00:00:00Z')) / dayMs),
        usd: r2(q.totalUsd), items: q.items.slice(0, 3).map((i) => i.productName), nItems: q.items.length,
      };
      const known = data.byId.get(cid);
      if (known) { out.push({ ...known, q: info }); continue; }
      const c = q.customer!;
      const tipo: 'Persona' | 'Empresa' = ['J', 'G'].includes(c.documentType) ? 'Empresa' : 'Persona';
      out.push({
        id: cid, c: c.code || '', n: c.name, fn: firstName(c.name, tipo), t: tipo, wa,
        r: 'Cliente nuevo', b: 'HOGAR', o: 0, sg: 'Ocasional', st: 'Nuevo', d: -1, u: '', tot: 0, dc: 0, p: '', q: info,
      });
    }
    return out;
  }

  // ── Lista de clientes ────────────────────────────────────────────────────

  async list(q: ListCampaignQueryDto) {
    const cfg = await this.ensureEnabled();
    const [data, lastSends, contacts, sentToday] = await Promise.all([
      this.classified(q.refresh === '1'),
      this.prisma.$queryRaw<{ customerId: string; sentAt: Date }[]>`
        SELECT DISTINCT ON ("customerId") "customerId", "sentAt" FROM "WhatsappCampaignSend" ORDER BY "customerId", "sentAt" DESC`,
      this.prisma.whatsappCampaignContact.findMany(),
      this.prisma.whatsappCampaignSend.count({ where: { sentAt: { gte: caracasDayStart(), lte: caracasDayEnd() }, userId: { not: null } } }),
    ]);

    const lastSent = new Map(lastSends.map((s) => [s.customerId, s.sentAt]));
    const replied = new Set(contacts.filter((c) => c.repliedAt).map((c) => c.customerId));
    const bad = new Set(contacts.filter((c) => c.noWhatsappAt).map((c) => c.customerId));

    // Cotizaciones: "enviado" = mensaje posterior a la cotizacion (un mensaje de reactivacion viejo no cuenta).
    const leads = await this.quoteLeads(data);
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const quoteSent = (l: CampaignCustomer) => { const s = lastSent.get(l.id); return !!s && s >= new Date(l.q!.at); };
    // Con cotizacion pendiente sin mensaje: se le escribe por la cotizacion, no sale en activos/enfriandose
    const openLead = (id: string) => { const l = leadById.get(id); return !!l && !quoteSent(l); };
    // Los que nunca compraron no estan en la clasificacion: se suman para Todos/Contactados/Sin WhatsApp
    const universe = [...data.customers, ...leads.filter((l) => !data.byId.has(l.id))];

    const tab = q.tab || 'cot';
    const tabFilters: Record<string, (c: CampaignCustomer) => boolean> = {
      cool: (c) => isCooling(c) && !bad.has(c.id) && !openLead(c.id),
      act: (c) => c.st === 'Activo' && !bad.has(c.id) && !openLead(c.id),
      all: (c) => !bad.has(c.id),
      sent: (c) => lastSent.has(c.id) && !bad.has(c.id),
      bad: (c) => bad.has(c.id),
    };
    const search = (q.q || '').trim().toLowerCase();
    const digits = search.replace(/\D/g, '');
    const hideSent = q.hideSent !== '0';
    const matches = (c: CampaignCustomer) =>
      !search || c.n.toLowerCase().includes(search) || c.c.toLowerCase().includes(search) || (!!digits && c.wa.includes(digits));
    const base = universe.filter((c) =>
      (!q.base || c.b === q.base) &&
      (q.oficio === undefined || String(c.o) === q.oficio) &&
      (!q.seg || c.sg === q.seg) &&
      matches(c));

    const notHidden = (c: CampaignCustomer, t: string) => !hideSent || t === 'sent' || t === 'bad' || !lastSent.has(c.id);
    // La pestana de cotizaciones no usa los filtros de rubro/oficio/segmento (no aplican a clientes nuevos)
    const quoteRows = leads.filter((l) => !bad.has(l.id) && matches(l) && (!hideSent || !quoteSent(l)));
    const tabCounts = {
      cot: quoteRows.length,
      ...Object.fromEntries(Object.entries(tabFilters).map(([k, f]) => [k, base.filter((c) => f(c) && notHidden(c, k)).length])),
    };
    const rows = tab === 'cot' ? quoteRows : base.filter((c) => tabFilters[tab](c) && notHidden(c, tab));

    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const page = Math.min(q.page ?? 0, pages - 1);
    const items = rows.slice(page * PAGE, page * PAGE + PAGE).map((c) => ({
      ...c,
      lastSentAt: lastSent.get(c.id) ?? null,
      replied: replied.has(c.id),
      noWhatsapp: bad.has(c.id),
    }));

    return {
      generado: data.generado,
      calculadoAt: new Date(data.at),
      totalClientes: data.customers.length,
      items, total: rows.length, page, pages, tabCounts,
      stats: {
        sentToday,
        dailyLimit: cfg.whatsappCampaignDailyLimit,
        contacted: lastSent.size,
        replied: replied.size,
        noWhatsapp: bad.size,
      },
    };
  }

  // ── Envios y marcas ──────────────────────────────────────────────────────

  async send(userId: string, dto: CreateSendDto) {
    await this.ensureEnabled();
    const data = await this.classified();
    if (!DEFAULT_TEMPLATES[dto.template]) throw new BadRequestException('Plantilla desconocida');
    let c = data.byId.get(dto.customerId);
    if (dto.template === QUOTE_KEY) {
      c = (await this.quoteLeads(data)).find((l) => l.id === dto.customerId);
      if (!c) throw new BadRequestException('El cliente ya no tiene una cotización pendiente (compró o pasaron más de 7 días)');
    }
    if (!c) throw new NotFoundException('Cliente fuera de la campaña');
    const q = c.q;
    // Foto del cliente al momento del envio (para medir el efecto aunque cambie la clasificacion)
    return this.prisma.whatsappCampaignSend.create({
      data: {
        customerId: c.id, userId, template: dto.template, edited: !!dto.edited,
        snapshot: {
          code: c.c, name: c.n, rubro: c.r, base: c.b, oficio: c.o, seg: c.sg, estado: c.st,
          diasSinComprar: c.d, totalUsd: c.tot, ultimaCompra: c.u, datos: data.generado,
          ...(q && { cotizacion: { id: q.id, number: q.number, fecha: q.ymd, totalUsd: q.usd } }),
        },
      },
    });
  }

  async setReplied(customerId: string, value: boolean) {
    await this.ensureEnabled();
    const repliedAt = value ? new Date() : null;
    return this.prisma.whatsappCampaignContact.upsert({
      where: { customerId }, update: { repliedAt }, create: { customerId, repliedAt },
    });
  }

  async setNoWhatsapp(customerId: string, value: boolean) {
    await this.ensureEnabled();
    const noWhatsappAt = value ? new Date() : null;
    return this.prisma.whatsappCampaignContact.upsert({
      where: { customerId }, update: { noWhatsappAt }, create: { customerId, noWhatsappAt },
    });
  }

  // ── Plantillas y ajustes ─────────────────────────────────────────────────

  async templates() {
    const cfg = await this.ensureEnabled();
    const saved = new Map((await this.prisma.whatsappCampaignTemplate.findMany()).map((t) => [t.key, t.text]));
    return {
      storeName: cfg.whatsappCampaignStoreName,
      dailyLimit: cfg.whatsappCampaignDailyLimit,
      bases: Object.entries(BASES).map(([key, v]) => ({ key, ...v })),
      coolingKey: COOLING_KEY,
      quoteKey: QUOTE_KEY,
      templates: Object.keys(DEFAULT_TEMPLATES).map((key) => ({
        key,
        label: TEMPLATE_LABELS[key],
        description: TEMPLATE_DESCRIPTIONS[key] || DEFAULT_RUBRO_DESCRIPTION,
        text: saved.get(key) ?? DEFAULT_TEMPLATES[key],
        edited: saved.has(key),
      })),
    };
  }

  async saveTemplate(userId: string, key: string, text: string) {
    await this.ensureEnabled();
    if (!DEFAULT_TEMPLATES[key]) throw new NotFoundException('Plantilla desconocida');
    return this.prisma.whatsappCampaignTemplate.upsert({
      where: { key }, update: { text, updatedById: userId }, create: { key, text, updatedById: userId },
    });
  }

  async resetTemplate(key: string) {
    await this.ensureEnabled();
    await this.prisma.whatsappCampaignTemplate.deleteMany({ where: { key } });
    return { key, text: DEFAULT_TEMPLATES[key] };
  }

  async saveSettings(dto: UpdateSettingsDto) {
    await this.ensureEnabled();
    return this.prisma.companyConfig.update({
      where: { id: 'singleton' },
      data: {
        ...(dto.storeName !== undefined && { whatsappCampaignStoreName: dto.storeName.trim() }),
        ...(dto.dailyLimit !== undefined && { whatsappCampaignDailyLimit: dto.dailyLimit }),
      },
      select: { whatsappCampaignStoreName: true, whatsappCampaignDailyLimit: true },
    });
  }

  // ── Resultados ───────────────────────────────────────────────────────────
  // Por cliente cuenta el PRIMER envio del rango. Compro = factura de venta cobrada creada despues
  // del envio y dentro de la ventana. Grupo control: clientes nunca contactados (hasta el fin de la
  // ventana) que el dia del envio estaban en el mismo estado; se mide su % de compra en la misma
  // ventana y se pondera por los envios de cada dia/estado -> "compras esperadas sin mensaje".

  async results(q: ResultsQueryDto) {
    await this.ensureEnabled();
    const W = q.window ?? 7;
    const now = new Date();
    const todayYmd = caracasToday();

    const [rangeSends, allFirstSends, contacts, data] = await Promise.all([
      this.prisma.whatsappCampaignSend.findMany({
        where: { sentAt: { gte: caracasDayStart(q.from), lte: caracasDayEnd(q.to) } },
        orderBy: { sentAt: 'asc' },
      }),
      this.prisma.$queryRaw<{ customerId: string; first: Date }[]>`
        SELECT "customerId", min("sentAt") AS first FROM "WhatsappCampaignSend" GROUP BY 1`,
      this.prisma.whatsappCampaignContact.findMany(),
      this.classified(),
    ]);

    const replied = new Set(contacts.filter((c) => c.repliedAt).map((c) => c.customerId));
    const firstEver = new Map(allFirstSends.map((s) => [s.customerId, caracasParts(s.first).ymd]));

    // Primer envio por cliente dentro del rango
    const firstInRange = new Map<string, (typeof rangeSends)[number]>();
    for (const s of rangeSends) if (!firstInRange.has(s.customerId)) firstInRange.set(s.customerId, s);
    const sends = [...firstInRange.values()];

    // Facturas de esos clientes despues de su envio (en lotes)
    const ids = sends.map((s) => s.customerId);
    const minSent = sends.length ? sends[0].sentAt : now;
    const maxEnd = new Date(Math.max(...sends.map((s) => s.sentAt.getTime()), now.getTime()) + W * dayMs);
    const invoices: { id: string; number: string | null; customerId: string | null; createdAt: Date; totalUsd: number; totalBs: number; payments: { method: { name: string } }[] }[] = [];
    for (let i = 0; i < ids.length; i += 5000) {
      invoices.push(...await this.prisma.invoice.findMany({
        where: { type: 'SALE', status: { in: [...PAID] }, customerId: { in: ids.slice(i, i + 5000) }, createdAt: { gt: minSent, lte: maxEnd } },
        select: { id: true, number: true, customerId: true, createdAt: true, totalUsd: true, totalBs: true, payments: { select: { method: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
      }));
    }
    const invByCustomer = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      if (!inv.customerId) continue;
      (invByCustomer.get(inv.customerId) || invByCustomer.set(inv.customerId, []).get(inv.customerId)!).push(inv);
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(sends.map((s) => s.userId).filter((x): x is string => !!x))] } },
      select: { id: true, name: true },
    });
    const userName = new Map(users.map((u) => [u.id, u.name]));

    // Grupo control: tasa de compra por (dia, estado), calculada una vez por combinacion
    const controlCache = new Map<string, { eligible: number; bought: number }>();
    const controlFor = (day: string, estado: string) => {
      const key = day + '|' + estado;
      const hit = controlCache.get(key);
      if (hit) return hit;
      const end = addDays(day, W) < todayYmd ? addDays(day, W) : todayYmd;
      let eligible = 0, bought = 0;
      for (const [cid, days] of data.purchaseDays) {
        const fe = firstEver.get(cid);
        if (fe && fe <= end) continue; // contactado antes de cerrar la ventana: no es control
        let lastBefore: string | null = null;
        let buys = false;
        for (const d of days) {
          if (d < day) lastBefore = d;
          else if (d <= end) { buys = true; break; }
          else break;
        }
        if (!lastBefore) continue;
        const dsd = Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(lastBefore + 'T00:00:00Z')) / dayMs);
        if (estadoFor(dsd) !== estado) continue;
        eligible++;
        if (buys) bought++;
      }
      const r = { eligible, bought };
      controlCache.set(key, r);
      return r;
    };

    const quoteDays = [...new Set(sends.filter((s) => s.template === QUOTE_KEY).map((s) => caracasParts(s.sentAt).ymd))].sort();
    const quoteControlFor = quoteDays.length ? await this.quoteControl(quoteDays, W, todayYmd) : () => ({ eligible: 0, bought: 0 });

    type Agg = { sent: number; buyers: number; usd: number; expected: number };
    const newAgg = (): Agg => ({ sent: 0, buyers: 0, usd: 0, expected: 0 });
    const byTemplate = new Map<string, Agg>();
    const byEstado = new Map<string, Agg>();
    const byUser = new Map<string, Agg>();
    const byDay = new Map<string, Agg>();
    const totals = { ...newAgg(), bs: 0, cashea: 0, openWindow: 0, replied: 0 };
    const buyers: any[] = [];

    for (const s of sends) {
      const snap = (s.snapshot || {}) as any;
      const isQuote = s.template === QUOTE_KEY;
      // Las de cotizacion van en su propio grupo (y su propio control), aunque el cliente sea activo/inactivo
      const estado: string = isQuote ? 'Cotización' : snap.estado || 'Activo';
      const day = caracasParts(s.sentAt).ymd;
      const windowEnd = new Date(s.sentAt.getTime() + W * dayMs);
      const inv = (invByCustomer.get(s.customerId) || []).filter((i) => i.createdAt > s.sentAt && i.createdAt <= windowEnd);
      const usd = r2(inv.reduce((a, i) => a + i.totalUsd, 0));
      const bs = r2(inv.reduce((a, i) => a + i.totalBs, 0));
      const methods = [...new Set(inv.flatMap((i) => i.payments.map((p) => p.method.name)))];
      const cashea = methods.some((m) => m.toLowerCase().includes('cashea'));
      const ctl = isQuote ? quoteControlFor(day) : controlFor(day, estado);
      const expected = ctl.eligible ? ctl.bought / ctl.eligible : 0;

      const groups: [Map<string, Agg>, string][] = [
        [byTemplate, s.template], [byEstado, estado], [byUser, s.userId ? userName.get(s.userId) || 'Usuario' : 'Importado (página local)'], [byDay, day],
      ];
      for (const [m, k] of groups) {
        const a = m.get(k) || m.set(k, newAgg()).get(k)!;
        a.sent++; a.expected += expected;
        if (inv.length) { a.buyers++; a.usd += usd; }
      }
      totals.sent++; totals.expected += expected;
      if (windowEnd > now) totals.openWindow++;
      if (replied.has(s.customerId)) totals.replied++;
      if (inv.length) {
        totals.buyers++; totals.usd += usd; totals.bs += bs;
        if (cashea) totals.cashea++;
        const c = data.byId.get(s.customerId);
        buyers.push({
          customerId: s.customerId,
          code: snap.code || c?.c || '',
          name: snap.name || c?.n || '',
          sentAt: s.sentAt,
          template: s.template,
          templateLabel: TEMPLATE_LABELS[s.template] || s.template,
          estado, seg: snap.seg || null,
          daysToBuy: Math.max(0, Math.floor((inv[0].createdAt.getTime() - s.sentAt.getTime()) / dayMs)),
          totalUsd: usd, totalBs: bs, cashea, methods,
          invoices: inv.map((i) => ({ id: i.id, number: i.number, createdAt: i.createdAt, totalUsd: i.totalUsd, totalBs: i.totalBs })),
        });
      }
    }

    // Envios importados o clientes que ya no estan en la clasificacion: nombre/codigo desde la ficha
    const missing = buyers.filter((b) => !b.name || !b.code).map((b) => b.customerId);
    if (missing.length) {
      const found = new Map((await this.prisma.customer.findMany({
        where: { id: { in: missing } }, select: { id: true, code: true, name: true },
      })).map((c) => [c.id, c]));
      for (const b of buyers) {
        const c = found.get(b.customerId);
        if (c) { b.name ||= c.name; b.code ||= c.code || ''; }
      }
    }

    const rows = (m: Map<string, Agg>, label: (k: string) => string = (k) => k) =>
      [...m.entries()].map(([key, a]) => ({
        key, label: label(key), sent: a.sent, buyers: a.buyers, conversionPct: pct(a.buyers, a.sent),
        controlPct: pct(a.expected, a.sent), usd: r2(a.usd),
      }));

    return {
      from: q.from, to: q.to, window: W,
      totals: {
        sent: totals.sent,
        buyers: totals.buyers,
        conversionPct: pct(totals.buyers, totals.sent),
        controlPct: pct(totals.expected, totals.sent),
        expectedBuyers: r2(totals.expected),
        extraBuyers: r2(totals.buyers - totals.expected),
        usd: r2(totals.usd),
        bs: r2(totals.bs),
        cashea: totals.cashea,
        replied: totals.replied,
        openWindow: totals.openWindow,
        noWhatsapp: contacts.filter((c) => c.noWhatsappAt).length,
      },
      byTemplate: rows(byTemplate, (k) => TEMPLATE_LABELS[k] || k).sort((a, b) => b.sent - a.sent),
      byEstado: rows(byEstado).sort((a, b) => b.sent - a.sent),
      byUser: rows(byUser).sort((a, b) => b.sent - a.sent),
      byDay: rows(byDay).sort((a, b) => a.key.localeCompare(b.key)),
      buyers: buyers.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime()),
    };
  }

  // Grupo control de "Cotizacion sin comprar": el dia D son elegibles los clientes con WhatsApp que
  // tenian una cotizacion de hace 1-7 dias sin compra entre la cotizacion y D, y que no recibieron
  // mensaje despues de esa cotizacion (hasta el fin de la ventana). Compro = factura cobrada de D a D+W.
  private async quoteControl(days: string[], W: number, todayYmd: string) {
    const from = caracasDayStart(addDays(days[0], -QUOTE_MAX_DAYS));
    const quotes = await this.prisma.quotation.findMany({
      where: {
        customerId: { not: null }, status: { not: 'REJECTED' },
        createdAt: { gte: from, lt: caracasDayStart(days[days.length - 1]) },
        customer: QUOTE_CUSTOMER,
      },
      select: { customerId: true, createdAt: true, customer: { select: { phone: true } } },
    });
    const byCustomer = new Map<string, Date[]>();
    for (const q of quotes) {
      if (!waNumber(q.customer!.phone)) continue;
      (byCustomer.get(q.customerId!) || byCustomer.set(q.customerId!, []).get(q.customerId!)!).push(q.createdAt);
    }
    const ids = [...byCustomer.keys()];
    const invoices: { customerId: string | null; createdAt: Date }[] = [];
    const sendsAll: { customerId: string; sentAt: Date }[] = [];
    for (let i = 0; i < ids.length; i += 5000) {
      const chunk = ids.slice(i, i + 5000);
      invoices.push(...await this.prisma.invoice.findMany({
        where: { type: 'SALE', status: { in: [...PAID] }, customerId: { in: chunk }, createdAt: { gte: from } },
        select: { customerId: true, createdAt: true },
      }));
      sendsAll.push(...await this.prisma.whatsappCampaignSend.findMany({
        where: { customerId: { in: chunk }, sentAt: { gte: from } }, select: { customerId: true, sentAt: true },
      }));
    }
    const group = <T extends { customerId: string | null }>(rows: T[], at: (r: T) => Date) => {
      const m = new Map<string, Date[]>();
      for (const r of rows) if (r.customerId) (m.get(r.customerId) || m.set(r.customerId, []).get(r.customerId)!).push(at(r));
      return m;
    };
    const buysBy = group(invoices, (r) => r.createdAt);
    const sendsBy = group(sendsAll, (r) => r.sentAt);

    const cache = new Map<string, { eligible: number; bought: number }>();
    return (day: string) => {
      const hit = cache.get(day);
      if (hit) return hit;
      const dayStart = caracasDayStart(day);
      const qFrom = caracasDayStart(addDays(day, -QUOTE_MAX_DAYS));
      const end = caracasDayEnd(addDays(day, W) < todayYmd ? addDays(day, W) : todayYmd);
      let eligible = 0, bought = 0;
      for (const [cid, qs] of byCustomer) {
        const inWin = qs.filter((d) => d >= qFrom && d < dayStart);
        if (!inWin.length) continue;
        const qAt = new Date(Math.max(...inWin.map((d) => d.getTime())));
        const buys = buysBy.get(cid) || [];
        if (buys.some((b) => b >= qAt && b < dayStart)) continue; // ya compro: no es cotizacion pendiente
        if ((sendsBy.get(cid) || []).some((s) => s > qAt && s <= end)) continue; // recibio mensaje: no es control
        eligible++;
        if (buys.some((b) => b >= dayStart && b <= end)) bought++;
      }
      const r = { eligible, bought };
      cache.set(day, r);
      return r;
    };
  }

  // ── Importar historial de la pagina local ────────────────────────────────

  async importLocal(userId: string, dto: ImportLocalDto) {
    await this.ensureEnabled();
    const codes = [...new Set([...Object.keys(dto.sent || {}), ...Object.keys(dto.bad || {}), ...Object.keys(dto.replied || {})])];
    const customers = await this.prisma.customer.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    const idByCode = new Map(customers.map((c) => [c.code!, c.id]));

    const existing = await this.prisma.whatsappCampaignSend.findMany({
      where: { customerId: { in: customers.map((c) => c.id) } }, select: { customerId: true, sentAt: true },
    });
    const seen = new Set(existing.map((e) => e.customerId + '|' + e.sentAt.toISOString()));

    const rows: { customerId: string; userId: null; sentAt: Date; template: string; edited: boolean; snapshot: any }[] = [];
    let unknown = 0;
    for (const [code, list] of Object.entries(dto.sent || {})) {
      const customerId = idByCode.get(code);
      if (!customerId) { unknown++; continue; }
      for (const s of Array.isArray(list) ? list : []) {
        const sentAt = new Date(s?.at);
        if (isNaN(sentAt.getTime())) continue;
        const key = customerId + '|' + sentAt.toISOString();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          customerId, userId: null, sentAt,
          template: DEFAULT_TEMPLATES[s.tpl] ? s.tpl : COOLING_KEY,
          edited: !!s.editado,
          snapshot: {
            code, rubro: s.rubro, base: s.base, oficio: s.oficio, seg: s.seg, estado: s.estado,
            diasSinComprar: s.diasSinComprar, totalUsd: s.totalUsd, datos: s.datos, importado: true,
          },
        });
      }
    }

    const toDate = (v: any) => { const d = new Date(v); return isNaN(d.getTime()) ? new Date() : d; };
    const contactOps = [
      ...Object.entries(dto.replied || {}).map(([code, at]) => ({ code, data: { repliedAt: toDate(at) } })),
      ...Object.entries(dto.bad || {}).map(([code, at]) => ({ code, data: { noWhatsappAt: toDate(at) } })),
    ].filter((o) => idByCode.has(o.code));

    const tplOps = Object.entries(dto.tpls || {}).filter(([k, t]) => DEFAULT_TEMPLATES[k] && typeof t === 'string' && t.trim() && t !== DEFAULT_TEMPLATES[k]);

    await this.prisma.$transaction(async (tx) => {
      if (rows.length) await tx.whatsappCampaignSend.createMany({ data: rows });
      for (const o of contactOps) {
        const customerId = idByCode.get(o.code)!;
        await tx.whatsappCampaignContact.upsert({ where: { customerId }, update: o.data, create: { customerId, ...o.data } });
      }
      // Plantillas: solo se importan si en el sistema siguen siendo las originales (no pisar ediciones)
      for (const [key, text] of tplOps) {
        const cur = await tx.whatsappCampaignTemplate.findUnique({ where: { key } });
        if (!cur) await tx.whatsappCampaignTemplate.create({ data: { key, text, updatedById: userId } });
      }
    });

    return { sends: rows.length, contacts: contactOps.length, templates: tplOps.length, unknownCustomers: unknown };
  }
}
