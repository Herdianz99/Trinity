# Alertas de Inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva pantalla "Alertas de Inventario" con 4 reportes (agotados, bajo mínimo, sin rotación por antigüedad, exceso), export PDF/Excel, y un botón "¿Cómo se calcula?" reusable en Alertas y Análisis.

**Architecture:** Se extiende el módulo backend `inventory-analysis` con un método `getInventoryAlerts` que reusa la lógica de rotación existente y agrega "última compra" (vía `StockMovement` tipo `PURCHASE`). El frontend agrega una página nueva en `inventory/alerts` que consume un solo endpoint y filtra los 4 reportes client-side. El glosario de fórmulas vive en un único archivo `metrics-help.ts`.

**Tech Stack:** NestJS + Prisma (API), Next.js 14 App Router + React + Tailwind (web), pdfkit (PDF server-side), xlsx (Excel client-side).

> **Nota sobre verificación (importante):** este repositorio **no tiene framework de pruebas** (sin jest/vitest, cero archivos `*.spec.ts` en 68 sesiones). Por respeto al patrón establecido, este plan **no** introduce TDD; cada tarea se verifica con **compilación TypeScript** (`pnpm build` / el watch de `nest`/`next` sin errores) y **smoke test manual** (navegador autenticado / consola del dev server). Commits frecuentes.

> **Setup previo:** el dev server debe estar corriendo (`pnpm dev`, con Docker `postgres`+`redis` arriba). API en `:4000`, Web en `:3000`. El API está protegido con `AuthGuard('jwt')`, así que las pruebas manuales de endpoints se hacen **desde el navegador ya logueado** (a través del proxy `/api/proxy/...`), no con `curl` anónimo.

---

## File Structure

**Backend (`apps/api/src/modules/inventory-analysis/`):**
- `inventory-analysis.service.ts` — MODIFICAR: agregar constantes + método `getInventoryAlerts`.
- `inventory-analysis.controller.ts` — MODIFICAR: rutas `GET alerts` y `GET alerts/pdf`.
- `inventory-alerts-pdf.service.ts` — CREAR: genera el PDF de un reporte (patrón `reports-pdf.service.ts`).
- `inventory-analysis.module.ts` — MODIFICAR: registrar `InventoryAlertsPdfService`.

**Frontend (`apps/web/src/`):**
- `lib/metrics-help.ts` — CREAR: glosario de métricas (fuente única).
- `components/metrics-help-modal.tsx` — CREAR: modal reusable.
- `app/(dashboard)/inventory/alerts/page.tsx` — CREAR: pantalla nueva.
- `components/sidebar.tsx` — MODIFICAR: entrada de menú en INVENTARIO.
- `app/(dashboard)/purchases/analysis/page.tsx` — MODIFICAR: agregar botón de ayuda.

---

## Task 1: Backend — método `getInventoryAlerts` en el service

**Files:**
- Modify: `apps/api/src/modules/inventory-analysis/inventory-analysis.service.ts`

- [ ] **Step 1: Verificar que las ventas generan `StockMovement` tipo `SALE`**

Esto valida el supuesto de cálculo de "ha vendido desde la última entrada". En la consola del servidor de BD (o psql de desarrollo dentro del contenedor):

```bash
docker exec trinity-postgres-1 psql -U trebol -d trebol_db -P pager=off -c "SELECT type, count(*) FROM \"StockMovement\" GROUP BY type ORDER BY 2 DESC;"
```

Expected: aparecen filas con `type = SALE` y `type = PURCHASE` con conteos > 0.
- Si `SALE` NO existe (las ventas no registran movimiento), DETENERSE y avisar: habrá que calcular "ventas desde la entrada" vía `invoiceItem` + `invoice.createdAt` en vez de `StockMovement`. El resto del plan asume que `SALE` sí existe.

- [ ] **Step 2: Agregar constantes de umbrales al inicio del archivo**

Justo después de los `import` (arriba de `@Injectable()`), agregar:

```ts
// Umbrales de clasificación de alertas de inventario (fijos en código).
// Para cambiarlos: ajustar aquí y actualizar el texto en apps/web/src/lib/metrics-help.ts
const DIAS_RECIEN_INGRESADO = 10; // < 10 días sin ventas => "Recién ingresado" (neutro)
const DIAS_STOCK_MUERTO = 28;     // > 28 días sin ventas => "Stock muerto" (rojo); intermedio => "Nuevo sin rotación" (naranja)
const DIAS_EXCESO = 180;          // > 180 días de inventario (vendiendo) => "Exceso"
```

- [ ] **Step 3: Agregar el método `getInventoryAlerts` al final de la clase**

Insertar antes de la última llave `}` de la clase (después de `getPurchaseSuggestions`):

```ts
  /**
   * Inventory alerts: agotados, bajo mínimo, sin rotación (por antigüedad de última compra), exceso.
   * Devuelve una sola lista; el frontend filtra por reporte. El período solo afecta el cálculo de Exceso.
   */
  async getInventoryAlerts(from: string, to: string) {
    const fromDate = caracasDayStart(from);
    const toDate = caracasDayEnd(to);
    const periodDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)));
    const now = new Date();

    // 1. Productos activos no-servicio con stock, costo, proveedor, categoría
    const products = await this.prisma.product.findMany({
      where: { isActive: true, isService: false },
      select: {
        id: true,
        code: true,
        name: true,
        costUsd: true,
        minStock: true,
        createdAt: true,
        supplierId: true,
        supplier: { select: { name: true } },
        category: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
    });
    const productIds = products.map((p) => p.id);

    // 2. Última compra por producto (StockMovement tipo PURCHASE)
    const lastPurchases = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { type: 'PURCHASE', productId: { in: productIds } },
      _max: { createdAt: true },
    });
    const lastPurchaseMap = new Map<string, Date>();
    for (const lp of lastPurchases) {
      if (lp._max.createdAt) lastPurchaseMap.set(lp.productId, lp._max.createdAt);
    }

    // 3. Última venta por producto (StockMovement tipo SALE)
    const lastSales = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { type: 'SALE', productId: { in: productIds } },
      _max: { createdAt: true },
    });
    const lastSaleMap = new Map<string, Date>();
    for (const ls of lastSales) {
      if (ls._max.createdAt) lastSaleMap.set(ls.productId, ls._max.createdAt);
    }

    // 4. Ventas del período seleccionado (para rotación => Exceso)
    const periodItems = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN'] },
          type: 'SALE',
          createdAt: { gte: fromDate, lte: toDate },
        },
      },
      select: { productId: true, quantity: true, returnedQty: true },
    });
    const periodSalesMap = new Map<string, number>();
    for (const it of periodItems) {
      const eff = it.quantity - (it.returnedQty || 0);
      if (eff <= 0) continue;
      periodSalesMap.set(it.productId, (periodSalesMap.get(it.productId) || 0) + eff);
    }

    const MS_DAY = 1000 * 60 * 60 * 24;

    const items = products.map((p) => {
      const currentStock = p.stock.reduce((s, st) => s + st.quantity, 0);

      // Antigüedad: última compra, o createdAt si nunca se compró
      const lastPurchase = lastPurchaseMap.get(p.id) || null;
      const entryDate = lastPurchase || p.createdAt;
      const lastEntrySource: 'PURCHASE' | 'CREATED' = lastPurchase ? 'PURCHASE' : 'CREATED';
      const daysSinceEntry = Math.floor((now.getTime() - entryDate.getTime()) / MS_DAY);

      // ¿Vendió algo desde su última entrada?
      const lastSale = lastSaleMap.get(p.id) || null;
      const soldSinceEntry = !!lastSale && lastSale.getTime() >= entryDate.getTime();

      // Rotación del período (para exceso)
      const periodSales = periodSalesMap.get(p.id) || 0;
      const rotation = currentStock > 0 ? periodSales / currentStock : 0;
      const daysOfInventory = rotation > 0 ? Math.round(periodDays / rotation) : currentStock > 0 ? 9999 : 0;

      // Clasificación "sin rotación" (solo con stock y sin ventas desde la entrada)
      let sinRotacion: null | 'RECIEN_INGRESADO' | 'NUEVO_SIN_ROTACION' | 'STOCK_MUERTO' = null;
      if (currentStock > 0 && !soldSinceEntry) {
        if (daysSinceEntry < DIAS_RECIEN_INGRESADO) sinRotacion = 'RECIEN_INGRESADO';
        else if (daysSinceEntry <= DIAS_STOCK_MUERTO) sinRotacion = 'NUEVO_SIN_ROTACION';
        else sinRotacion = 'STOCK_MUERTO';
      }

      const agotado = currentStock <= 0;
      const bajoMinimo = currentStock > 0 && currentStock <= p.minStock;
      const exceso = currentStock > 0 && periodSales > 0 && daysOfInventory > DIAS_EXCESO;

      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        category: p.category?.name || '',
        supplierId: p.supplierId,
        supplierName: p.supplier?.name || 'Sin proveedor',
        currentStock,
        minStock: p.minStock,
        costUsd: p.costUsd,
        inventoryValueUsd: Math.round(Math.max(currentStock, 0) * p.costUsd * 100) / 100,
        lastEntryDate: entryDate.toISOString(),
        lastEntrySource,
        daysSinceEntry,
        soldSinceEntry,
        periodSales: Math.round(periodSales * 100) / 100,
        daysOfInventory,
        alerts: { agotado, bajoMinimo, sinRotacion, exceso },
      };
    });

    return { items, periodDays };
  }
```

- [ ] **Step 4: Verificar que compila**

Mirar la consola del dev server (`@trinity/api:dev`). Guardar el archivo dispara `nest` watch.
Expected: recompila sin errores TypeScript. Si hay error de tipo en `groupBy`, confirmar que `productIds` no está vacío no es problema (Prisma acepta `in: []`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/inventory-analysis/inventory-analysis.service.ts
git commit -m "feat(api): metodo getInventoryAlerts (agotados, bajo minimo, sin rotacion, exceso)"
```

---

## Task 2: Backend — ruta `GET /inventory-analysis/alerts`

**Files:**
- Modify: `apps/api/src/modules/inventory-analysis/inventory-analysis.controller.ts`

- [ ] **Step 1: Agregar la ruta al controller**

Dentro de la clase `InventoryAnalysisController`, después de `getPurchaseSuggestions`, agregar:

```ts
  @Get('alerts')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getAlerts(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getInventoryAlerts(from, to);
  }
```

- [ ] **Step 2: Verificar compilación + endpoint vivo**

Guardar; el watch recompila. En la consola del dev server debe aparecer mapeada la ruta:
Expected: log `Mapped {/inventory-analysis/alerts, GET} route`.

- [ ] **Step 3: Smoke test desde el navegador (logueado)**

Abrir en el navegador (sesión activa) la URL del proxy:
`http://localhost:3000/api/proxy/inventory-analysis/alerts?from=2026-05-27&to=2026-06-26`
Expected: JSON `{ "items": [...], "periodDays": 30 }`. Cada item con `alerts`, `daysSinceEntry`, `lastEntrySource`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/inventory-analysis/inventory-analysis.controller.ts
git commit -m "feat(api): ruta GET inventory-analysis/alerts"
```

---

## Task 3: Backend — PDF del reporte de alertas

**Files:**
- Create: `apps/api/src/modules/inventory-analysis/inventory-alerts-pdf.service.ts`
- Modify: `apps/api/src/modules/inventory-analysis/inventory-analysis.module.ts`
- Modify: `apps/api/src/modules/inventory-analysis/inventory-analysis.controller.ts`

- [ ] **Step 1: Crear el servicio de PDF**

Crear `inventory-alerts-pdf.service.ts` con este contenido completo:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

type AlertItem = {
  productCode: string;
  productName: string;
  supplierName: string;
  currentStock: number;
  minStock: number;
  daysSinceEntry: number;
  daysOfInventory: number;
  lastEntryDate: string;
  alerts: { agotado: boolean; bajoMinimo: boolean; sinRotacion: string | null; exceso: boolean };
};

const REPORT_TITLES: Record<string, string> = {
  agotados: 'Articulos Agotados',
  'bajo-minimo': 'Articulos Bajo Minimo',
  'sin-rotacion': 'Articulos Sin Rotacion',
  exceso: 'Exceso de Stock',
  todos: 'Alertas de Inventario',
};

const NIVEL_LABEL: Record<string, string> = {
  RECIEN_INGRESADO: 'Recien ingresado',
  NUEVO_SIN_ROTACION: 'Nuevo sin rotacion',
  STOCK_MUERTO: 'Stock muerto',
};

@Injectable()
export class InventoryAlertsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst();
    return config?.companyName || 'Trinity ERP';
  }

  private fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-VE');
  }

  async generate(report: string, items: AlertItem[], period: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const title = REPORT_TITLES[report] || 'Alertas de Inventario';
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } });

    // Header
    doc.fontSize(16).font('Helvetica-Bold').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(title, 40, 60);
    doc.fontSize(9).font('Helvetica').text(period ? `Periodo (exceso): ${period}` : '', 40, 76);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')}  |  ${items.length} articulos`, 40, 88);
    doc.moveTo(40, 104).lineTo(doc.page.width - 40, 104).stroke('#94a3b8');

    const columns = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Producto', x: 115, width: 200 },
      { label: 'Proveedor', x: 320, width: 130 },
      { label: 'Stock', x: 455, width: 45, align: 'right' as const },
      { label: 'Min', x: 505, width: 40, align: 'right' as const },
      { label: 'Ult. entrada', x: 550, width: 70 },
      { label: 'Dias', x: 625, width: 35, align: 'right' as const },
      { label: 'Estado', x: 665, width: 130 },
    ];

    let y = 114;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: c.align });
    doc.fillColor('#000');
    y += 14;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#e2e8f0');
    y += 4;

    for (const it of items) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = 40;
      }
      let estado = '';
      if (it.alerts.agotado) estado = 'Agotado';
      else if (it.alerts.sinRotacion) estado = NIVEL_LABEL[it.alerts.sinRotacion] || '';
      else if (it.alerts.exceso) estado = `Exceso (${it.daysOfInventory} d)`;
      else if (it.alerts.bajoMinimo) estado = 'Bajo minimo';

      const values = [
        it.productCode,
        it.productName,
        it.supplierName,
        String(it.currentStock),
        String(it.minStock),
        this.fmtDate(it.lastEntryDate),
        String(it.daysSinceEntry),
        estado,
      ];
      doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i] || '', columns[i].x, y, { width: columns[i].width, align: columns[i].align });
      }
      doc.fillColor('#000');
      y += 14;
    }

    doc.end();
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
```

- [ ] **Step 2: Registrar el servicio en el módulo**

Editar `inventory-analysis.module.ts` para que quede:

```ts
import { Module } from '@nestjs/common';
import { InventoryAnalysisController } from './inventory-analysis.controller';
import { InventoryAnalysisService } from './inventory-analysis.service';
import { InventoryAlertsPdfService } from './inventory-alerts-pdf.service';

@Module({
  controllers: [InventoryAnalysisController],
  providers: [InventoryAnalysisService, InventoryAlertsPdfService],
})
export class InventoryAnalysisModule {}
```

- [ ] **Step 3: Agregar la ruta PDF al controller**

En `inventory-analysis.controller.ts`: actualizar imports e inyectar el servicio, y agregar la ruta. El encabezado del archivo debe quedar:

```ts
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { InventoryAnalysisService } from './inventory-analysis.service';
import { InventoryAlertsPdfService } from './inventory-alerts-pdf.service';
```

El constructor:

```ts
  constructor(
    private readonly service: InventoryAnalysisService,
    private readonly alertsPdf: InventoryAlertsPdfService,
  ) {}
```

Y la nueva ruta, después de `getAlerts`:

```ts
  @Get('alerts/pdf')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'report', required: true, description: 'agotados | bajo-minimo | sin-rotacion | exceso | todos' })
  async getAlertsPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('report') report: string,
    @Res() res: Response,
  ) {
    const { items } = await this.service.getInventoryAlerts(from, to);
    const filtered = this.filterByReport(items, report);
    const buffer = await this.alertsPdf.generate(report, filtered as any, `${from} a ${to}`);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="alertas-${report}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  private filterByReport(items: any[], report: string): any[] {
    switch (report) {
      case 'agotados':
        return items.filter((i) => i.alerts.agotado);
      case 'bajo-minimo':
        return items.filter((i) => i.alerts.bajoMinimo);
      case 'sin-rotacion':
        return items.filter((i) => i.alerts.sinRotacion);
      case 'exceso':
        return items.filter((i) => i.alerts.exceso);
      default:
        return items.filter((i) => i.alerts.agotado || i.alerts.bajoMinimo || i.alerts.sinRotacion || i.alerts.exceso);
    }
  }
```

- [ ] **Step 4: Verificar compilación + smoke del PDF**

Guardar; el watch recompila. En el navegador logueado abrir:
`http://localhost:3000/api/proxy/inventory-analysis/alerts/pdf?from=2026-05-27&to=2026-06-26&report=todos`
Expected: se abre/descarga un PDF con la tabla de alertas.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/inventory-analysis/inventory-alerts-pdf.service.ts apps/api/src/modules/inventory-analysis/inventory-analysis.module.ts apps/api/src/modules/inventory-analysis/inventory-analysis.controller.ts
git commit -m "feat(api): PDF de alertas de inventario + ruta alerts/pdf"
```

---

## Task 4: Frontend — glosario `metrics-help.ts`

**Files:**
- Create: `apps/web/src/lib/metrics-help.ts`

- [ ] **Step 1: Crear el archivo con todas las entradas**

```ts
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
```

- [ ] **Step 2: Verificar que el dev server compila el archivo**

El archivo aún no se importa, así que solo confirmar que no hay error de sintaxis: revisar la consola `@trinity/web:dev`.
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/metrics-help.ts
git commit -m "feat(web): glosario de metricas (metrics-help) como fuente unica"
```

---

## Task 5: Frontend — modal `metrics-help-modal.tsx`

**Files:**
- Create: `apps/web/src/components/metrics-help-modal.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { getMetrics } from '@/lib/metrics-help';

export function MetricsHelpButton({ metricKeys }: { metricKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const metrics = getMetrics(metricKeys);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700 border border-slate-700 transition-colors"
      >
        <HelpCircle size={16} className="text-emerald-400" />
        ¿Cómo se calcula?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 sticky top-0 bg-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HelpCircle size={18} className="text-emerald-400" /> ¿Cómo se calcula?
              </h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {metrics.map((m) => (
                <div key={m.key} className="border-b border-slate-700/30 pb-3 last:border-0">
                  <h3 className="text-white font-semibold text-sm">{m.titulo}</h3>
                  <p className="mt-1 font-mono text-xs text-emerald-400 bg-slate-900/50 rounded px-2 py-1 inline-block">
                    {m.formula}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-400">{m.explicacion}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verificar compilación**

El componente aún no se usa; confirmar en consola `@trinity/web:dev` que no hay error.
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/metrics-help-modal.tsx
git commit -m "feat(web): modal reusable MetricsHelpButton"
```

---

## Task 6: Frontend — pantalla `inventory/alerts/page.tsx`

**Files:**
- Create: `apps/web/src/app/(dashboard)/inventory/alerts/page.tsx`

- [ ] **Step 1: Crear la página completa**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Loader2, Search, FileDown, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { MetricsHelpButton } from '@/components/metrics-help-modal';

type Nivel = 'RECIEN_INGRESADO' | 'NUEVO_SIN_ROTACION' | 'STOCK_MUERTO';
interface AlertItem {
  productId: string; productCode: string; productName: string; category: string;
  supplierId: string | null; supplierName: string;
  currentStock: number; minStock: number; costUsd: number; inventoryValueUsd: number;
  lastEntryDate: string; lastEntrySource: 'PURCHASE' | 'CREATED';
  daysSinceEntry: number; soldSinceEntry: boolean; periodSales: number; daysOfInventory: number;
  alerts: { agotado: boolean; bajoMinimo: boolean; sinRotacion: Nivel | null; exceso: boolean };
}

type ReportKey = 'agotados' | 'bajo-minimo' | 'sin-rotacion' | 'exceso' | 'todos';

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'agotados', label: 'Agotados' },
  { key: 'bajo-minimo', label: 'Bajo mínimo' },
  { key: 'sin-rotacion', label: 'Sin rotación' },
  { key: 'exceso', label: 'Exceso' },
  { key: 'todos', label: 'Todos' },
];

const NIVEL_BADGE: Record<Nivel, { label: string; cls: string }> = {
  RECIEN_INGRESADO: { label: 'Recién ingresado', cls: 'bg-slate-500/10 text-slate-300 border-slate-500/20' },
  NUEVO_SIN_ROTACION: { label: 'Nuevo sin rotación', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  STOCK_MUERTO: { label: 'Stock muerto', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

function matchesReport(it: AlertItem, r: ReportKey): boolean {
  switch (r) {
    case 'agotados': return it.alerts.agotado;
    case 'bajo-minimo': return it.alerts.bajoMinimo;
    case 'sin-rotacion': return !!it.alerts.sinRotacion;
    case 'exceso': return it.alerts.exceso;
    default: return it.alerts.agotado || it.alerts.bajoMinimo || !!it.alerts.sinRotacion || it.alerts.exceso;
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function InventoryAlertsPage() {
  const [period, setPeriod] = useState<'30' | '60' | '90'>('30');
  const [report, setReport] = useState<ReportKey>('agotados');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AlertItem[]>([]);

  useEffect(() => { document.title = 'Alertas de Inventario | Trinity ERP'; }, []);

  function getRange() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - Number(period));
    const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: f(from), to: f(to) };
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange();
      const res = await fetch(`/api/proxy/inventory-analysis/alerts?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const filtered = items
    .filter((it) => matchesReport(it, report))
    .filter((it) => !search || it.productCode.toLowerCase().includes(search.toLowerCase()) || it.productName.toLowerCase().includes(search.toLowerCase()));

  function exportExcel() {
    const aoa: (string | number)[][] = [
      ['Código', 'Producto', 'Proveedor', 'Stock', 'Mínimo', 'Última entrada', 'Días', 'Estado'],
      ...filtered.map((it) => [
        it.productCode, it.productName, it.supplierName, it.currentStock, it.minStock,
        fmtDate(it.lastEntryDate), it.daysSinceEntry, estadoTexto(it),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alertas');
    XLSX.writeFile(wb, `alertas-${report}.xlsx`);
  }

  function exportPdf() {
    const { from, to } = getRange();
    window.open(`/api/proxy/inventory-analysis/alerts/pdf?from=${from}&to=${to}&report=${report}`, '_blank');
  }

  function estadoTexto(it: AlertItem): string {
    if (it.alerts.agotado) return 'Agotado';
    if (it.alerts.sinRotacion) return NIVEL_BADGE[it.alerts.sinRotacion].label;
    if (it.alerts.exceso) return `Exceso (${it.daysOfInventory} d)`;
    if (it.alerts.bajoMinimo) return 'Bajo mínimo';
    return '';
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="text-red-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Alertas de Inventario</h1>
            <p className="text-slate-400 text-sm">Agotados, bajo mínimo, sin rotación y exceso</p>
          </div>
        </div>
        <MetricsHelpButton metricKeys={['agotado', 'bajoMinimo', 'sinRotacion', 'exceso', 'valorInventario']} />
      </div>

      {/* Controls */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-3">
        {/* Report selector */}
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setReport(r.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${report === r.key ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:bg-slate-700 border border-transparent'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Period (relevant for excess) */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">Período (exceso):</span>
          {(['30', '60', '90'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-2.5 py-1 rounded text-xs font-medium ${period === d ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Search + exports */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="input-field !pl-9 w-full"
          />
        </div>
        <span className="text-xs text-slate-500">{filtered.length} artículos</span>
        <button onClick={exportExcel} className="btn-secondary !py-1.5 text-sm flex items-center gap-2">
          <FileDown size={16} /> Excel
        </button>
        <button onClick={exportPdf} className="btn-secondary !py-1.5 text-sm flex items-center gap-2">
          <FileText size={16} /> PDF
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Código</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Producto</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Proveedor</th>
                  <th className="text-right px-3 py-3 text-slate-400 font-medium">Stock</th>
                  <th className="text-right px-3 py-3 text-slate-400 font-medium">Mín.</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Últ. entrada</th>
                  <th className="text-right px-3 py-3 text-slate-400 font-medium">Días</th>
                  <th className="text-left px-3 py-3 text-slate-400 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-500">Sin artículos en este reporte</td></tr>
                ) : filtered.map((it) => (
                  <tr key={it.productId} className="border-b border-slate-700/30 hover:bg-slate-800/40">
                    <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">{it.productCode}</td>
                    <td className="px-3 py-2.5 text-white">{it.productName}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs">{it.supplierName}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${it.currentStock <= it.minStock ? 'text-red-400' : 'text-slate-300'}`}>{it.currentStock}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">{it.minStock}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs">
                      {fmtDate(it.lastEntryDate)}{it.lastEntrySource === 'CREATED' && <span className="text-slate-600"> (creado)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">{it.daysSinceEntry}</td>
                    <td className="px-3 py-2.5">
                      {it.alerts.agotado && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">Agotado</span>}
                      {it.alerts.sinRotacion && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${NIVEL_BADGE[it.alerts.sinRotacion].cls}`}>{NIVEL_BADGE[it.alerts.sinRotacion].label}</span>}
                      {it.alerts.exceso && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">Exceso</span>}
                      {!it.alerts.agotado && !it.alerts.sinRotacion && it.alerts.bajoMinimo && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">Bajo mínimo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar en el navegador**

Ir a `http://localhost:3000/inventory/alerts`.
Expected: carga la pantalla, el selector cambia entre reportes, el período recarga datos, el buscador filtra, y la tabla muestra badges. (La entrada de menú se agrega en Task 7; por ahora se navega por URL.)

- [ ] **Step 3: Verificar exportaciones**

Con el reporte "Todos" seleccionado: clic en **Excel** descarga `alertas-todos.xlsx`; clic en **PDF** abre el PDF.
Expected: ambos archivos con las filas visibles.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/inventory/alerts/page.tsx"
git commit -m "feat(web): pantalla Alertas de Inventario con filtros y export"
```

---

## Task 7: Frontend — entrada en el sidebar

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Agregar el ítem en la sección INVENTARIO**

En el array de `children` del grupo `key: 'inventory'` (después de `Movimientos`, línea ~113), agregar:

```tsx
      { label: 'Alertas de inventario', href: '/inventory/alerts', icon: <AlertTriangle size={18} /> },
```

- [ ] **Step 2: Verificar import del icono**

`AlertTriangle` ya se usa en el sidebar (línea ~127, "Sugerencias reorden"), así que ya está importado. Si el linter marca falta de import, agregarlo a la lista de `lucide-react`.

- [ ] **Step 3: Verificar en el navegador**

Recargar; en INVENTARIO debe aparecer "Alertas de inventario" y navegar a la pantalla.
Expected: el ítem aparece y funciona.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/sidebar.tsx
git commit -m "feat(web): entrada de menu Alertas de inventario"
```

---

## Task 8: Frontend — botón de ayuda en la pantalla de Análisis

**Files:**
- Modify: `apps/web/src/app/(dashboard)/purchases/analysis/page.tsx`

- [ ] **Step 1: Importar el botón**

Agregar a los imports del archivo (junto a los demás):

```tsx
import { MetricsHelpButton } from '@/components/metrics-help-modal';
```

- [ ] **Step 2: Colocar el botón en el header**

En el header (el `div` con `className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"`, línea ~143), agregar como segundo hijo del contenedor flex, después del `div` del título:

```tsx
        <MetricsHelpButton metricKeys={['abc', 'rotacion', 'diasInventario', 'rentabilidad', 'margen', 'valorInventario', 'sugerenciaCompra']} />
```

- [ ] **Step 3: Verificar en el navegador**

Ir a `http://localhost:3000/purchases/analysis`; debe verse el botón "¿Cómo se calcula?" y abrir el modal con las 7 métricas.
Expected: modal abre y lista ABC, rotación, días de inventario, rentabilidad, margen, valor de inventario, sugerencia de compra.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/purchases/analysis/page.tsx"
git commit -m "feat(web): boton Como se calcula en Analisis de Inventario"
```

---

## Verificación final (smoke completo)

- [ ] **Step 1: Recorrido funcional**
  - `/inventory/alerts`: probar los 5 selectores de reporte; confirmar que un producto comprado hace <10 días sin ventas aparece como **Recién ingresado** (no "Stock muerto").
  - Cambiar período y verificar que el reporte **Exceso** se recalcula.
  - Exportar Excel y PDF de al menos 2 reportes distintos.
  - Abrir "¿Cómo se calcula?" en **Alertas** y en **Análisis**.
- [ ] **Step 2: Build de producción (typecheck real)**

```bash
cd /c/Users/Diego/Desktop/Trinity && pnpm --filter @trinity/api build && pnpm --filter @trinity/web build
```

Expected: ambos builds terminan sin errores de TypeScript.

- [ ] **Step 3: Actualizar docs y avisar para deploy**

Actualizar `PROGRESS.md` y `PROJECT.md` (regla del proyecto) y avisar a Diego que la rama `feat/alertas-inventario` está lista para revisar/mergear y desplegar. NO desplegar (lo hace Diego).

---

## Notas de implementación
- **Timezone:** el backend usa `caracasDayStart/End` (ya importados en el service). No usar `setUTCHours`.
- **Supuesto clave (verificado en Task 1):** las ventas generan `StockMovement` tipo `SALE`. Si no, cambiar el cálculo de `soldSinceEntry`/`lastSaleMap` a `invoiceItem` + `invoice.createdAt`.
- **"Todos" en export:** incluye cualquier producto con al menos una alerta activa.
- **YAGNI:** umbrales fijos en código (no UI de configuración), según lo acordado.
```
