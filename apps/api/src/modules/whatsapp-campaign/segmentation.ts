// Clasificacion de clientes para la campana de WhatsApp (port de la pagina local
// Desktop/campana-whatsapp, modo V2). Funciones puras: el servicio les pasa las filas de la BD.
//
// Rubro: dinero comprado por categoria + palabras clave del producto. El oficio solo se asigna si
// compro ese rubro en 2+ dias distintos; si no, "Comprador ocasional - X".
// Segmento: VIP (5+ dias y $400+, o $1000+), Frecuente (3-4 dias), Recurrente (2), Ocasional (1).
// Estado: Activo <=30 dias sin comprar, Enfriandose 31-60, Inactivo >60.

export const BASES: Record<string, { label: string; area: string }> = {
  CONST: { label: 'Albañil / Construcción', area: 'material de construcción' },
  TECHO: { label: 'Techos e impermeabilización', area: 'techos e impermeabilización' },
  HERR: { label: 'Herrero / Soldador', area: 'herrería y soldadura' },
  ELEC: { label: 'Electricista', area: 'material eléctrico' },
  PLOM: { label: 'Plomero', area: 'plomería' },
  PINT: { label: 'Pintor', area: 'pinturas' },
  ACAB: { label: 'Ceramista / Acabados', area: 'cerámicas y acabados' },
  AGRO: { label: 'Agro / Jardinería', area: 'agro y jardinería' },
  MEC: { label: 'Mecánico / Automotriz', area: 'herramientas de mecánica' },
  OBRA: { label: 'Contratista / Obra general', area: 'tu obra' },
  EQUIP: { label: 'Herramientas y equipos', area: 'herramientas y equipos' },
  HOGAR: { label: 'Hogar / Ferretería general', area: 'ferretería y hogar' },
};

const NEUTRAL = new Set(['EQUIP', 'HOGAR']);

// Categorias de la grande -> rubro (las que no estan caen en HOGAR; SERVICIO no cuenta).
const CAT: Record<string, string> = {
  CEMENTO: 'CONST', BLOQUES: 'CONST', CONSTRUCCION: 'CONST', 'CONSTRUCCION EXTERNA': 'CONST', ACEROLIT: 'CONST',
  'HERRAMIENTAS DE CONSTRUCCION': 'CONST', 'CLAVOS - CONFITERIA': 'CONST',
  ZINC: 'TECHO', 'LAMINAS PARA TECHO': 'TECHO', 'IMPERMEABILIZANTES EXTERIOR': 'TECHO', IMPERMIABILIZANTES: 'TECHO',
  HERRERIA: 'HERR', ELECTRICIDAD: 'ELEC', 'ELECTRICIDAD EXTERNA': 'ELEC', PLOMERIA: 'PLOM', 'PLOMERIA EXTERIOR': 'PLOM',
  'TUBERIAS PVC': 'PLOM', PINTURAS: 'PINT', 'PORCELANATO Y CERAMICA': 'ACAB', REVESTIMIENTO: 'ACAB', HERRAMIENTAS: 'EQUIP',
  FERRETERIA: 'HOGAR', 'FERRETERIA EXTERNO': 'HOGAR', TORNILLERIA: 'HOGAR', 'MERCANCIAS VARIAS': 'HOGAR', General: 'HOGAR',
  CERRAJERIA: 'HOGAR', PROMOCION: 'HOGAR', REPUESTOS: 'HOGAR',
};

// Palabras clave del nombre del producto: tienen prioridad sobre la categoria.
const KW: [string, RegExp][] = [
  ['MEC', /\bBATERIA\b.*12V|\bDADOS?\b|LLAVE.*IMPACTO|GATO (HIDR|TIPO|ZORRA)|HERRAM.*NEUMAT|ACEITE.*MOTOR|ACEITE (20W|15W|10W|SAE)|EXTRACTOR.*(POLEA|ROLIN)|CARGADOR.*BATERIA|CABLE.*AUXILIO|LLAVES? (COMBINADA|MIXTA)|JUEGO.*LLAVE|TORQUIMETRO|AUTOMOTRIZ/],
  ['AGRO', /DESMALEZADORA|MOTOSIERRA|FUMIGADORA|PUAS|2 TIEMPOS|MACHETE|ESCARDILLA|P\/RIEGO|ASPERSOR|CERCA ELECTRICA|ELECTRIFICADOR/],
  ['HERR', /SOLDAR|ELECTRODO|DISCO.*CORTE.*MET|DISCO.*DE?BASTE/],
  ['CONST', /BARRA CON RESALTE|ALAMBRON|MALLA TRUCKSON|ELECTROSOLDADA|CABILLA|DRYWALL/],
  ['PLOM', /BOMBA (PERIFERICA|CENTRIFUGA|SUMERGIBLE|D\/AGUA|DE AGUA)|FREGADERO|LAVAMANO|POCETA|SANITARIO|DUCHA|GRIFERIA|TANQUE/],
  ['EQUIP', /PLANTA GENERADOR|ESTACION DE ENERGIA|HIDROJET|COMPRESOR|ESMERIL|TALADRO|ROTOMARTILLO|SIERRA|LIJADORA|PULIDORA|ASPIRADORA|INVERSOR/],
];

const SHORT: Record<string, string> = {
  CONST: 'Construcción', TECHO: 'Techos', HERR: 'Herrería / Soldadura', ELEC: 'Electricidad', PLOM: 'Plomería',
  PINT: 'Pintura', ACAB: 'Cerámica / Acabados', AGRO: 'Agro / Jardinería', MEC: 'Mecánica / Automotriz',
};

// Organizaciones cargadas con cedula: no se les saluda por nombre de pila.
const ORG = /\b(COMUNA|CONSEJO|COMUNAL|ALCALD|GOBERN|UNIDAD|U\.?E\.?|ESCUELA|COLEGIO|LICEO|ASOCIACI|FUNDACI|INVERSION|CONSTRUCTORA|COOPERATIVA|IGLESIA|MINISTERIO|INSTITUTO|CORPORACI|EMPRESA|COMERCIAL|FERRETER|AGROPECUARIA|HACIENDA|FINCA|GRUPO|C\.?A\.?|S\.?A\.?|SOCIEDAD|CLUB|HOSPITAL|EMPRENDIMIENTO|DISTRIBUIDORA|MULTISERVICIOS|BODEGA|TALLER|AUTOMOTRIZ|SERVICIOS|PANADERIA|REPRESENTACIONES|PROYECTOS|SUMINISTROS|TIENDA|MATERIALES|CLINICA|CONDOMINIO|RESIDENCIA|UNIVERSIDAD)\b/i;

export type Segment = 'VIP' | 'Frecuente' | 'Recurrente' | 'Ocasional';
export type Estado = 'Activo' | 'Enfriándose' | 'Inactivo';

export interface CampaignCustomer {
  id: string;
  c: string; // codigo
  n: string; // nombre
  fn: string; // nombre de pila ('' si empresa u organizacion)
  t: 'Persona' | 'Empresa';
  wa: string; // 58XXXXXXXXXX
  r: string; // rubro (texto)
  b: string; // base del rubro (clave de BASES)
  o: 0 | 1; // 1 = de oficio, 0 = ocasional
  sg: Segment;
  st: Estado;
  d: number; // dias sin comprar
  u: string; // ultima compra YYYY-MM-DD
  tot: number; // total comprado USD
  dc: number; // dias con compra
  p: string; // producto que mas compro
}

export interface SegInputs {
  todayYmd: string; // hoy en Caracas
  customers: { id: string; code: string | null; name: string; documentType: string; phone: string | null; isEmployee: boolean; isGroupCompany: boolean }[];
  invoiceAgg: { customerId: string; dias: number; ultima: string }[];
  products: { id: string; name: string; cat: string | null }[];
  lines: { customerId: string; productId: string; dia: string; usd: number }[];
}

function bucket(p?: { name: string; cat: string | null }): string | null {
  if (!p) return 'HOGAR';
  for (const [b, re] of KW) if (re.test(p.name)) return b;
  if (p.cat === 'SERVICIO') return null;
  return (p.cat && CAT[p.cat]) || 'HOGAR';
}

/** Normaliza un telefono venezolano a 58XXXXXXXXXX (movil); '' si no es un movil valido. */
export function waNumber(raw: string | null): string {
  const s = String(raw || '');
  const parts = s.replace(/\D/g, ' ').trim().split(/\s+/);
  for (let d of [s.replace(/\D/g, ''), ...parts]) {
    if (d.startsWith('58') && d.length === 12) d = '0' + d.slice(2);
    if (d.length === 10 && d[0] === '4') d = '0' + d;
    if (/^04(12|14|16|22|24|26)\d{7}$/.test(d)) {
      if (/(\d)\1{5}|1234567|7654321|1234456/.test(d.slice(4))) return '';
      return '58' + d.slice(1);
    }
  }
  return '';
}

const title = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());

function firstName(name: string, tipo: string): string {
  if (tipo === 'Empresa') return '';
  const full = String(name || '').trim();
  if (ORG.test(full)) return '';
  const t = full.split(/\s+/)[0] || '';
  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}$/.test(t) ? title(t) : '';
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const dayMs = 864e5;

export function estadoFor(diasSinComprar: number): Estado {
  return diasSinComprar <= 30 ? 'Activo' : diasSinComprar <= 60 ? 'Enfriándose' : 'Inactivo';
}

const SEG_ORDER: Record<Segment, number> = { VIP: 0, Frecuente: 1, Recurrente: 2, Ocasional: 3 };
const ST_ORDER: Record<Estado, number> = { 'Enfriándose': 0, Activo: 1, Inactivo: 2 };

/**
 * Devuelve los clientes con WhatsApp valido ya clasificados (ordenados: segmento, estado, monto)
 * y, por cliente, sus dias de compra ordenados (para el grupo control de Resultados).
 */
export function segmentCustomers(input: SegInputs): { customers: CampaignCustomer[]; purchaseDays: Map<string, string[]> } {
  const prod = new Map(input.products.map((p) => [p.id, p]));
  const inv = new Map(input.invoiceAgg.map((r) => [r.customerId, r]));
  const today = Date.parse(input.todayYmd + 'T00:00:00Z');

  type Acc = { b: Record<string, number>; days: Record<string, Set<string>>; tradeDays: Set<string>; prods: Map<string, number>; tot: number; allDays: Set<string> };
  const per = new Map<string, Acc>();
  for (const l of input.lines) {
    const p = prod.get(l.productId);
    const b = bucket(p);
    if (!b) continue;
    const u = +l.usd;
    if (!(u > 0)) continue;
    let o = per.get(l.customerId);
    if (!o) { o = { b: {}, days: {}, tradeDays: new Set(), prods: new Map(), tot: 0, allDays: new Set() }; per.set(l.customerId, o); }
    o.b[b] = (o.b[b] || 0) + u;
    o.tot += u;
    if (p) o.prods.set(p.name, (o.prods.get(p.name) || 0) + u);
    (o.days[b] || (o.days[b] = new Set())).add(l.dia);
    if (!NEUTRAL.has(b)) o.tradeDays.add(l.dia);
    o.allDays.add(l.dia);
  }

  const out: CampaignCustomer[] = [];
  const purchaseDays = new Map<string, string[]>();

  for (const c of input.customers) {
    const o = per.get(c.id);
    const iv = inv.get(c.id);
    if (!o || !iv || o.tot <= 0) continue;
    if (c.isEmployee || c.isGroupCompany) continue;
    const wa = waNumber(c.phone);
    if (!wa) continue;
    const tipo: 'Persona' | 'Empresa' = ['J', 'G'].includes(c.documentType) ? 'Empresa' : 'Persona';

    const ent = Object.entries(o.b).sort((a, b) => b[1] - a[1]);
    const trades = ent.filter(([k]) => !NEUTRAL.has(k));
    const tradeTot = trades.reduce((a, [, v]) => a + v, 0);

    // base = clave del rubro; oficio = compro ese rubro (no neutral) en 2+ dias
    let base: string;
    let oficio: boolean;
    let rubro: string;
    if (tradeTot / o.tot >= 0.4) {
      const s1 = trades[0][1] / tradeTot;
      const strong = trades.filter(([, v]) => v / tradeTot >= 0.15).length;
      if (s1 < 0.5 && strong >= 3) {
        base = 'OBRA';
        oficio = o.tradeDays.size >= 2;
        rubro = oficio ? BASES.OBRA.label : 'Comprador ocasional - Obra general';
      } else {
        base = trades[0][0];
        oficio = (o.days[base]?.size ?? 0) >= 2;
        rubro = oficio ? BASES[base].label : 'Comprador ocasional - ' + SHORT[base];
      }
    } else {
      base = ent.filter(([k]) => NEUTRAL.has(k))[0][0];
      oficio = false;
      rubro = BASES[base].label;
    }

    const dias = +iv.dias;
    const usd = r2(o.tot);
    const dsd = Math.round((today - Date.parse(iv.ultima + 'T00:00:00Z')) / dayMs);
    const seg: Segment = (dias >= 5 && usd >= 400) || usd >= 1000 ? 'VIP' : dias >= 3 ? 'Frecuente' : dias === 2 ? 'Recurrente' : 'Ocasional';
    const top = [...o.prods].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    out.push({
      id: c.id, c: c.code || '', n: c.name, fn: firstName(c.name, tipo), t: tipo, wa,
      r: rubro, b: base, o: oficio ? 1 : 0, sg: seg, st: estadoFor(dsd), d: dsd, u: iv.ultima,
      tot: usd, dc: dias, p: top,
    });
    purchaseDays.set(c.id, [...o.allDays].sort());
  }

  out.sort((a, b) => SEG_ORDER[a.sg] - SEG_ORDER[b.sg] || ST_ORDER[a.st] - ST_ORDER[b.st] || b.tot - a.tot);
  return { customers: out, purchaseDays };
}
