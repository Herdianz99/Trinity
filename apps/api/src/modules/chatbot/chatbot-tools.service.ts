import { Injectable } from '@nestjs/common';
import { ChatbotConfig, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { productSearchTsQuery } from '../../common/product-search';
import { caracasDateKey } from '../../common/timezone';
import { VARIANT_RE } from './cross-sell-utils';
import { ChatbotCrossSellService, CrossSellOffer } from './chatbot-cross-sell.service';

const MAX_RESULTS = 10;
const CANDIDATES = 200;

export interface BotProduct {
  codigo: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio_bcv: string;
  precio_divisas: string;
  disponible: boolean;
  en_oferta: boolean;
  variante: boolean;
  tiene_foto: boolean;
  // Solo si el cliente pidio una cantidad: si la existencia vendible (menos lo apartado) la cubre.
  // El numero NO se le pasa al bot (no debe decirlo); el asesor lo ve en el resumen al escalar.
  alcanza?: boolean;
  // Venta cruzada: complementos para ofrecer si el bot cotiza ESTE producto (solo productos disponibles).
  // que = tipo a ofrecer ("disco de corte"); medida = la del producto cotizado si hay de esa medida.
  ofrecer_tambien?: { que: string; medida: string | null; regla_id: string }[];
}

export interface ProductImageOut {
  code: string;
  name: string;
  url: string;
}

// Palabras de relleno del cliente que no describen el producto ("precio del cemento" -> "cemento").
// El buscador exige TODAS las palabras, asi que estas harian fallar la busqueda.
const FILLER = new Set([
  'precio', 'precios', 'costo', 'cuesta', 'cuestan', 'vale', 'valen', 'cuanto', 'cuantos', 'cuanta',
  'tienen', 'tiene', 'tendran', 'tendra', 'hay', 'venden', 'vende', 'busco', 'buscando', 'necesito',
  'quiero', 'quisiera', 'me', 'por', 'favor', 'porfa', 'info', 'informacion', 'disponible', 'disponibilidad',
  'buenas', 'buenos', 'dias', 'tardes', 'noches', 'hola', 'saludos', 'amigo', 'amiga', 'del', 'de', 'la', 'el',
  'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'que', 'en', 'para', 'con', 'es', 'son', 'su', 'sus',
  // Piloto dia 1: unidades y "numero" que el cliente agrega y los nombres no traen ("cable nro 12",
  // "clavo 2 pulgadas", "saco de estuco", "electrodos kilo", "tornillos 100 unidades").
  'nro', 'numero', 'num', 'pulgada', 'pulgadas', 'pulg', 'saco', 'sacos', 'kilo', 'kilos', 'unidad', 'unidades',
  // Piloto dia 2: "tubo 2x1 6 metros". Los nombres dicen "6 MTS"/"6MTS": el numero si sirve, la palabra no.
  'metro', 'metros', 'mts', 'mt', 'mtrs',
]);

function normalizeWords(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9/#.-]+/).filter(Boolean);
}

// Medidas dichas con palabras (piloto dia 2: "tee de media", "manguera de tres cuartos"). Solo para el bot:
// el POS no pasa por aqui. Los sinonimos no sirven para esto porque "1/2" tambien esta en los nombres
// con 1-1/2" y 2-1/2", y "clavo de media" terminaria ofreciendo un clavo de 1-1/2".
const SPOKEN_NUM: Record<string, string> = { un: '1', una: '1', uno: '1', dos: '2', tres: '3', cuatro: '4' };
const NUM_RE = '(\\d+|un|una|uno|dos|tres|cuatro)';
// "media" que NO es 1/2": "lima media caña", "media docena", "media caja"...
const MEDIA_NOT_INCH = 'cana|luna|docena|caja|bolsa|paca|carga|plancha|lamina|hoja|rollo|resma|tonelada|libra|vuelta|hora|naranja';

// Devuelve el texto con las medidas en fraccion y las que deben ser EXACTAS: 1/2 sin 1-1/2", y 1-1/2 sin 1/2"
// (el buscador toma el "1" de "1-1/2" como prefijo y traeria todo lo de 1/2").
// Recibe el texto ya normalizado (minusculas, sin acentos).
export function spokenMeasures(text: string): { text: string; exact: string[] } {
  const exact = new Set<string>();
  const num = (w?: string) => (w ? SPOKEN_NUM[w] ?? w : '1');
  const fraction = (f: string) => {
    exact.add(f);
    return ` ${f} `;
  };
  const out = text
    // Mixtas primero: "pulgada y media", "una pulgada y media", "1 y media", "dos y media", "pulgada y cuarto".
    .replace(new RegExp(`\\b(?:${NUM_RE}\\s+)?pulgadas?\\s+y\\s+media\\b`, 'g'), (_, n) => fraction(`${num(n)}-1/2`))
    .replace(new RegExp(`\\b${NUM_RE}\\s+y\\s+media\\b`, 'g'), (_, n) => fraction(`${num(n)}-1/2`))
    .replace(new RegExp(`\\b(?:${NUM_RE}\\s+)?pulgadas?\\s+y\\s+(?:un\\s+)?cuarto\\b`, 'g'), (_, n) => fraction(`${num(n)}-1/4`))
    .replace(new RegExp(`\\b${NUM_RE}\\s+y\\s+(?:un\\s+)?cuarto\\b`, 'g'), (_, n) => fraction(`${num(n)}-1/4`))
    // Escritas con marca de pulgadas: 6" / 6 pulgadas / 1/2" / 1-1/2" / 4.1/2" (piloto dia 2: "tubo PVC de 6""
    // traia 56 tubos por el "6MTS" del largo y el de 6" no quedaba entre los 10 que ve el bot). Despues de las
    // mixtas: si no, "2 pulgadas y media" se partiria en 2" + media.
    // "7 1/4"" (con espacio) es 7-1/4".
    .replace(/(?<![\d.,/-])(\d+[-. ]\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*(?:"|”|''|pulgadas?\b|pulg\b\.?)/g,
      (_, n: string) => fraction(/^\d+(?:[.,]\d+)?$/.test(n) ? `${n.replace(',', '.')}"` : n.replace(/[. ]/, '-')))
    .replace(/\btres\s+cuartos?\b/g, () => fraction('3/4'))
    .replace(/\btres\s+octavos?\b/g, () => fraction('3/8'))
    .replace(/\bcinco\s+octavos?\b/g, () => fraction('5/8'))
    // "cuarto" solo NO: en pinturas es cuarto de galon ("esmalte negro cuarto").
    .replace(/\b(?:un\s+)?cuarto\s+de\s+pulgadas?\b/g, () => fraction('1/4'))
    .replace(/\bmedia\s+pulgadas?\b/g, () => fraction('1/2'))
    .replace(new RegExp(`\\bmedia\\b(?!\\s+(?:${MEDIA_NOT_INCH})\\b)`, 'g'), () => fraction('1/2'));
  // 6" se busca como "6" (el nombre puede no traer la marca); el filtro exacto quita "6MTS", "60MM", "6-1/2".
  return { text: out.replace(/(\d)"/g, '$1').replace(/\s+/g, ' ').trim(), exact: [...exact] };
}

// Quita el relleno; si no queda nada, deja la consulta como vino.
// exact: fracciones que vinieron dichas con palabras ("media" -> 1/2) y no deben traer 1-1/2" ni 2-1/2".
export function parseBotQuery(raw: string): { q: string; exact: string[] } {
  // "tubos de 3 por 3" -> "3x3" (medida; "por" es relleno y si se quita queda "3 3").
  // "100mts" / "6metros" -> "100 mts" (luego "mts" se va como relleno y queda el numero).
  const base = (raw || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/(\d+)\s+por\s+(\d+)/g, '$1x$2')
    .replace(/(\d)(metros?|mtrs|mts?)\b/g, '$1 $2');
  const { text, exact } = spokenMeasures(base);
  const words = normalizeWords(text);
  const kept = words.filter((w) => !FILLER.has(w));
  return { q: (kept.length ? kept : words).join(' '), exact };
}

export function cleanBotQuery(raw: string): string {
  return parseBotQuery(raw).q;
}

// Condicion SQL de medida exacta, en el nombre o en los sinonimos (las cabillas dicen "BARRA 12MM" y el 1/2
// viene del sinonimo). Simple ("1/2"): sola, no como parte de 1-1/2", 2 1/2", 11/2. Mixta ("1-1/2"): con
// guion o espacio ("1-1/2", "1 1/2"), no 11-1/2.
// Pulgadas enteras ('6"'): el numero solo, sin otra cifra pegada (60, 6.10, 6-1/2, 16) y sin una unidad
// detras (6MTS, 6 MM, 6 KG...). Los nombres a veces no traen la marca: "DISCO SIERRA MADERA 7 PROMAKER".
// Se evalua con ~* (sin distinguir mayusculas). "4.1/2" es la forma con punto de 4-1/2.
// Sin "gr"/"g" (en discos y lijas es grano: "FIBRO DISCO 7 GR. 120") y "m" no seguida de "/" ("12 M/PLASTICO"
// es mango plastico). La coma solo corta si va entre cifras (3,2MM), no en listas: (6",7",8").
const NOT_INCH_UNITS = 'mts?|mtrs?|metros?|m(?!/)|mm|cm|kgs?|kilos?|lbs?|lts?|litros?|gls?|gal|galon|ml|cc|oz|'
  + 'v|w|amp|amps|hp|kva|psi|rpm|tpi|awg|und|unds|uds|pzas?|piezas?|dientes|d|t|p|k';
export function exactFractionRegex(f: string): string {
  const inch = f.match(/^(\d+(?:\.\d+)?)"$/);
  if (inch) {
    const n = inch[1].replace('.', '\\.');
    return `(^|[^0-9.,/-]|[^0-9][.,])${n}(?![0-9.,/-])(?!\\s*(${NOT_INCH_UNITS})\\M)`;
  }
  const mixed = f.match(/^(\d+)-(\d+\/\d+)$/);
  if (mixed) return `(^|[^0-9])${mixed[1]}[- .]${mixed[2]}($|[^0-9])`;
  return `(^|[^0-9 .-]|(^|[^0-9])[ .-])${f}($|[^0-9])`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `${r2(n).toFixed(2)}$`;

// Herramientas del bot: SOLO LECTURA. Lo que devuelven es lo unico que el bot puede afirmar.
@Injectable()
export class ChatbotToolsService {
  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
    private crossSell: ChatbotCrossSellService,
  ) {}

  private isDivisaException(cfg: ChatbotConfig, p: { id: string; categoryId: string | null }) {
    return cfg.divisaExceptionProductIds.includes(p.id)
      || (!!p.categoryId && cfg.divisaExceptionCategoryIds.includes(p.categoryId));
  }

  divisaPrice(cfg: ChatbotConfig, p: { id: string; categoryId: string | null; priceDetal: number }): string {
    if (this.isDivisaException(cfg, p)) return 'lo confirma un asesor';
    return `${usd(p.priceDetal * (1 - cfg.divisaDiscountPct / 100))} en divisas`;
  }

  // Mismo motor que el POS (searchVector con sinonimos y fracciones + codigos), ordenado para chat:
  // nombre que empieza por lo buscado, normal antes que variante, MAS VENDIDO (nº de facturas en 90 dias, no unidades: los productos por kilo inflarian la cuenta; "cemento" -> el saco
  // de cemento gris), disponible, relevancia y oferta.
  // (Un producto principal AGOTADO no debe quedar fuera: el bot tiene que poder decir que esta agotado.)
  // conversationId null = prueba desde la pantalla (no se registra en el reporte de "sin resultado").
  async searchProducts(cfg: ChatbotConfig, conversationId: string | null, consulta: string, cantidad?: number) {
    const qty = cantidad && Number.isFinite(cantidad) && cantidad > 0 ? cantidad : undefined;
    const parsed = parseBotQuery(consulta || '');
    const q = parsed.q.slice(0, 120);
    // "tee de media": solo 1/2" exacto (sin las de 1-1/2"). Las fracciones que escribe el cliente no se tocan.
    const exactWhere = parsed.exact.length
      ? Prisma.sql`AND ${Prisma.join(
          parsed.exact.map((f) => Prisma.sql`(p.name || ' ' || p."searchKeywords") ~* ${exactFractionRegex(f)}`),
          ' AND ',
        )}`
      : Prisma.empty;
    // Prefijo de la primera palabra (sin plural): "plantas" -> "planta", para priorizar nombres que empiezan asi.
    const head = (q.split(' ')[0] || '').replace(/(es|s)$/, '');
    const tsq = productSearchTsQuery(q);
    let rows: any[] = [];
    if (tsq) {
      const like = `%${q}%`;
      const headLike = `${head}%`;
      rows = await this.prisma.$queryRaw<any[]>`
        SELECT p.id, p.code, p.name, p."priceDetal", p."isOnSale", p."isService", p."categoryId", p."saleBlocked",
          p."primaryImageMediumUrl", p."primaryImageThumbUrl", b.name AS brand, c.name AS category,
          COALESCE((SELECT SUM(s.quantity) FROM "Stock" s JOIN "Warehouse" w ON w.id = s."warehouseId"
                    WHERE s."productId" = p.id AND w."countsForSale" = true), 0)::float AS stock,
          ts_rank(p."searchVector", to_tsquery('spanish', ${tsq})) AS rank,
          COALESCE((SELECT COUNT(DISTINCT ii."invoiceId") FROM "InvoiceItem" ii JOIN "Invoice" i ON i.id = ii."invoiceId"
                    WHERE ii."productId" = p.id AND i.status IN ('PAID', 'PARTIAL_RETURN')
                      AND i."createdAt" >= now() - interval '90 days'), 0)::float AS sold
        FROM "Product" p
        LEFT JOIN "Brand" b ON b.id = p."brandId"
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        -- Los bloqueados para la venta SI se devuelven (como no disponibles y sin precio): asi el bot dice
        -- "no disponible por ahora" en vez de "no lo tenemos" (y no manda al cliente a los aliados).
        WHERE p."isActive" AND p."priceDetal" > 0
          AND (p."searchVector" @@ to_tsquery('spanish', ${tsq})
               OR p.code ILIKE ${like} OR p.barcode ILIKE ${like})
          ${exactWhere}
        ORDER BY (lower(unaccent(p.name)) LIKE ${headLike}) DESC, rank DESC, p.name
        LIMIT ${CANDIDATES}`;
    }
    const reserved = rows.length ? await this.invoices.getReservedStock() : {};

    const ranked = rows
      .map((r) => {
        const free = Number(r.stock) - (reserved[r.id] || 0);
        const available = !r.saleBlocked && (r.isService || free > 0);
        const enough = available && (r.isService || !qty || free >= qty);
        const name = normalizeWords(r.name).join(' ');
        return { r, available, enough, variant: VARIANT_RE.test(r.name), starts: head.length >= 3 && name.startsWith(head) };
      })
      .sort((a, b) =>
        Number(b.starts) - Number(a.starts)
        || Number(a.variant) - Number(b.variant)
        || Number(b.r.sold) - Number(a.r.sold)
        || Number(b.available) - Number(a.available)
        || Number(b.r.rank) - Number(a.r.rank)
        || Number(b.r.isOnSale) - Number(a.r.isOnSale)
        || a.r.name.localeCompare(b.r.name))
      .slice(0, MAX_RESULTS);

    if (conversationId) {
      await this.prisma.chatbotSearchLog.create({
        data: { conversationId, query: q, resultCount: rows.length },
      });
    }

    const suggestions = await this.crossSell.suggestFor(
      conversationId,
      // Solo los que se pueden vender: un agotado no lleva complemento (y no gasta consultas).
      ranked.filter(({ r, available }) => available && !r.saleBlocked).map(({ r }) => ({ id: r.id as string, name: r.name as string })),
    );

    const productos: BotProduct[] = ranked.map(({ r, available, enough, variant }) => ({
      codigo: r.code,
      nombre: r.name,
      marca: r.brand ?? null,
      categoria: r.category ?? null,
      precio_bcv: r.saleBlocked ? 'precio a confirmar con un asesor' : `${usd(Number(r.priceDetal))} bcv`,
      precio_divisas: r.saleBlocked
        ? 'precio a confirmar con un asesor'
        : this.divisaPrice(cfg, { id: r.id, categoryId: r.categoryId, priceDetal: Number(r.priceDetal) }),
      disponible: available,
      en_oferta: !!r.isOnSale,
      variante: variant,
      tiene_foto: !!(r.primaryImageMediumUrl || r.primaryImageThumbUrl),
      ...(qty ? { alcanza: enough } : {}),
      ...(suggestions.get(r.id)?.length ? { ofrecer_tambien: this.formatOffers(suggestions.get(r.id)!) } : {}),
    }));
    // Piloto dia 2: con 56 resultados el bot vio 10 y dijo "el de 6" no lo tenemos". Que no lo concluya.
    const nota = rows.length > productos.length
      ? `Hay ${rows.length} resultados y solo ves los ${productos.length} más vendidos. Si lo que pidió el cliente no está aquí, `
        + 'NO digas que no lo tenemos: busca de nuevo con más detalle (medida, material, marca) o pregúntale al cliente.'
      : undefined;
    return { consulta: q, ...(qty ? { cantidad_pedida: qty } : {}), total_encontrados: rows.length, ...(nota ? { nota } : {}), productos };
  }

  // Nota para el asesor cuando el bot escala porque no alcanza la cantidad: existencia vendible menos
  // lo apartado en facturas en espera (mismo calculo que buscar_productos). Nunca se le da al bot.
  async stockNote(codigo: string, cantidad?: number): Promise<string | null> {
    const p = await this.prisma.product.findFirst({
      where: { code: (codigo || '').trim(), isActive: true },
      select: { id: true, code: true, name: true, isService: true },
    });
    if (!p || p.isService) return null;
    const agg = await this.prisma.stock.aggregate({
      where: { productId: p.id, warehouse: { countsForSale: true } },
      _sum: { quantity: true },
    });
    const reserved = (await this.invoices.getReservedStock())[p.id] || 0;
    const free = Math.max(0, r2(Number(agg._sum.quantity || 0) - reserved));
    const pedido = cantidad && cantidad > 0 ? `pidió ${cantidad}, ` : '';
    return `[Stock en sistema, NO se le dijo al cliente] ${p.code} ${p.name}: ${pedido}hay ${free} disponibles`
      + `${reserved ? `, ${r2(reserved)} apartadas en facturas en espera` : ''}.`;
  }

  // Al bot solo le llega el TIPO (y la medida si aplica), sin producto ni precio: que no elija por el cliente.
  private formatOffers(list: CrossSellOffer[]): NonNullable<BotProduct['ofrecer_tambien']> {
    return list.map((s) => ({ que: s.term, medida: s.measure, regla_id: s.ruleId }));
  }

  // Venta cruzada de UN producto. Se usa al enviar su foto (es cuando el bot lo cotiza): asi el complemento le
  // llega justo ahi, aunque el cliente lo haya elegido de una lista de mensajes atras.
  async crossSellFor(conversationId: string | null, codigo: string) {
    const p = await this.prisma.product.findFirst({
      where: { code: (codigo || '').trim(), isActive: true, saleBlocked: false },
      select: { id: true, name: true },
    });
    if (!p) return [];
    const list = (await this.crossSell.suggestFor(conversationId, [{ id: p.id, name: p.name }])).get(p.id) ?? [];
    return this.formatOffers(list);
  }

  async productImage(codigo: string): Promise<ProductImageOut | null> {
    const p = await this.prisma.product.findFirst({
      where: { code: (codigo || '').trim(), isActive: true },
      select: { code: true, name: true, primaryImageMediumUrl: true, primaryImageThumbUrl: true },
    });
    const url = p?.primaryImageMediumUrl || p?.primaryImageThumbUrl;
    return p && url ? { code: p.code, name: p.name, url } : null;
  }

  // Bs con la tasa BCV GUARDADA del dia (regla del proyecto: nunca calcular la tasa en el momento).
  async toBolivares(montoUsd?: number, codigo?: string) {
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: caracasDateKey() } });
    if (!rate) return { error: 'Todavía no está cargada la tasa BCV de hoy. Un asesor puede dar el monto en bolívares.' };
    let amount = Number(montoUsd);
    let producto: string | undefined;
    if (codigo) {
      const p = await this.prisma.product.findFirst({
        where: { code: codigo.trim(), isActive: true },
        select: { name: true, priceDetal: true },
      });
      if (!p) return { error: `No existe el producto ${codigo}` };
      amount = p.priceDetal;
      producto = p.name;
    }
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Indique un monto en dólares o un código de producto' };
    const bs = r2(amount * rate.rate);
    return {
      producto,
      monto_usd: usd(amount),
      tasa_bcv: rate.rate,
      monto_bs: `Bs ${bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  }
}
