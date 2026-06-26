export interface MetricHelp {
  key: string;
  titulo: string;
  formula: string;
  explicacion: string;
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

export function getMetrics(keys: string[]): MetricHelp[] {
  return keys.map((k) => METRICS_HELP[k]).filter(Boolean);
}
