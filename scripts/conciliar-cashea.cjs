#!/usr/bin/env node
'use strict';

/**
 * Conciliación Cashea -> Banco -> Trinity ERP (Recibos de cobro en BORRADOR)
 *
 * Soporta dos modos en un solo script:
 *   Modo 1 (2 Excels): --cashea <archivo> --banco <archivo>
 *     1) Cruza Cashea vs Banco por Referencia, Monto Bs y Fecha exacta.
 *        Cualquier diferencia (ref, monto o fecha) va al Excel de Incidencias.
 *     2) Cruza los validados contra las CxC de Cashea en Trinity por Orden.
 *     3) Agrupa pagos de la misma Orden en el mismo día en 1 sola línea.
 *     4) Crea 1 Recibo de Cobro en BORRADOR (DRAFT) por cada fecha, usando
 *        la tasa del día guardada en Trinity.
 *
 *   Modo 2 (1 Excel ya validado): --cashea <archivo> (sin --banco)
 *     Salta la validación de banco y cruza directo contra Trinity por Orden.
 *
 * Por defecto corre en modo SIMULACIÓN (solo lectura, NO escribe en la BD).
 * Para crear los borradores en Trinity pasar explícitamente: --apply
 *
 * Ejemplos:
 *   node scripts/conciliar-cashea.cjs --empresa total --cashea "cashea.xlsx" --banco "banco.xlsx"
 *   node scripts/conciliar-cashea.cjs --empresa total --cashea "cashea.xlsx" --banco "banco.xlsx" --apply
 *   node scripts/conciliar-cashea.cjs --empresa totalturen --cashea "validados.xlsx" --apply
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const XLSX = require(path.join(REPO_ROOT, 'apps', 'api', 'node_modules', 'xlsx'));

// ── Catálogo de empresas Trinity ─────────────────────────────────────────────
const EMPRESAS = {
  grande: {
    key: 'grande',
    label: 'Inversiones El Trébol (grande)',
    host: '134.209.164.59',
    dir: '/opt/Trinity',
    defaultSucursal: null,
  },
  mayor: {
    key: 'mayor',
    label: 'Trébol Mayorista',
    host: '134.209.164.59',
    dir: '/opt/Trinity-mayor',
    defaultSucursal: null,
  },
  chica: {
    key: 'chica',
    label: 'Ferretería El Trébol (chica)',
    host: '134.209.220.233',
    dir: '/opt/Trinity',
    defaultSucursal: null,
  },
  total: {
    key: 'total',
    label: 'Total Acarigua',
    host: '161.35.52.221',
    dir: '/opt/total',
    defaultSucursal: 'Total Acarigua',
  },
  totalturen: {
    key: 'totalturen',
    label: 'Total Turén',
    host: '161.35.52.221',
    dir: '/opt/totalturen',
    defaultSucursal: 'Total Turen',
  },
  aceros: {
    key: 'aceros',
    label: 'Aceros',
    host: '147.182.130.6',
    dir: '/opt/aceros',
    defaultSucursal: null,
  },
  acerosmayor: {
    key: 'acerosmayor',
    label: 'Aceros Mayorista',
    host: '147.182.130.6',
    dir: '/opt/acerosmayor',
    defaultSucursal: null,
  },
};

const ALIASES = {
  inversiones: 'grande',
  trebolmayor: 'mayor',
  eltrebol: 'chica',
  'total-acarigua': 'total',
  acarigua: 'total',
  turen: 'totalturen',
  'total-turen': 'totalturen',
};

// ── Utilidades ───────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function stripAccents(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normText(str) {
  return stripAccents(str).replace(/\s+/g, ' ').trim().toLowerCase();
}

function normRef(val) {
  if (val === null || val === undefined) return '';
  let s = typeof val === 'number' ? val.toFixed(0) : String(val);
  s = s.trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}

function cleanRef(val) {
  return normRef(val).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function stripLeadingZeros(val) {
  const s = normRef(val);
  if (!s) return '';
  const stripped = s.replace(/^0+/, '');
  return stripped || '0';
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  let s = String(val).trim();
  if (!s) return NaN;
  // Quitar símbolos de moneda y espacios
  s = s.replace(/^(Bs\.?|VES|USD|\$)\s*/i, '').replace(/\s+/g, '');
  // Detectar formato venezolano/europeo: 29.622,86 vs 29,622.86 vs 29622.86
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 4) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseDateYmd(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val) && val > 20000 && val < 90000) {
    const d = XLSX.SSF.parse_date_code(val);
    if (d && d.y && d.m && d.d) {
      return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, '0')}-${String(val.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  // YYYY-MM-DD (opcionalmente con hora)
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  // DD/MM/YYYY o DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

// Fórmula exacta de ReceiptsService.bsToday()
function bsToday(amountUsd, historicBs, docRate, effectiveRate) {
  if (docRate && Math.abs(docRate - effectiveRate) < 0.0001) return round2(historicBs);
  return round2(amountUsd * effectiveRate);
}

// ── Parseo de argumentos CLI ─────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    empresa: null,
    cashea: null,
    banco: null,
    sucursal: null,
    todasSucursales: false,
    out: null,
    apply: false,
    soloBancoCruce: false,
    local: false,
    createdBy: null,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--todas-sucursales') opts.todasSucursales = true;
    else if (a === '--solo-banco-cruce') opts.soloBancoCruce = true;
    else if (a === '--local') opts.local = true;
    else if (a === '--empresa' || a === '-e') opts.empresa = argv[++i];
    else if (a === '--cashea' || a === '-c') opts.cashea = argv[++i];
    else if (a === '--banco' || a === '-b') opts.banco = argv[++i];
    else if (a === '--sucursal' || a === '-s') opts.sucursal = argv[++i];
    else if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--created-by') opts.createdBy = argv[++i];
    else {
      throw new Error(`Argumento no reconocido: ${a}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
Conciliación Cashea -> Banco -> Trinity ERP (Borradores de Recibo de Cobro)

Uso:
  node scripts/conciliar-cashea.cjs --empresa <nombre> --cashea <archivo> [--banco <archivo>] [opciones]

Empresas disponibles:
  grande (inversiones), mayor (trebolmayor), chica (eltrebol),
  total (Total Acarigua), totalturen (Total Turen), aceros, acerosmayor

Opciones:
  --empresa, -e <nombre>    Empresa destino en Trinity (obligatorio salvo --solo-banco-cruce)
  --cashea,  -c <archivo>   Excel/CSV de Cashea (o Excel ya validado en modo 1 archivo)
  --banco,   -b <archivo>   Excel/CSV del Banco (opcional; si se omite corre en modo 1 archivo)
  --sucursal,-s <texto>     Filtro manual de columna Sucursal (sobrescribe el de la empresa)
  --todas-sucursales        Procesa todas las filas sin filtrar por Sucursal
  --out,     -o <archivo>   Ruta del Excel de reporte/incidencias (.xlsx)
  --apply                   Crea los recibos en BORRADOR en Trinity (sin esto es solo simulación)
  --solo-banco-cruce        Solo prueba el cruce Cashea vs Banco sin conectarse a Trinity
  --local                   Conecta a la BD local (apps/api/.env) en vez de SSH al servidor
  --created-by <email>      Email del usuario creador de los recibos (default: ADMIN activo)
`);
}

function resolveEmpresa(name) {
  if (!name) return null;
  const key = normText(name).replace(/\s+/g, '');
  const canonical = ALIASES[key] || key;
  const emp = EMPRESAS[canonical];
  if (!emp) {
    throw new Error(`Empresa desconocida: "${name}". Opciones: ${Object.keys(EMPRESAS).join(', ')}`);
  }
  return emp;
}

// ── Lectura de Excel / CSV ───────────────────────────────────────────────────

function readSpreadsheetRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { raw: true, cellDates: false, codepage: 65001 });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  return { sheetName, rows };
}

function parseBancoFile(filePath) {
  const { rows } = readSpreadsheetRows(filePath);
  const headerIdx = rows.findIndex((r) => {
    const norm = r.map(normText);
    const hasFecha = norm.some((c) => c === 'fecha' || c.startsWith('fecha '));
    const hasRef = norm.some((c) => c.includes('referencia'));
    const hasHaber = norm.some((c) => c === 'haber' || c === 'credito' || c === 'abono' || c === 'monto');
    return hasFecha && hasRef && hasHaber;
  });

  if (headerIdx === -1) {
    throw new Error(`No se encontró la fila de encabezados (Fecha / Referencia / Haber) en el archivo de Banco: ${filePath}`);
  }

  const headers = rows[headerIdx].map(normText);
  const idxFecha = headers.findIndex((h) => h === 'fecha' || h.startsWith('fecha '));
  const idxRef = headers.findIndex((h) => h === 'referencia' || h.includes('referencia'));
  const idxHaber = headers.findIndex((h) => h === 'haber' || h === 'credito' || h === 'abono' || h === 'monto');
  const idxTipoOp = headers.findIndex((h) => h.includes('tipo operacion') || h.includes('operacion'));
  const idxDesc = headers.findIndex((h) => h.includes('descripcion') || h.includes('concepto'));

  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
    const fecha = parseDateYmd(r[idxFecha]);
    const ref = normRef(r[idxRef]);
    const haber = parseNum(r[idxHaber]);
    if (!ref || isNaN(haber)) continue;
    records.push({
      id: i,
      rowNum: i + 1,
      fecha,
      ref,
      refNoZero: stripLeadingZeros(ref),
      haber: round2(haber),
      tipoOp: idxTipoOp >= 0 ? String(r[idxTipoOp] ?? '').trim() : '',
      descripcion: idxDesc >= 0 ? String(r[idxDesc] ?? '').trim() : '',
      usedByAnyCashea: false,
      usedByTarget: false,
    });
  }
  return records;
}

function parseCasheaFile(filePath, hasBanco) {
  const { rows } = readSpreadsheetRows(filePath);
  const headerIdx = rows.findIndex((r) => {
    const norm = r.map(normText);
    const hasOrden = norm.some((c) => c === 'orden' || c.includes('orden'));
    const hasMonto = norm.some((c) => c.includes('monto asignado') || c.includes('usd') || c === 'monto');
    return hasOrden && hasMonto;
  });

  if (headerIdx === -1) {
    throw new Error(`No se encontró la fila de encabezados (Orden / Monto asignado) en el archivo de Cashea: ${filePath}`);
  }

  const headers = rows[headerIdx].map(normText);
  const idxFecha = headers.findIndex((h) => h.includes('fecha'));
  const idxVes = headers.findIndex((h) => h.includes('ves') || h.includes('bolivar') || h === 'bs' || h.includes('monto bs'));
  const idxRef = headers.findIndex((h) => h === 'referencia' || h.includes('referencia'));
  const idxCuota = headers.findIndex((h) => h.includes('cuota'));
  const idxSucursal = headers.findIndex((h) => h.includes('sucursal') || h.includes('tienda') || h.includes('sede'));
  const idxFactura = headers.findIndex((h) => h.includes('factura'));
  const idxOrden = headers.findIndex((h) => h === 'orden' || h.includes('orden'));
  const idxUsd = headers.findIndex((h) => h.includes('monto asignado') || h.includes('usd') || h === 'monto');

  if (idxFecha === -1) {
    throw new Error(`Falta columna de Fecha en el archivo de Cashea: ${filePath}`);
  }
  if (hasBanco && (idxRef === -1 || idxVes === -1)) {
    throw new Error(`En modo 2 Excels (con banco), el archivo de Cashea requiere columnas Referencia y Monto pagado en VES.`);
  }

  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => String(c ?? '').trim() === '')) continue;
    const rawOrden = normRef(r[idxOrden]);
    const rawRef = idxRef >= 0 ? normRef(r[idxRef]) : '';
    const rawFecha = r[idxFecha];
    // Ignorar posibles filas de totales al pie
    if (normText(rawFecha).startsWith('total') || normText(rawOrden).startsWith('total')) continue;
    if (!rawOrden && !rawRef) continue;

    records.push({
      rowNum: i + 1,
      fecha: parseDateYmd(rawFecha),
      rawFecha: String(rawFecha ?? '').trim(),
      ves: idxVes >= 0 ? parseNum(r[idxVes]) : NaN,
      ref: rawRef,
      refNoZero: stripLeadingZeros(rawRef),
      cuota: idxCuota >= 0 ? String(r[idxCuota] ?? '').trim() : '',
      sucursal: idxSucursal >= 0 ? String(r[idxSucursal] ?? '').trim() : '',
      factura: idxFactura >= 0 ? normRef(r[idxFactura]) : '',
      orden: rawOrden,
      usdRaw: parseNum(r[idxUsd]),
    });
  }

  return {
    hasSucursalCol: idxSucursal >= 0,
    records,
  };
}

// ── Paso 1: Cruce Cashea vs Banco ────────────────────────────────────────────

function matchBankRows(casheaAll, targetRows, bankRecords) {
  // Índice por referencia exacta y sin ceros iniciales
  const byExact = new Map();
  const byNoZero = new Map();
  for (const b of bankRecords) {
    if (!byExact.has(b.ref)) byExact.set(b.ref, []);
    byExact.get(b.ref).push(b);
    if (!byNoZero.has(b.refNoZero)) byNoZero.set(b.refNoZero, []);
    byNoZero.get(b.refNoZero).push(b);
  }

  // Marcar qué referencias del banco pertenecen a cualquier fila de Cashea (incluyendo otras sucursales)
  // para que "Solo en Banco" solo muestre movimientos realmente ajenos al archivo de Cashea.
  const allCasheaRefsExact = new Set(casheaAll.map((c) => c.ref).filter(Boolean));
  const allCasheaRefsNoZero = new Set(casheaAll.map((c) => c.refNoZero).filter(Boolean));
  for (const b of bankRecords) {
    if (allCasheaRefsExact.has(b.ref) || allCasheaRefsNoZero.has(b.refNoZero)) {
      b.usedByAnyCashea = true;
    }
  }

  const validated = [];
  const incidencias = [];

  for (const c of targetRows) {
    if (!c.fecha || !c.orden || isNaN(c.usdRaw) || c.usdRaw <= 0 || !c.ref || isNaN(c.ves)) {
      incidencias.push({
        tipo: 'DATO_INVALIDO',
        detalle: `Fila ${c.rowNum} con datos incompletos o inválidos (fecha="${c.rawFecha}", orden="${c.orden}", ref="${c.ref}", VES=${c.ves}, USD=${c.usdRaw})`,
        cashea: c,
        banco: null,
      });
      continue;
    }

    const candidates = (byExact.get(c.ref) || byNoZero.get(c.refNoZero) || []).filter((b) => !b.usedByTarget);
    if (candidates.length === 0) {
      incidencias.push({
        tipo: 'NO_ENCONTRADO_EN_BANCO',
        detalle: `Referencia "${c.ref}" no encontrada en el estado de cuenta del banco`,
        cashea: c,
        banco: null,
      });
      continue;
    }

    // Priorizar candidato que coincida en monto + fecha, luego monto, luego fecha, luego primero
    let best = candidates.find((b) => Math.abs(round2(c.ves - b.haber)) <= 0.01 && b.fecha === c.fecha);
    if (!best) best = candidates.find((b) => Math.abs(round2(c.ves - b.haber)) <= 0.01);
    if (!best) best = candidates.find((b) => b.fecha === c.fecha);
    if (!best) best = candidates[0];
    best.usedByTarget = true;

    const diffVes = round2(c.ves - best.haber);
    const amountMismatch = Math.abs(diffVes) > 0.01;
    const dateMismatch = c.fecha !== best.fecha;

    if (amountMismatch && dateMismatch) {
      incidencias.push({
        tipo: 'MONTO_Y_FECHA_DIFERENTE_BANCO',
        detalle: `Ref "${c.ref}": monto Cashea Bs ${c.ves.toFixed(2)} vs Banco Bs ${best.haber.toFixed(2)} (dif ${diffVes.toFixed(2)}); fecha Cashea ${c.fecha} vs Banco ${best.fecha}`,
        cashea: c,
        banco: best,
      });
      continue;
    }

    if (amountMismatch) {
      incidencias.push({
        tipo: 'MONTO_DIFERENTE_BANCO',
        detalle: `Ref "${c.ref}": monto Cashea Bs ${c.ves.toFixed(2)} vs Banco Bs ${best.haber.toFixed(2)} (dif ${diffVes.toFixed(2)})`,
        cashea: c,
        banco: best,
      });
      continue;
    }

    if (dateMismatch) {
      incidencias.push({
        tipo: 'FECHA_DIFERENTE_BANCO',
        detalle: `Ref "${c.ref}": fecha Cashea ${c.fecha} no coincide con fecha Banco ${best.fecha} (monto Bs ${best.haber.toFixed(2)} coincide)`,
        cashea: c,
        banco: best,
      });
      continue;
    }

    validated.push({ ...c, bancoFecha: best.fecha, bancoHaber: best.haber });
  }

  const soloEnBanco = bankRecords.filter((b) => !b.usedByAnyCashea);
  return { validated, incidencias, soloEnBanco };
}

// ── Agrupación por (Fecha, Orden) — Regla #2 ─────────────────────────────────

function groupByDateAndOrder(validatedRows) {
  const map = new Map();
  for (const r of validatedRows) {
    const ordenKey = cleanRef(r.orden);
    const key = `${r.fecha}|${ordenKey}`;
    if (!map.has(key)) {
      map.set(key, {
        fecha: r.fecha,
        orden: r.orden,
        ordenClean: ordenKey,
        sucursal: r.sucursal,
        usdSumRaw: 0,
        vesSumRaw: 0,
        referencias: [],
        cuotas: [],
        facturas: [],
        rows: [],
      });
    }
    const g = map.get(key);
    g.usdSumRaw += r.usdRaw;
    if (!isNaN(r.ves)) g.vesSumRaw += r.ves;
    if (r.ref && !g.referencias.includes(r.ref)) g.referencias.push(r.ref);
    if (r.cuota && !g.cuotas.includes(r.cuota)) g.cuotas.push(r.cuota);
    if (r.factura && !g.facturas.includes(r.factura)) g.facturas.push(r.factura);
    g.rows.push(r);
  }

  return [...map.values()]
    .map((g) => ({
      ...g,
      amountUsd: round2(g.usdSumRaw),
      amountVes: round2(g.vesSumRaw),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden.localeCompare(b.orden));
}

// ── Bridge remoto / local con Prisma ─────────────────────────────────────────

const REMOTE_PRISMA_RUNNER = `
const fs = require('fs');
const path = require('path');

// Cargar .env de apps/api sin dependencias externas
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));

  if (input.action === 'fetch') {
    const receivables = await prisma.receivable.findMany({
      where: {
        type: 'FINANCING_PLATFORM',
        platformName: { contains: 'cashea', mode: 'insensitive' },
      },
      select: {
        id: true,
        number: true,
        platformName: true,
        reference: true,
        documentNumber: true,
        amountUsd: true,
        amountBs: true,
        exchangeRate: true,
        paidAmountUsd: true,
        paidAmountBs: true,
        status: true,
        createdAt: true,
        invoice: { select: { id: true, number: true } },
      },
    });

    const draftItems = await prisma.receiptItem.findMany({
      where: {
        itemType: 'RECEIVABLE',
        receivableId: { not: null },
        receipt: { status: 'DRAFT', type: 'COLLECTION' },
      },
      select: {
        receivableId: true,
        amountUsd: true,
        receipt: { select: { id: true, number: true, documentDate: true } },
      },
    });

    const dateObjs = (input.dates || []).map((d) => new Date(d + 'T00:00:00.000Z'));
    const rates = dateObjs.length
      ? await prisma.exchangeRate.findMany({
          where: { date: { in: dateObjs } },
          select: { date: true, rate: true },
        })
      : [];

    const admins = await prisma.user.findMany({
      where: { isActive: true, role: 'ADMIN' },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    process.stdout.write(JSON.stringify({
      ok: true,
      receivables,
      draftItems,
      rates: rates.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        rate: r.rate,
      })),
      admins,
    }));
    return;
  }

  if (input.action === 'apply') {
    const { receipts, createdById } = input;
    const created = await prisma.$transaction(async (tx) => {
      // Lock consultivo para serializar numeración RCB-XXXX dentro de la tx
      await tx.$executeRaw\`SELECT pg_advisory_xact_lock(7742091)\`;

      // Obtener el mayor correlativo existente (por createdAt y por máximo numérico)
      const maxRows = await tx.$queryRaw\`
        SELECT GREATEST(
          COALESCE((
            SELECT MAX(CAST(split_part(number, '-', 2) AS INTEGER))
            FROM "Receipt"
            WHERE number ~ '^RCB-[0-9]+$'
          ), 0),
          0
        )::int AS max_num
      \`;
      let nextNum = (maxRows[0]?.max_num || 0) + 1;

      const results = [];
      const baseTime = Date.now();
      const batchReserved = new Map();

      for (let i = 0; i < receipts.length; i++) {
        const plan = receipts[i];
        // Re-validar dentro de la transacción que las CxC siguen abiertas y con saldo acumulado suficiente
        const recIds = plan.items.filter((it) => it.receivableId).map((it) => it.receivableId);
        const fresh = await tx.receivable.findMany({
          where: { id: { in: recIds } },
          select: { id: true, status: true, amountUsd: true, paidAmountUsd: true },
        });
        const freshMap = new Map(fresh.map((f) => [f.id, f]));
        for (const it of plan.items) {
          if (!it.receivableId) continue;
          const r = freshMap.get(it.receivableId);
          if (!r) throw new Error('CxC desapareció antes de crear recibo: ' + it.receivableId);
          if (r.status === 'PAID') throw new Error('CxC ya pasó a PAID antes de crear recibo: ' + it.description);
          const alreadyReserved = batchReserved.get(it.receivableId) || 0;
          const bal = round2(r.amountUsd - r.paidAmountUsd - alreadyReserved);
          if (it.amountUsd > bal + 0.01) {
            throw new Error('CxC ' + it.description + ' ya no tiene saldo suficiente (' + bal + ' vs ' + it.amountUsd + ')');
          }
          batchReserved.set(it.receivableId, round2(alreadyReserved + it.amountUsd));
        }

        const number = 'RCB-' + String(nextNum).padStart(4, '0');
        nextNum++;

        // Escalonar createdAt (+20ms) para que el último correlativo sea también el último por createdAt DESC
        const createdAt = new Date(baseTime + i * 20);

        const rec = await tx.receipt.create({
          data: {
            number,
            type: 'COLLECTION',
            status: 'DRAFT',
            customerId: null,
            supplierId: null,
            sellerId: null,
            totalUsd: plan.totalUsd,
            totalBsHistoric: plan.totalBsHistoric,
            totalBsToday: plan.totalBsToday,
            exchangeRate: plan.exchangeRate,
            differentialBs: plan.differentialBs,
            hasDifferential: plan.hasDifferential,
            notes: plan.notes,
            documentDate: new Date(plan.fecha + 'T00:00:00.000Z'),
            createdById,
            createdAt,
            items: {
              create: plan.items.map((it) => ({
                itemType: it.itemType,
                receivableId: it.receivableId || null,
                description: it.description,
                amountUsd: it.amountUsd,
                amountBsHistoric: it.amountBsHistoric,
                amountBsToday: it.amountBsToday,
                differentialBs: it.differentialBs,
                sign: it.sign,
              })),
            },
          },
          select: { id: true, number: true, totalUsd: true, totalBsToday: true },
        });

        results.push({
          fecha: plan.fecha,
          id: rec.id,
          number: rec.number,
          itemCount: plan.items.filter((it) => it.itemType === 'RECEIVABLE').length,
          totalUsd: rec.totalUsd,
          totalBsToday: rec.totalBsToday,
        });
      }

      return results;
    }, { timeout: 60000 });

    process.stdout.write(JSON.stringify({ ok: true, created }));
    return;
  }

  throw new Error('Acción desconocida: ' + input.action);
}

main()
  .catch((err) => {
    process.stderr.write((err && err.stack) ? err.stack : String(err));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
`;

function runPrismaBridge(empresa, isLocal, payload) {
  const inputJson = JSON.stringify(payload);
  let res;

  if (isLocal) {
    res = spawnSync(process.execPath, ['-e', REMOTE_PRISMA_RUNNER], {
      cwd: path.join(REPO_ROOT, 'apps', 'api'),
      input: inputJson,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } else {
    const b64Script = Buffer.from(REMOTE_PRISMA_RUNNER, 'utf8').toString('base64');
    const remoteCmd = `cd ${empresa.dir}/apps/api && node -e "eval(Buffer.from('${b64Script}','base64').toString('utf8'))"`;
    res = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', `root@${empresa.host}`, remoteCmd], {
      input: inputJson,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  }

  if (res.error) {
    throw new Error(`Error ejecutando puente Prisma: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(`Error en servidor/BD (exit ${res.status}):\n${res.stderr || res.stdout}`);
  }
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    throw new Error(`Respuesta inválida del puente Prisma: ${res.stdout.slice(0, 400)}`);
  }
}

// ── Paso 2: Cruce contra Trinity ERP ─────────────────────────────────────────

function crossCheckTrinity(groups, dbData) {
  const { receivables, draftItems, rates } = dbData;

  const rateByDate = new Map(rates.map((r) => [r.date, r.rate]));

  // Índices de CxC Cashea
  const byRefExact = new Map();
  const byRefClean = new Map();
  const byInvoiceTail = new Map();

  for (const r of receivables) {
    const refTrim = normRef(r.reference);
    if (refTrim) {
      if (!byRefExact.has(refTrim)) byRefExact.set(refTrim, []);
      byRefExact.get(refTrim).push(r);
      const rc = cleanRef(refTrim);
      if (!byRefClean.has(rc)) byRefClean.set(rc, []);
      byRefClean.get(rc).push(r);
    }
    const invNum = r.invoice?.number || r.documentNumber || '';
    const tailMatch = invNum.match(/(\d+)$/);
    if (tailMatch) {
      const key = stripLeadingZeros(tailMatch[1]);
      if (!byInvoiceTail.has(key)) byInvoiceTail.set(key, []);
      byInvoiceTail.get(key).push(r);
    }
  }

  // Reservas ya existentes en recibos DRAFT abiertos
  const existingDraftByRec = new Map(); // receivableId -> { totalUsd, entries: [{ number, date, amountUsd }] }
  for (const d of draftItems) {
    if (!d.receivableId) continue;
    const dt = d.receipt?.documentDate ? String(d.receipt.documentDate).slice(0, 10) : '';
    if (!existingDraftByRec.has(d.receivableId)) {
      existingDraftByRec.set(d.receivableId, { totalUsd: 0, entries: [] });
    }
    const info = existingDraftByRec.get(d.receivableId);
    info.totalUsd = round2(info.totalUsd + Number(d.amountUsd || 0));
    info.entries.push({ number: d.receipt?.number || '?', date: dt, amountUsd: Number(d.amountUsd || 0) });
  }

  // Saldo restante simulado en este lote (para múltiples fechas de una misma orden)
  const remainingByRec = new Map();
  for (const r of receivables) {
    const draftInfo = existingDraftByRec.get(r.id);
    const reserved = draftInfo ? draftInfo.totalUsd : 0;
    const bal = round2(r.amountUsd - r.paidAmountUsd - reserved);
    remainingByRec.set(r.id, bal);
  }

  const matchedGroups = [];
  const incidencias = [];

  for (const g of groups) {
    const candidates = byRefExact.get(g.orden) || byRefClean.get(g.ordenClean) || [];

    if (candidates.length === 0) {
      // Buscar pista por número de factura para ayudar al encargado
      let hint = '';
      for (const fac of g.facturas) {
        const tailMatch = fac.match(/(\d+)$/);
        if (!tailMatch) continue;
        const hits = byInvoiceTail.get(stripLeadingZeros(tailMatch[1])) || [];
        if (hits.length > 0) {
          const sample = hits
            .slice(0, 2)
            .map((h) => `${h.invoice?.number || h.number} (ref="${h.reference || 'vacía'}", saldo $${round2(h.amountUsd - h.paidAmountUsd).toFixed(2)}, ${h.status})`)
            .join('; ');
          hint = ` · Posible coincidencia por factura: ${sample}`;
          break;
        }
      }
      incidencias.push({
        tipo: 'NO_ENCONTRADO_EN_SISTEMA',
        detalle: `Orden "${g.orden}" no existe en ninguna CxC de Cashea en Trinity${hint}`,
        group: g,
        receivable: null,
      });
      continue;
    }

    const openCandidates = candidates.filter((r) => r.status !== 'PAID' && round2(r.amountUsd - r.paidAmountUsd) > 0.01);

    if (openCandidates.length === 0) {
      const paid = candidates[0];
      incidencias.push({
        tipo: 'YA_PAGADO_EN_SISTEMA',
        detalle: `CxC ${paid.invoice?.number || paid.number || paid.id} (Orden "${g.orden}") ya está PAGADA en Trinity ($${paid.amountUsd.toFixed(2)})`,
        group: g,
        receivable: paid,
      });
      continue;
    }

    if (openCandidates.length > 1) {
      const list = openCandidates.map((r) => `${r.invoice?.number || r.number} ($${round2(r.amountUsd - r.paidAmountUsd).toFixed(2)})`).join(', ');
      incidencias.push({
        tipo: 'ORDEN_DUPLICADA_EN_SISTEMA',
        detalle: `Existen ${openCandidates.length} CxC abiertas con la misma Orden "${g.orden}": ${list}`,
        group: g,
        receivable: openCandidates[0],
      });
      continue;
    }

    const rec = openCandidates[0];

    // ¿Ya existe en un borrador abierto con la misma fecha?
    const draftInfo = existingDraftByRec.get(rec.id);
    if (draftInfo) {
      const sameDateDraft = draftInfo.entries.find((e) => e.date === g.fecha);
      if (sameDateDraft) {
        incidencias.push({
          tipo: 'YA_EN_BORRADOR',
          detalle: `CxC ${rec.invoice?.number || rec.number} ya está incluida en el recibo borrador ${sameDateDraft.number} del ${sameDateDraft.date} ($${sameDateDraft.amountUsd.toFixed(2)})`,
          group: g,
          receivable: rec,
        });
        continue;
      }
    }

    const remainingBefore = remainingByRec.get(rec.id);
    const realBalance = round2(rec.amountUsd - rec.paidAmountUsd);

    if (remainingBefore <= 0.01) {
      const extra = draftInfo ? ` (ya tiene $${draftInfo.totalUsd.toFixed(2)} en borrador: ${draftInfo.entries.map((e) => e.number).join(', ')})` : ' (ya cubierta por cuotas anteriores de este mismo Excel)';
      incidencias.push({
        tipo: 'MONTO_SUPERA_SALDO',
        detalle: `CxC ${rec.invoice?.number || rec.number} sin saldo disponible ($${remainingBefore.toFixed(2)})${extra}`,
        group: g,
        receivable: rec,
      });
      continue;
    }

    if (round2(g.amountUsd - remainingBefore) > 0.01) {
      const diff = round2(g.amountUsd - remainingBefore);
      incidencias.push({
        tipo: 'MONTO_SUPERA_SALDO',
        detalle: `Monto Excel $${g.amountUsd.toFixed(2)} supera el saldo disponible $${remainingBefore.toFixed(2)} en $${diff.toFixed(2)} (saldo real BD: $${realBalance.toFixed(2)})`,
        group: g,
        receivable: rec,
      });
      continue;
    }

    const rate = rateByDate.get(g.fecha);
    if (!rate || rate <= 0) {
      incidencias.push({
        tipo: 'SIN_TASA_EN_SISTEMA',
        detalle: `No existe tasa de cambio registrada en Trinity para la fecha ${g.fecha}`,
        group: g,
        receivable: rec,
      });
      continue;
    }

    // Igual que ReceiptsService.buildDraft(): limitar al saldo disponible si difiere por <= $0.01 de redondeo
    const appliedUsd = round2(Math.min(g.amountUsd, remainingBefore));
    const proportion = rec.amountUsd > 0 ? appliedUsd / rec.amountUsd : 0;
    const amountBsHistoric = round2(rec.amountBs * proportion);
    const amountBsToday = bsToday(appliedUsd, amountBsHistoric, rec.exchangeRate, rate);
    const remainingAfter = round2(remainingBefore - appliedUsd);

    remainingByRec.set(rec.id, remainingAfter);

    matchedGroups.push({
      fecha: g.fecha,
      group: g,
      receivable: rec,
      description: rec.invoice?.number || rec.documentNumber || rec.number || `CxC-${rec.id.slice(-6)}`,
      exchangeRate: rate,
      appliedUsd,
      amountBsHistoric,
      amountBsToday,
      saldoAntes: remainingBefore,
      saldoDespues: remainingAfter,
    });
  }

  // Agrupar matchedGroups por fecha -> 1 recibo borrador por fecha
  const byDate = new Map();
  for (const m of matchedGroups) {
    if (!byDate.has(m.fecha)) byDate.set(m.fecha, []);
    byDate.get(m.fecha).push(m);
  }

  const receiptPlans = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, entries]) => {
      const exchangeRate = entries[0].exchangeRate;
      const items = entries.map((e) => ({
        itemType: 'RECEIVABLE',
        receivableId: e.receivable.id,
        description: e.description,
        amountUsd: e.appliedUsd,
        amountBsHistoric: e.amountBsHistoric,
        amountBsToday: e.amountBsToday,
        differentialBs: 0,
        sign: 1,
      }));

      const totalUsd = round2(items.reduce((s, it) => s + it.amountUsd, 0));
      const totalBsHistoric = round2(items.reduce((s, it) => s + it.amountBsHistoric, 0));
      const totalBsToday = round2(items.reduce((s, it) => s + it.amountBsToday, 0));
      const differentialBs = round2(totalBsToday - totalBsHistoric);
      const hasDifferential = Math.abs(differentialBs) >= 0.01;

      if (hasDifferential) {
        items.push({
          itemType: 'DIFFERENTIAL',
          receivableId: null,
          description: 'Diferencial Cambiario',
          amountUsd: 0,
          amountBsHistoric: 0,
          amountBsToday: 0,
          differentialBs,
          sign: 1,
        });
      }

      const pagosCount = entries.reduce((s, e) => s + e.group.rows.length, 0);
      const notes = `Conciliación Cashea ${fecha} (${entries.length} CxC · ${pagosCount} pago${pagosCount === 1 ? '' : 's'})`;

      return {
        fecha,
        exchangeRate,
        totalUsd,
        totalBsHistoric,
        totalBsToday,
        differentialBs,
        hasDifferential,
        notes,
        items,
        entries,
      };
    });

  return { matchedGroups, receiptPlans, incidencias };
}

// ── Generación del Excel de Incidencias y Reporte ────────────────────────────

function autoFitColumns(ws, dataRows) {
  if (!dataRows.length) return;
  const colCount = Math.max(...dataRows.map((r) => r.length));
  const cols = [];
  for (let c = 0; c < colCount; c++) {
    let maxLen = 10;
    for (const r of dataRows) {
      const v = r[c];
      const len = v === null || v === undefined ? 0 : String(v).length;
      if (len > maxLen) maxLen = len;
    }
    cols.push({ wch: Math.min(maxLen + 3, 62) });
  }
  ws['!cols'] = cols;
}

function buildReportExcel({
  outPath,
  empresaLabel,
  sucursalFilter,
  modeLabel,
  hasBanco,
  applied,
  casheaTargetCount,
  bankTotalCount,
  bankIncidencias,
  trinityIncidencias,
  receiptPlans,
  createdMap,
  soloEnBanco,
}) {
  const wb = XLSX.utils.book_new();

  // Normalizar todas las incidencias (Banco + Trinity) a un mismo esquema de tabla
  const allIncRows = [];

  for (const inc of bankIncidencias) {
    const c = inc.cashea;
    const b = inc.banco;
    allIncRows.push({
      tipo: inc.tipo,
      detalle: inc.detalle,
      fechaCashea: c?.fecha || c?.rawFecha || '',
      fechaBanco: b?.fecha || '',
      sucursal: c?.sucursal || '',
      orden: c?.orden || '',
      facturaExcel: c?.factura || '',
      referencias: c?.ref || '',
      cuotas: c?.cuota || '',
      vesCashea: isNaN(c?.ves) ? '' : round2(c.ves),
      vesBanco: b ? round2(b.haber) : '',
      difVes: b && !isNaN(c?.ves) ? round2(c.ves - b.haber) : '',
      usdExcel: isNaN(c?.usdRaw) ? '' : round2(c.usdRaw),
      facturaTrinity: '',
      saldoTrinity: '',
      estadoTrinity: '',
    });
  }

  for (const inc of trinityIncidencias) {
    const g = inc.group;
    const rec = inc.receivable;
    allIncRows.push({
      tipo: inc.tipo,
      detalle: inc.detalle,
      fechaCashea: g.fecha,
      fechaBanco: hasBanco ? g.fecha : '',
      sucursal: g.sucursal || '',
      orden: g.orden,
      facturaExcel: g.facturas.join(', '),
      referencias: g.referencias.join(', '),
      cuotas: g.cuotas.join(', '),
      vesCashea: g.amountVes || '',
      vesBanco: hasBanco ? (g.amountVes || '') : '',
      difVes: hasBanco ? 0 : '',
      usdExcel: g.amountUsd,
      facturaTrinity: rec ? (rec.invoice?.number || rec.documentNumber || rec.number || '') : '',
      saldoTrinity: rec ? round2(rec.amountUsd - rec.paidAmountUsd) : '',
      estadoTrinity: rec ? rec.status : '',
    });
  }

  allIncRows.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.fechaCashea.localeCompare(b.fechaCashea));

  // Conteo por tipo de incidencia
  const countByTipo = {};
  for (const r of allIncRows) {
    countByTipo[r.tipo] = (countByTipo[r.tipo] || 0) + 1;
  }

  // 1) Hoja Resumen
  const resumenAoa = [
    ['REPORTE DE CONCILIACIÓN CASHEA — TRINITY ERP'],
    [],
    ['Empresa', empresaLabel],
    ['Sucursal filtrada', sucursalFilter || '(Todas)'],
    ['Modo', modeLabel],
    ['Estado ejecución', applied ? 'APLICADO (Recibos creados en BORRADOR)' : 'SIMULACIÓN (Solo lectura, nada escrito en BD)'],
    ['Generado el', new Date().toLocaleString('es-VE')],
    [],
    ['RESUMEN GENERAL', 'Cantidad'],
    ['Filas Cashea evaluadas (sucursal)', casheaTargetCount],
    ...(bankTotalCount !== null ? [['Movimientos totales en Banco', bankTotalCount]] : []),
    ['CxC válidas agrupadas (en recibos)', receiptPlans.reduce((s, p) => s + p.entries.length, 0)],
    ['Recibos en borrador (1 por fecha)', receiptPlans.length],
    ['Total Incidencias', allIncRows.length],
    ...(soloEnBanco ? [['Movimientos solo en Banco (no en Cashea)', soloEnBanco.length]] : []),
    [],
    ['DESGLOSE DE INCIDENCIAS', 'Cantidad'],
    ...(Object.keys(countByTipo).length
      ? Object.entries(countByTipo).map(([k, v]) => [k, v])
      : [['Sin incidencias', 0]]),
    [],
    ['RECIBOS POR FECHA', 'N° Recibo', 'Tasa BCV', 'Cant. CxC', 'Cant. Pagos', 'Total USD', 'Total Bs Histórico', 'Total Bs Hoy', 'Diferencial Bs'],
    ...receiptPlans.map((p) => {
      const created = createdMap.get(p.fecha);
      const pagosCount = p.entries.reduce((s, e) => s + e.group.rows.length, 0);
      return [
        p.fecha,
        created ? created.number : '[SIMULACIÓN]',
        p.exchangeRate,
        p.entries.length,
        pagosCount,
        p.totalUsd,
        p.totalBsHistoric,
        p.totalBsToday,
        p.differentialBs,
      ];
    }),
  ];

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenAoa);
  autoFitColumns(wsResumen, resumenAoa);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // 2) Hoja Incidencias
  const incHeader = [
    'Tipo de Incidencia',
    'Detalle',
    'Fecha Cashea',
    'Fecha Banco',
    'Sucursal',
    'Orden',
    'Factura Excel',
    'Referencia(s)',
    'Cuota',
    'Monto VES Cashea',
    'Monto VES Banco',
    'Dif. VES',
    'Monto USD Excel',
    'Factura Trinity',
    'Saldo CxC USD',
    'Estado CxC',
  ];
  const incAoa = [
    incHeader,
    ...allIncRows.map((r) => [
      r.tipo,
      r.detalle,
      r.fechaCashea,
      r.fechaBanco,
      r.sucursal,
      r.orden,
      r.facturaExcel,
      r.referencias,
      r.cuotas,
      r.vesCashea,
      r.vesBanco,
      r.difVes,
      r.usdExcel,
      r.facturaTrinity,
      r.saldoTrinity,
      r.estadoTrinity,
    ]),
  ];
  const wsInc = XLSX.utils.aoa_to_sheet(incAoa);
  autoFitColumns(wsInc, incAoa);
  XLSX.utils.book_append_sheet(wb, wsInc, 'Incidencias');

  // 3) Hoja Cruzados OK
  const okHeader = [
    'Fecha Recibo',
    'N° Recibo',
    'Sucursal',
    'Orden',
    'Factura Trinity',
    'Pagos Agrupados',
    'Referencia(s) Banco',
    'Cuota(s)',
    'Monto USD Aplicado',
    'Saldo Antes USD',
    'Saldo Después USD',
    'Tasa BCV',
    'Bs Histórico',
    'Bs Hoy',
  ];
  const okAoa = [okHeader];
  for (const p of receiptPlans) {
    const created = createdMap.get(p.fecha);
    const recNum = created ? created.number : '[SIMULACIÓN]';
    for (const e of p.entries) {
      okAoa.push([
        p.fecha,
        recNum,
        e.group.sucursal || '',
        e.group.orden,
        e.description,
        e.group.rows.length,
        e.group.referencias.join(', '),
        e.group.cuotas.join(', '),
        e.appliedUsd,
        e.saldoAntes,
        e.saldoDespues,
        e.exchangeRate,
        e.amountBsHistoric,
        e.amountBsToday,
      ]);
    }
  }
  const wsOk = XLSX.utils.aoa_to_sheet(okAoa);
  autoFitColumns(wsOk, okAoa);
  XLSX.utils.book_append_sheet(wb, wsOk, 'Cruzados OK');

  // 4) Hoja Solo en Banco (si se pasó archivo de banco)
  if (soloEnBanco) {
    const bankHeader = ['Fecha', 'Referencia', 'Haber (Bs)', 'Tipo Operación', 'Descripción'];
    const bankAoa = [
      bankHeader,
      ...soloEnBanco.map((b) => [b.fecha || '', b.ref, b.haber, b.tipoOp, b.descripcion]),
    ];
    const wsBank = XLSX.utils.aoa_to_sheet(bankAoa);
    autoFitColumns(wsBank, bankAoa);
    XLSX.utils.book_append_sheet(wb, wsBank, 'Solo en Banco');
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(wb, outPath, { compression: true });
}

// ── Flujo principal ──────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.cashea) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const empresa = resolveEmpresa(opts.empresa);
  if (!opts.soloBancoCruce && !empresa) {
    throw new Error('Debes indicar --empresa <nombre> (ej: --empresa total, --empresa totalturen, --empresa grande)');
  }

  const hasBanco = Boolean(opts.banco);
  const modeLabel = hasBanco ? 'Modo 1: 2 Excels (Cashea + Banco -> Trinity)' : 'Modo 2: 1 Excel ya validado -> Trinity';

  console.log(`\n════════════════════════════════════════════════════════════`);
  console.log(`  CONCILIACIÓN CASHEA — ${empresa ? empresa.label : 'Solo cruce banco'}`);
  console.log(`  ${modeLabel}`);
  console.log(`  Ejecución: ${opts.apply ? 'APLICAR (creará borradores en BD)' : 'SIMULACIÓN (solo lectura)'}`);
  console.log(`════════════════════════════════════════════════════════════\n`);

  // 1) Leer archivo Cashea
  const { hasSucursalCol, records: casheaAll } = parseCasheaFile(opts.cashea, hasBanco);
  console.log(`✔ Cashea leído: ${casheaAll.length} filas (${path.basename(opts.cashea)})`);

  // 2) Determinar filtro de Sucursal
  const sucursalesPresentes = [...new Set(casheaAll.map((r) => r.sucursal).filter(Boolean))];
  let sucursalFilter = null;
  if (!opts.todasSucursales && hasSucursalCol && sucursalesPresentes.length > 0) {
    if (opts.sucursal) {
      sucursalFilter = opts.sucursal;
    } else if (empresa?.defaultSucursal) {
      sucursalFilter = empresa.defaultSucursal;
    } else if (sucursalesPresentes.length > 1) {
      throw new Error(
        `El Excel trae varias sucursales (${sucursalesPresentes.join(', ')}) y la empresa "${empresa?.key}" no tiene sucursal fija. ` +
          `Indica --sucursal "<nombre>" o --todas-sucursales.`,
      );
    }
  }

  const targetCashea = sucursalFilter
    ? casheaAll.filter((r) => normText(r.sucursal) === normText(sucursalFilter))
    : casheaAll;

  if (sucursalFilter) {
    console.log(`✔ Filtro Sucursal "${sucursalFilter}": ${targetCashea.length} de ${casheaAll.length} filas (presentes: ${sucursalesPresentes.join(', ')})`);
  }

  // 3) Paso 1: Cruce con Banco (si aplica)
  let validatedRows = [];
  let bankIncidencias = [];
  let soloEnBanco = null;
  let bankTotalCount = null;

  if (hasBanco) {
    const bankRecords = parseBancoFile(opts.banco);
    bankTotalCount = bankRecords.length;
    console.log(`✔ Banco leído: ${bankRecords.length} movimientos (${path.basename(opts.banco)})`);

    const matchRes = matchBankRows(casheaAll, targetCashea, bankRecords);
    validatedRows = matchRes.validated;
    bankIncidencias = matchRes.incidencias;
    soloEnBanco = matchRes.soloEnBanco;

    console.log(`  → Validados en banco (Ref + Bs + Fecha exactos): ${validatedRows.length}`);
    console.log(`  → Incidencias banco: ${bankIncidencias.length}`);
    console.log(`  → Movimientos solo en banco (no en Cashea): ${soloEnBanco.length}`);
  } else {
    // Modo 2: 1 solo archivo ya validado por el usuario
    for (const c of targetCashea) {
      if (!c.fecha || !c.orden || isNaN(c.usdRaw) || c.usdRaw <= 0) {
        bankIncidencias.push({
          tipo: 'DATO_INVALIDO',
          detalle: `Fila ${c.rowNum} con datos incompletos o inválidos (fecha="${c.rawFecha}", orden="${c.orden}", USD=${c.usdRaw})`,
          cashea: c,
          banco: null,
        });
      } else {
        validatedRows.push(c);
      }
    }
    console.log(`  → Filas válidas para cruzar con Trinity: ${validatedRows.length}`);
  }

  // 4) Agrupar por (Fecha, Orden) — Regla #2
  const groups = groupByDateAndOrder(validatedRows);
  const groupedCount = validatedRows.length - groups.length;
  console.log(`✔ Agrupación por (Fecha, Orden): ${groups.length} líneas (${groupedCount} pagos del mismo día consolidados en su orden)`);

  // 5) Si --solo-banco-cruce, generar reporte y terminar
  let trinityIncidencias = [];
  let receiptPlans = [];
  const createdMap = new Map();

  if (!opts.soloBancoCruce) {
    const uniqueDates = [...new Set(groups.map((g) => g.fecha))].sort();
    console.log(`\nConsultando Trinity (${opts.local ? 'LOCAL' : `${empresa.host}:${empresa.dir}`})...`);
    const dbData = runPrismaBridge(empresa, opts.local, { action: 'fetch', dates: uniqueDates });
    console.log(
      `✔ Datos Trinity: ${dbData.receivables.length} CxC Cashea, ${dbData.draftItems.length} ítems en borradores abiertos, ${dbData.rates.length}/${uniqueDates.length} tasas BCV`,
    );

    const cross = crossCheckTrinity(groups, dbData);
    trinityIncidencias = cross.incidencias;
    receiptPlans = cross.receiptPlans;

    console.log(`  → Líneas cruzadas OK: ${cross.matchedGroups.length}`);
    console.log(`  → Incidencias Trinity: ${trinityIncidencias.length}`);
    console.log(`  → Recibos en borrador planificados: ${receiptPlans.length}`);

    // 6) Crear recibos en BORRADOR solo si se pasó --apply
    if (opts.apply && receiptPlans.length > 0) {
      const admins = dbData.admins || [];
      let creator = null;
      if (opts.createdBy) {
        creator = admins.find((a) => a.email.toLowerCase() === opts.createdBy.toLowerCase());
        if (!creator) throw new Error(`No se encontró usuario ADMIN activo con email "${opts.createdBy}"`);
      } else {
        creator = admins.find((a) => /diego/i.test(a.name || a.email)) || admins[0];
        if (!creator) throw new Error('No se encontró ningún usuario ADMIN activo en Trinity para asignar como creador.');
      }

      console.log(`\nCreando ${receiptPlans.length} recibos en BORRADOR (creador: ${creator.name})...`);
      const applyRes = runPrismaBridge(empresa, opts.local, {
        action: 'apply',
        createdById: creator.id,
        receipts: receiptPlans.map((p) => ({
          fecha: p.fecha,
          exchangeRate: p.exchangeRate,
          totalUsd: p.totalUsd,
          totalBsHistoric: p.totalBsHistoric,
          totalBsToday: p.totalBsToday,
          differentialBs: p.differentialBs,
          hasDifferential: p.hasDifferential,
          notes: p.notes,
          items: p.items,
        })),
      });

      for (const c of applyRes.created) {
        createdMap.set(c.fecha, c);
        console.log(`  ✅ ${c.number} | Fecha ${c.fecha} | ${c.itemCount} CxC | $${c.totalUsd.toFixed(2)} | Bs ${c.totalBsToday.toFixed(2)}`);
      }
    } else if (opts.apply && receiptPlans.length === 0) {
      console.log(`\n⚠ No hay recibos válidos para crear.`);
    }
  }

  // 7) Escribir Excel de reporte e incidencias
  const allDates = [...new Set(targetCashea.map((r) => r.fecha).filter(Boolean))].sort();
  const rangeTag = allDates.length ? `${allDates[0]}_a_${allDates[allDates.length - 1]}` : new Date().toISOString().slice(0, 10);
  const empTag = empresa ? empresa.key : 'cruce';
  const defaultOut = path.join(
    path.dirname(path.resolve(opts.cashea)),
    `incidencias-cashea-${empTag}-${rangeTag}.xlsx`,
  );
  const outPath = opts.out ? path.resolve(opts.out) : defaultOut;

  buildReportExcel({
    outPath,
    empresaLabel: empresa ? empresa.label : 'Solo cruce banco',
    sucursalFilter,
    modeLabel,
    hasBanco,
    applied: opts.apply && createdMap.size > 0,
    casheaTargetCount: targetCashea.length,
    bankTotalCount,
    bankIncidencias,
    trinityIncidencias,
    receiptPlans,
    createdMap,
    soloEnBanco,
  });

  console.log(`\n📄 Reporte e incidencias generado en:\n   ${outPath}\n`);

  // Resumen final en consola
  const allInc = [...bankIncidencias, ...trinityIncidencias];
  if (allInc.length > 0) {
    const counts = {};
    for (const i of allInc) counts[i.tipo] = (counts[i.tipo] || 0) + 1;
    console.log('Resumen de incidencias:');
    for (const [k, v] of Object.entries(counts)) console.log(`  - ${k}: ${v}`);
  } else {
    console.log('🎉 0 incidencias detectadas.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseBancoFile,
  parseCasheaFile,
  matchBankRows,
  groupByDateAndOrder,
  crossCheckTrinity,
  buildReportExcel,
  resolveEmpresa,
};
