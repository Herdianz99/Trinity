export interface MetricHelp {
  key: string;
  titulo: string;
  formula: string;
  explicacion: string;
  // Opcionales (los usa el dashboard gerencial): encabezado de grupo en el modal,
  // viñetas de "qué se tiene en cuenta" y una advertencia destacada.
  seccion?: string;
  incluye?: string[];
  ojo?: string;
}

// Fuente única de verdad de cómo se calcula cada métrica.
// Si cambias un umbral en el backend (DIAS_RECIEN_INGRESADO=10, DIAS_STOCK_MUERTO=28,
// DIAS_EXCESO=180), actualiza también el texto aquí.
export const METRICS_HELP: Record<string, MetricHelp> = {
  abc: {
    key: 'abc',
    titulo: 'Clasificación ABC',
    formula: 'Productos ordenados por ventas USD; % acumulado: A ≤ 80%, B ≤ 95%, C el resto',
    explicacion: 'Clase A = los pocos productos que generan la mayoría de las ventas. C = la cola de bajo aporte.',
  },
  rotacion: {
    key: 'rotacion',
    titulo: 'Rotación',
    formula: 'rotación = unidades vendidas en el período ÷ stock actual',
    explicacion: 'Cuántas veces se "vació" el inventario en el período. Más alto = vende más rápido.',
  },
  diasInventario: {
    key: 'diasInventario',
    titulo: 'Días de inventario',
    formula: 'días = días del período ÷ rotación',
    explicacion: 'Cuántos días durará el stock actual al ritmo de venta del período. Si no vende, se muestra ∞.',
  },
  rentabilidad: {
    key: 'rentabilidad',
    titulo: 'Rentabilidad (ganancia)',
    formula: 'ganancia = ingreso − costo; ingreso = total − IVA (si la serie es fiscal)',
    explicacion: 'En series no fiscales el IVA cuenta como ingreso; en fiscales se descuenta (es del SENIAT). El costo es el del momento de la venta.',
  },
  margen: {
    key: 'margen',
    titulo: 'Margen %',
    formula: 'margen % = (ingreso − costo) ÷ ingreso × 100',
    explicacion: 'Margen sobre el precio de venta (no sobre el costo). Ej: comprar 0.50 y vender 1.00 = 50%.',
  },
  valorInventario: {
    key: 'valorInventario',
    titulo: 'Valor de inventario',
    formula: 'valor = stock actual × costo actual del producto',
    explicacion: 'Foto del inventario valorizado a costo (último costo). No depende del período seleccionado.',
  },
  sugerenciaCompra: {
    key: 'sugerenciaCompra',
    titulo: 'Sugerencia de compra',
    formula: 'sugerido = máx( venta diaria promedio × 30 , mínimo − stock )',
    explicacion: 'Toma el mayor entre "30 días de demanda" y "lo que falta para el mínimo". Solo aplica a productos en o bajo el mínimo.',
  },
  agotado: {
    key: 'agotado',
    titulo: 'Agotado',
    formula: 'stock ≤ 0',
    explicacion: 'Sin existencias (incluye stock negativo por sobreventa).',
  },
  bajoMinimo: {
    key: 'bajoMinimo',
    titulo: 'Bajo mínimo',
    formula: '0 < stock ≤ mínimo',
    explicacion: 'Todavía hay stock, pero está en o por debajo del mínimo configurado. Candidato a reorden.',
  },
  sinRotacion: {
    key: 'sinRotacion',
    titulo: 'Sin rotación (por antigüedad)',
    formula: 'stock > 0 y 0 ventas desde la última compra. <10 días: Recién ingresado · 10–28: Nuevo sin rotación · >28: Stock muerto',
    explicacion: 'La antigüedad cuenta desde la última compra: un producto recién comprado no se marca muerto. Una compra reciente reinicia el conteo.',
  },
  exceso: {
    key: 'exceso',
    titulo: 'Exceso de stock',
    formula: 'vende algo, pero días de inventario > 180',
    explicacion: 'Sí rota, pero tan lento que el stock alcanza para más de 180 días. Usa la ventana del período seleccionado.',
  },
};

// ── Dashboard gerencial ──────────────────────────────────────────────────────
// Refleja apps/api/src/modules/dashboard/dashboard.service.ts. Si cambias cómo se calcula
// un KPI allí (estados de factura, fechas, qué se resta), actualiza también este texto.
const DASHBOARD_HELP: MetricHelp[] = [
  // Reglas generales
  {
    key: 'dashPeriodo',
    seccion: 'Reglas generales',
    titulo: 'Período y % de comparación',
    formula: 'Rango = días calendario de Caracas · % = contra el período anterior de igual duración',
    explicacion: 'El % compara con los días justo antes del rango, con la misma cantidad de días.',
    incluye: [
      'Hoy → contra ayer.',
      'Esta semana (lunes a hoy) → contra los mismos días inmediatamente anteriores.',
      'Este mes al día 15 → contra los 15 días previos (16 al 30/31 del mes pasado), NO contra el mes pasado completo.',
    ],
  },
  {
    key: 'dashFechaVenta',
    seccion: 'Reglas generales',
    titulo: 'Qué fecha toma una venta',
    formula: 'Fecha de la venta = momento en que caja procesa la factura',
    explicacion: 'Cuentan las facturas procesadas por caja: pagadas, con devolución parcial y devueltas (estas últimas quedan en 0 al restar su NC).',
    incluye: [
      'Las facturas a crédito cuentan el día que se emiten, no cuando el cliente las paga.',
      'Facturas en espera, pendientes de caja o anuladas NO cuentan.',
      'Los montos son el total de la factura: con IVA e IGTF.',
    ],
  },
  {
    key: 'dashCuadre',
    seccion: 'Reglas generales',
    titulo: '¿Por qué "Bruto − Devoluciones" no da el Neto?',
    formula: 'Neto resta las NC de las facturas DEL período · "Devoluciones" muestra las NC HECHAS en el período',
    explicacion: 'Una devolución resta en el mes de su factura, pero aparece en la tarjeta Devoluciones del mes en que se hizo la NC.',
    incluye: [
      'Devuelves hoy una factura del mes pasado → sale en Devoluciones de este mes, pero NO baja las Ventas de este mes (baja las del mes pasado).',
      'Devuelves después del período una factura del período → baja el Neto de ese período, pero no sale en sus Devoluciones.',
      'Para cuadrar a mano: Neto = Bruto − NC de las facturas del período (sin importar la fecha de la NC).',
    ],
    ojo: 'El Neto de un período ya cerrado puede bajar si después se devuelve una factura de ese período.',
  },

  // Ventas
  {
    key: 'dashVentasNeto',
    seccion: 'Ventas',
    titulo: 'Ventas (neto)',
    formula: 'Σ por factura: total − sus NC de venta (nunca menos de 0)',
    explicacion: 'La venta real de cada factura del período: lo facturado menos lo que se devolvió de ESA factura.',
    incluye: [
      'Todas las facturas: contado, crédito, Cashea/Crediagro y empresas del grupo.',
      '"bruto" = lo facturado antes de restar devoluciones.',
      '"fact." = facturas con venta neta mayor a 0 (las devueltas completas no se cuentan).',
      'Contado + Crédito + Cashea + Crediagro + Grupo ≈ Ventas (neto).',
    ],
  },
  {
    key: 'dashGanancia',
    seccion: 'Ventas',
    titulo: 'Ganancia y margen',
    formula: 'Σ por factura: (precio sin IVA − costo con brecha × cantidad) − ganancia de lo que se devolvió de ESA factura',
    explicacion: 'Solo cuenta la ganancia de lo que el cliente se quedó. El IVA se descuenta SIEMPRE (fiscal y no fiscal). El costo es el guardado en la factura al vender, que ya incluye la brecha.',
    incluye: [
      'Excluye las ventas a empresas del grupo.',
      'Mismas facturas que Ventas (neto): devuelta completa → ganancia 0; devuelta parcial → solo la ganancia de lo no devuelto.',
      'Igual que el Neto, la devolución resta en el período de la FACTURA, no en el de la NC, con el costo histórico de la factura original.',
      'Margen = ganancia ÷ ventas sin IVA × 100.',
      '"Prom." = ticket promedio = Ventas (neto) ÷ n° de facturas.',
      '"Otros ingresos" = ganancia + el IVA cobrado en notas de entrega (series no fiscales).',
    ],
  },
  {
    key: 'dashContado',
    seccion: 'Ventas',
    titulo: 'Ventas de contado',
    formula: 'Neto de facturas de contado − lo pagado con Cashea/Crediagro',
    explicacion: 'Lo pagado con Cashea y Crediagro se resta porque tiene su propia tarjeta (para no contarlo dos veces).',
    incluye: [
      'Excluye las empresas del grupo (van en "Ventas del grupo").',
      'El n° de facturas sí incluye las pagadas con Cashea/Crediagro.',
    ],
  },
  {
    key: 'dashCredito',
    seccion: 'Ventas',
    titulo: 'Ventas a crédito',
    formula: 'Neto de las facturas emitidas a crédito',
    explicacion: 'Cuenta el día de emisión, aunque todavía no se haya cobrado.',
    incluye: ['Excluye las empresas del grupo (van en "Ventas del grupo").'],
  },
  {
    key: 'dashGrupo',
    seccion: 'Ventas',
    titulo: 'Ventas del grupo',
    formula: 'Neto de las facturas a clientes marcados como "empresa del grupo"',
    explicacion: 'Contado o crédito. No entran en Contado, Crédito, Ganancia, Brecha ni Clientes nuevos.',
  },
  {
    key: 'dashCashea',
    seccion: 'Ventas',
    titulo: 'Cashea / Crediagro',
    formula: 'Σ pagos con método cuyo nombre contiene "Cashea" / "Crediagro" en facturas del período',
    explicacion: 'Solo la parte pagada con esa plataforma, no el total de la factura.',
    incluye: [
      'Facturas pagadas y con devolución parcial (las devueltas completas no cuentan).',
      'No se le restan las devoluciones parciales.',
    ],
  },
  {
    key: 'dashDevoluciones',
    seccion: 'Ventas',
    titulo: 'Devoluciones',
    formula: 'Σ NC de venta procesadas cuya fecha cae en el período',
    explicacion: 'Todas las NC hechas en el período, sean de facturas de este período o de otros anteriores.',
    incluye: ['NC en borrador o anuladas no cuentan.'],
    ojo: 'No es lo que se le restó al Neto (ver "¿Por qué Bruto − Devoluciones no da el Neto?").',
  },
  {
    key: 'dashClientesNuevos',
    seccion: 'Ventas',
    titulo: 'Clientes nuevos',
    formula: 'Clientes creados en el período (sin empresas del grupo)',
    explicacion: '"Compraron" = de esos clientes, los que tienen al menos una factura procesada (en cualquier fecha).',
  },

  // Inventario
  {
    key: 'dashQuiebre',
    seccion: 'Inventario (no dependen del período)',
    titulo: 'Quiebre de inventario',
    formula: 'productos con stock ≤ 0 ÷ productos activos × 100',
    explicacion: 'Foto del stock actual sumando todos los almacenes. No incluye servicios ni productos inactivos.',
  },
  {
    key: 'dashPrecision',
    seccion: 'Inventario (no dependen del período)',
    titulo: 'Precisión de conteo',
    formula: 'ítems sin diferencia ÷ ítems auditados × 100',
    explicacion: 'Conteos físicos APROBADOS en los últimos 15 o 30 días (según el selector), sin importar el período del dashboard.',
  },

  // Cuentas y caja
  {
    key: 'dashCxC',
    seccion: 'Cuentas y caja',
    titulo: 'Cuentas por Cobrar / por Pagar',
    formula: 'Saldo = Σ (monto − abonado) de las cuentas pendientes, parciales y vencidas',
    explicacion: 'El saldo es en TIEMPO REAL: lo que se debe hoy, ignora el período. "Vencidas" = cuentas en estado vencido.',
    incluye: [
      '"Cobrado / Pagado en el período" sí respeta el período: Σ recibos de cobro / pago procesados con fecha del recibo en el rango.',
    ],
  },
  {
    key: 'dashCaja',
    seccion: 'Cuentas y caja',
    titulo: 'Resumen de caja',
    formula: 'Ingresos = entradas · Egresos = salidas del libro de caja en el período',
    explicacion: 'Todo movimiento de dinero: pagos de ventas, cobros, pagos, anticipos, gastos, vuelto y movimientos manuales.',
    incluye: [
      'Solo cajas con "incluir en dashboard" activado (excluye la caja de administración).',
      '"Por método" = neto de cada método (entradas − salidas).',
    ],
    ojo: 'Incluye cobros de crédito de otros días, por eso no coincide con las Ventas.',
  },
  {
    key: 'dashGastos',
    seccion: 'Cuentas y caja',
    titulo: 'Gastos del período',
    formula: 'Σ gastos registrados con fecha en el período, por categoría',
    explicacion: 'La gráfica "Ingresos vs Gastos" usa los Ingresos del Resumen de caja.',
  },

  // Gráficas
  {
    key: 'dashTimeline',
    seccion: 'Gráficas',
    titulo: 'Ventas por hora / por día',
    formula: 'Σ total facturado (bruto) agrupado por hora o día de procesada',
    explicacion: 'Facturas pagadas y con devolución parcial, sin restar devoluciones. En "Hoy" muestra solo de 7:00 a 21:00.',
    ojo: 'Es bruto: no coincide con Ventas (neto).',
  },
  {
    key: 'dashVendedor',
    seccion: 'Gráficas',
    titulo: 'Ventas por vendedor',
    formula: 'Bruto por vendedor · devoluciones aparte (por fecha de la NC)',
    explicacion: 'Las devoluciones se muestran debajo en naranja pero no se restan. El % es sobre el bruto total, incluyendo "Sin vendedor" (mostrador).',
  },
  {
    key: 'dashTopCategorias',
    seccion: 'Gráficas',
    titulo: 'Top 5 productos y Ventas por categoría',
    formula: 'Σ líneas de factura (con IVA) de facturas pagadas y con devolución parcial',
    explicacion: 'No restan devoluciones parciales y no incluyen IGTF. Categorías: top 8 y el resto agrupado en "Otras".',
  },
  {
    key: 'dashFiscal',
    seccion: 'Gráficas',
    titulo: 'Fiscales vs no fiscales',
    formula: 'Ventas (neto) separadas según la serie de la factura sea fiscal o no',
    explicacion: 'Fiscal + No fiscal = Ventas (neto). Incluye empresas del grupo.',
  },
  {
    key: 'dashBrecha',
    seccion: 'Gráficas',
    titulo: 'Con brecha vs sin brecha',
    formula: 'Σ líneas de factura − líneas devueltas, según el producto tenga "lleva brecha"',
    explicacion: 'Devoluciones ancladas a la factura (igual que el Neto). Excluye empresas del grupo y no incluye IGTF, por eso no cuadra exacto con Ventas (neto).',
  },
];

for (const m of DASHBOARD_HELP) METRICS_HELP[m.key] = m;

export const DASHBOARD_METRIC_KEYS = DASHBOARD_HELP.map((m) => m.key);

export function getMetrics(keys: string[]): MetricHelp[] {
  return keys.map((k) => METRICS_HELP[k]).filter(Boolean);
}
