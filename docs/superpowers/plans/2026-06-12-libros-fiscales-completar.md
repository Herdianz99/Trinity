# Completar libros fiscales de ventas y compras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar los libros fiscales conformes al modelo correcto: el **libro de ventas detallado** debe registrar TODOS los documentos fiscales (facturas, NC, ND, retenciones, CxC) con columnas de tipo de documento, documento afectado y retención; el **libro de reportes Z** solo reportes Z + retenciones (corrigiendo el bug de que la retención muestra su factura); y el **libro de compras detallado** debe registrar también las NC/ND de compra.

**Architecture:** Reutiliza el patrón existente (auto-creación de `SalesBookEntry`/`PurchaseBookEntry` al confirmar documentos). Se agregan columnas `documentType` y `affectedDocNumber` a ambos modelos de libro (y `retentionAmountBs`/`retentionVoucherNumber` a `SalesBookEntry` para separar el IVA retenido del débito fiscal, igual que ya tiene `PurchaseBookEntry`). Las notas de crédito/débito generan su registro al pasar a `POSTED` en `credit-debit-notes.service.post()`, con signo negativo (NC) o positivo (ND). El frontend de ambos libros suma las columnas nuevas.

**Tech Stack:** NestJS + Prisma (PostgreSQL) en `apps/api`, Next.js App Router + Tailwind en `apps/web`, monorepo pnpm.

**Reglas de negocio:**
- Una nota/documento entra al libro **solo si su serie es fiscal** (`serie.isFiscal`).
- **NCV** (nota de crédito de venta) y **NCC** (compra) reducen → montos **negativos** en el libro. **NDV/NDC** suman → **positivos**.
- Las **retenciones** (de cliente, en ventas) van en columna propia "IVA Retenido" + "Comprobante", **no** suman al débito fiscal, y **no** muestran la factura en el libro Z.
- Las notas solo crean registro al confirmarse (`DRAFT → POSTED`). Una nota `POSTED` no se puede cancelar (el `cancel()` actual solo aplica a `DRAFT`), así que no hace falta revertir entradas de libro.
- El desglose por alícuota (8% / 16% / 16+15%) queda **fuera de este plan** (deuda técnica ya registrada en PROGRESS.md).

**Nota sobre tests:** el repo no tiene runner de tests. Cada task cierra con build (`pnpm -C apps/api build` / `pnpm -C apps/web build`) y verificación funcional (curl / UI / Prisma Studio), como el resto del proyecto.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `apps/api/src/modules/z-reports/z-reports.service.ts` | Modify | Bug: fila de retención no debe mostrar la factura |
| `apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx` | Modify | Bug en export Z + columnas nuevas del detallado |
| `packages/database/prisma/schema.prisma` | Modify | Columnas nuevas en SalesBookEntry y PurchaseBookEntry |
| `packages/database/prisma/migrations/20260612100000_book_document_types/migration.sql` | Create | Migración idempotente + backfill |
| `deploy/fix-schema.sql` | Modify | Red de seguridad del deploy |
| `apps/api/src/modules/invoices/invoices.service.ts` | Modify | documentType FACTURA en su SalesBookEntry |
| `apps/api/src/modules/receivables/receivables.service.ts` | Modify | documentType CXC |
| `apps/api/src/modules/customer-iva-retentions/customer-iva-retentions.service.ts` | Modify | RETENCION: monto a retentionAmountBs + comprobante + doc afectado |
| `apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts` | Modify | NCV/NDV→SalesBookEntry y NCC/NDC→PurchaseBookEntry al postear |
| `apps/api/src/modules/sales-book/sales-book.service.ts` | Modify | Totales con retención separada + PDF summary |
| `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` | Modify | documentType FACTURA en su PurchaseBookEntry |
| `apps/web/src/app/(dashboard)/fiscal/libro-compras/page.tsx` | Modify | Columna tipo + filas NC/ND |

---

### Task 1: Bug — la retención no debe mostrar su factura en el libro Z

**Files:**
- Modify: `apps/api/src/modules/z-reports/z-reports.service.ts:133-155`
- Modify: `apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx:713-736` (export Z)

- [ ] **Step 1: Backend — fila de retención sin factura**

En `z-reports.service.ts`, dentro del loop `for (const ret of retentions)` (línea ~133), reemplazar las dos líneas:

```typescript
        fromDoc: ret.invoiceNumber,
        toDoc: ret.invoiceNumber,
```

por (mostrar el comprobante de retención —guardado en `notes`— en vez de la factura):

```typescript
        fromDoc: ret.notes || '',
        toDoc: '',
```

- [ ] **Step 2: Frontend — export Z sin factura en la fila de retención**

En `libro-ventas/page.tsx`, dentro del loop `for (const e of allEntries)` que arma filas de retención (línea ~715), cambiar:

```typescript
        factura: e.invoiceNumber || '',
        serie: '', fiscal: e.controlNumber || '',
```

por:

```typescript
        factura: '',
        serie: '', fiscal: '',
```

(el número de comprobante ya se muestra en la columna `compRetencion: e.notes`, línea ~732 — no se toca).

- [ ] **Step 3: Build + verificación**

Run: `pnpm -C apps/api build` → compila.
Con el API arriba y una retención con comprobante registrado: `GET /z-reports?from=...&to=...` → la fila `type: 'retencion'` ya NO trae `fromDoc/toDoc` con el número de factura (trae el comprobante o vacío).
En la UI (`/fiscal/libro-ventas` → tab Reportes Z) y en el PDF exportado: la fila de retención muestra el comprobante, no la factura.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/z-reports/z-reports.service.ts "apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx"
git commit -m "fix: la retencion no debe mostrar su factura en el libro de reportes Z"
```

---

### Task 2: Schema — columnas de tipo de documento y retención en los libros

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (SalesBookEntry :1510, PurchaseBookEntry :1480)
- Create: `packages/database/prisma/migrations/20260612100000_book_document_types/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Columnas nuevas en SalesBookEntry**

En `model SalesBookEntry` (schema.prisma:1510), después de `isRetentionLine Boolean @default(false)`:

```prisma
  documentType         String      @default("FACTURA")
  affectedDocNumber    String?
  retentionAmountBs    Float       @default(0)
  retentionVoucherNumber String?
```

- [ ] **Step 2: Columnas nuevas en PurchaseBookEntry**

En `model PurchaseBookEntry` (schema.prisma:1480), después de `isManual Boolean @default(false)`:

```prisma
  documentType           String            @default("FACTURA")
  affectedDocNumber      String?
```

- [ ] **Step 3: Migración idempotente con backfill**

Create `packages/database/prisma/migrations/20260612100000_book_document_types/migration.sql`:

```sql
-- SalesBookEntry
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'FACTURA';
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "affectedDocNumber" TEXT;
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "retentionAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SalesBookEntry" ADD COLUMN IF NOT EXISTS "retentionVoucherNumber" TEXT;

-- PurchaseBookEntry
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "documentType" TEXT NOT NULL DEFAULT 'FACTURA';
ALTER TABLE "PurchaseBookEntry" ADD COLUMN IF NOT EXISTS "affectedDocNumber" TEXT;

-- Backfill: las lineas de retencion de venta existentes pasan su monto/comprobante a las columnas nuevas
UPDATE "SalesBookEntry"
SET "documentType" = 'RETENCION',
    "retentionAmountBs" = "ivaAmountBs",
    "retentionVoucherNumber" = "notes",
    "affectedDocNumber" = "invoiceNumber",
    "ivaAmountBs" = 0
WHERE "isRetentionLine" = true AND "documentType" = 'FACTURA';

-- Backfill: CxC fiscales existentes (receivableId no nulo) marcadas como CXC
UPDATE "SalesBookEntry" SET "documentType" = 'CXC'
WHERE "receivableId" IS NOT NULL AND "isRetentionLine" = false AND "documentType" = 'FACTURA';

-- Backfill: lineas de retencion en libro de compras
UPDATE "PurchaseBookEntry" SET "documentType" = 'RETENCION_IVA'
WHERE "isRetentionLine" = true AND "documentType" = 'FACTURA';
UPDATE "PurchaseBookEntry" SET "documentType" = 'RETENCION_ISLR'
WHERE "isIslrRetentionLine" = true AND "documentType" = 'FACTURA';
```

- [ ] **Step 4: Replicar en fix-schema.sql**

Agregar al final de `deploy/fix-schema.sql` los 6 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` del Step 3 (las columnas; el backfill no es necesario en el script de seguridad, pero incluirlo es idempotente — opcional). Incluir al menos los ALTER.

- [ ] **Step 5: Aplicar + generar**

Run: `pnpm -C packages/database exec prisma migrate deploy`
Run: `pnpm -C packages/database exec prisma generate`
Expected: migración aplicada; cliente regenerado con los campos nuevos.

- [ ] **Step 6: Build + commit**

Run: `pnpm -C apps/api build` → compila.

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260612100000_book_document_types/migration.sql deploy/fix-schema.sql
git commit -m "feat: columnas documentType/affectedDocNumber/retencion en libros fiscales"
```

---

### Task 3: Backend — documentType en las fuentes existentes + retención en columnas propias

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts:926` (SalesBookEntry de factura)
- Modify: `apps/api/src/modules/receivables/receivables.service.ts:132`
- Modify: `apps/api/src/modules/customer-iva-retentions/customer-iva-retentions.service.ts` (applyVoucherInTx)
- Modify: `apps/api/src/modules/z-reports/z-reports.service.ts:133-155`
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts:904`

- [ ] **Step 1: Factura de venta → documentType FACTURA**

En `invoices.service.ts`, en el `salesBookEntry.create` (línea ~926), agregar al `data`:

```typescript
            documentType: 'FACTURA',
```

- [ ] **Step 2: CxC fiscal → documentType CXC**

En `receivables.service.ts`, en el `salesBookEntry.create` (línea ~132), agregar al `data`:

```typescript
            documentType: 'CXC',
```

- [ ] **Step 3: Retención → monto y comprobante en columnas propias**

En `customer-iva-retentions.service.ts`, dentro de `applyVoucherInTx`, en el `tx.salesBookEntry.create` que crea la línea, reemplazar el bloque `data` para mover el monto a `retentionAmountBs` y dejar `ivaAmountBs` en 0:

```typescript
      data: {
        invoiceId: retention.invoiceId,
        entryDate: voucherDate,
        invoiceNumber: retention.invoice?.number || '',
        controlNumber: retention.invoice?.controlNumber || null,
        customerName: retention.customer?.name || '',
        customerRif: retention.customer?.rif
          ? `${retention.customer.documentType || ''}${retention.customer.documentType ? '-' : ''}${retention.customer.rif}`
          : null,
        exemptAmountBs: 0,
        taxableBaseBs: 0,
        ivaAmountBs: 0,
        igtfAmountBs: 0,
        totalBs: 0,
        isManual: false,
        isRetentionLine: true,
        documentType: 'RETENCION',
        affectedDocNumber: retention.invoice?.number || null,
        retentionAmountBs: retentionBs,
        retentionVoucherNumber: dto.voucherNumber,
        notes: dto.voucherNumber,
        createdById: userId,
      },
```

(Se mantiene `notes` con el comprobante por compatibilidad con código que aún lo lea.)

- [ ] **Step 4: Z-reports lee el monto retenido desde retentionAmountBs**

En `z-reports.service.ts`, en el loop `for (const ret of retentions)` (línea ~133), cambiar:

```typescript
        taxBs: round2(ret.ivaAmountBs),
```

por:

```typescript
        taxBs: round2(ret.retentionAmountBs),
```

Y `fromDoc` (ya ajustado en Task 1) usar el comprobante dedicado:

```typescript
        fromDoc: ret.retentionVoucherNumber || ret.notes || '',
        toDoc: '',
```

- [ ] **Step 5: Factura de compra → documentType FACTURA**

En `purchase-orders.service.ts`, en el `purchaseBookEntry.create` (línea ~904), agregar al `data`:

```typescript
            documentType: 'FACTURA',
```

- [ ] **Step 6: Build + verificación manual**

Run: `pnpm -C apps/api build` → compila.
1. Registrar comprobante de una retención nueva → en Prisma Studio el `SalesBookEntry` tiene `documentType='RETENCION'`, `retentionAmountBs` con el monto, `ivaAmountBs=0`, `retentionVoucherNumber` con los 14 dígitos.
2. `GET /z-reports?...` → la fila de retención trae `taxBs` = monto retenido y `fromDoc` = comprobante (no la factura).
3. `GET /sales-book?...` → la factura nueva trae `documentType='FACTURA'`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts apps/api/src/modules/receivables/receivables.service.ts apps/api/src/modules/customer-iva-retentions/customer-iva-retentions.service.ts apps/api/src/modules/z-reports/z-reports.service.ts apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat: documentType en fuentes de libros y monto de retencion en columna propia"
```

---

### Task 4: Backend — NCV/NDV generan registro en el libro de ventas detallado

**Files:**
- Modify: `apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts` (método `post`, dentro de la transacción, antes del `update` a POSTED, ~línea 580)

- [ ] **Step 1: Cargar la nota con serie e invoice number**

En `post()` (línea 471), cambiar el `findUnique` inicial para incluir serie e invoice:

```typescript
    const note = await this.prisma.creditDebitNote.findUnique({
      where: { id },
      include: {
        items: true,
        serie: { select: { isFiscal: true } },
        invoice: { select: { number: true } },
        purchaseOrder: { select: { number: true } },
      },
    });
```

- [ ] **Step 2: Crear SalesBookEntry para NCV/NDV fiscales**

Dentro de la transacción de `post()`, justo antes de `await tx.creditDebitNote.update({ where: { id }, data: { status: 'POSTED' } })` (línea ~581), agregar:

```typescript
      // Libro de ventas: NCV (resta) / NDV (suma) fiscales
      if ((note.type === 'NCV' || note.type === 'NDV') && note.serie?.isFiscal) {
        const sign = note.type === 'NCV' ? -1 : 1;
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const customer = note.invoiceId
          ? await tx.invoice.findUnique({ where: { id: note.invoiceId }, select: { customer: { select: { name: true, rif: true, documentType: true } } } })
          : null;
        await tx.salesBookEntry.create({
          data: {
            entryDate: new Date(),
            invoiceNumber: note.number,
            controlNumber: note.fiscalNumber || null,
            customerName: customer?.customer?.name || 'Cliente General',
            customerRif: customer?.customer?.rif
              ? `${customer.customer.documentType || ''}${customer.customer.documentType ? '-' : ''}${customer.customer.rif}`
              : null,
            exemptAmountBs: r2(sign * 0),
            taxableBaseBs: r2(sign * (note.subtotalBs || 0)),
            ivaAmountBs: r2(sign * (note.ivaBs || 0)),
            igtfAmountBs: r2(sign * (note.igtfBs || 0)),
            totalBs: r2(sign * (note.totalBs || 0)),
            isManual: false,
            documentType: note.type,
            affectedDocNumber: note.invoice?.number || null,
            createdById: userId,
          },
        });
      }
```

- [ ] **Step 3: Build + verificación manual**

Run: `pnpm -C apps/api build` → compila.
1. Crear una NCV sobre una factura fiscal y confirmarla (`POST /credit-debit-notes/:id/post`).
2. `GET /sales-book?from&to` (período de hoy) → aparece un `SalesBookEntry` con `documentType='NCV'`, montos negativos, `affectedDocNumber` = número de la factura.
3. Confirmar una NDV → entrada `documentType='NDV'` con montos positivos.
4. `GET /z-reports?...` → la NCV/NDV **no** aparece ahí (el Z solo trae ZReports + retenciones).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts
git commit -m "feat: NCV/NDV fiscales generan registro en el libro de ventas detallado"
```

---

### Task 5: Backend — NCC/NDC generan registro en el libro de compras detallado

**Files:**
- Modify: `apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts` (método `post`, misma transacción)

- [ ] **Step 1: Crear PurchaseBookEntry para NCC/NDC fiscales**

En `post()`, justo después del bloque del Step 2 de Task 4 (y antes del update a POSTED), agregar:

```typescript
      // Libro de compras: NCC (resta) / NDC (suma) fiscales
      if ((note.type === 'NCC' || note.type === 'NDC') && note.serie?.isFiscal) {
        const sign = note.type === 'NCC' ? -1 : 1;
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const supplier = note.purchaseOrderId
          ? await tx.purchaseOrder.findUnique({ where: { id: note.purchaseOrderId }, select: { supplier: { select: { name: true, rif: true } } } })
          : null;
        await tx.purchaseBookEntry.create({
          data: {
            entryDate: new Date(),
            supplierControlNumber: note.fiscalNumber || null,
            supplierInvoiceNumber: note.number,
            supplierName: supplier?.supplier?.name || 'Proveedor',
            supplierRif: supplier?.supplier?.rif || 'S/R',
            exemptAmountBs: 0,
            taxableBaseBs: r2(sign * (note.subtotalBs || 0)),
            ivaAmountBs: r2(sign * (note.ivaBs || 0)),
            totalBs: r2(sign * (note.totalBs || 0)),
            isManual: false,
            isRetentionLine: false,
            documentType: note.type,
            affectedDocNumber: note.purchaseOrder?.number || null,
            createdById: userId,
          },
        });
      }
```

- [ ] **Step 2: Build + verificación manual**

Run: `pnpm -C apps/api build` → compila.
1. Crear una NCC sobre una factura de compra fiscal y confirmarla.
2. `GET /purchase-book?from&to` → aparece `PurchaseBookEntry` con `documentType='NCC'`, montos negativos, `affectedDocNumber` = número de la compra.
3. Revisar que el **crédito fiscal del período baje** por la NCC (era el gap 🔴 de la auditoría).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts
git commit -m "feat: NCC/NDC fiscales generan registro en el libro de compras detallado"
```

---

### Task 6: Backend — totales del libro de ventas con retención separada + PDF

**Files:**
- Modify: `apps/api/src/modules/sales-book/sales-book.service.ts` (findAll totales :33-58, generatePdfData :132-150)

- [ ] **Step 1: Sumar retención aparte en los totales**

En `findAll()`, reemplazar el bloque de acumulación de totales (líneas ~33-45) por uno que sume el IVA retenido en su propio total y excluya las líneas de retención del débito fiscal:

```typescript
    let totalExempt = 0;
    let totalTaxableBase = 0;
    let totalIva = 0;
    let totalIgtf = 0;
    let totalAmount = 0;
    let totalRetention = 0;

    for (const entry of entries) {
      totalRetention += entry.retentionAmountBs;
      if (entry.isRetentionLine) continue; // el IVA retenido no es débito fiscal
      totalExempt += entry.exemptAmountBs;
      totalTaxableBase += entry.taxableBaseBs;
      totalIva += entry.ivaAmountBs;
      totalIgtf += entry.igtfAmountBs;
      totalAmount += entry.totalBs;
    }
```

Y en el objeto `totales` del return (línea ~50), agregar:

```typescript
        retentionAmountBs: round2(totalRetention),
```

- [ ] **Step 2: Incluir retención en el resumen del PDF**

En `generatePdfData()` (línea ~135), agregar al objeto `summary`:

```typescript
      totalRetencionesIva: data.totales.retentionAmountBs,
```

- [ ] **Step 3: Build + verificación**

Run: `pnpm -C apps/api build` → compila.
`GET /sales-book?from&to` en un período con factura + NCV + retención → `totales.ivaAmountBs` = débito fiscal neto (factura − NCV, sin la retención), y `totales.retentionAmountBs` = monto retenido.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/sales-book/sales-book.service.ts
git commit -m "feat: total de IVA retenido separado en el libro de ventas"
```

---

### Task 7: Frontend — columnas nuevas en el libro de ventas detallado

**Files:**
- Modify: `apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx` (interface SalesBookEntry :10-30, Totales :32-39, tabla detallado :1147-1256, export detallado)

- [ ] **Step 1: Extender interfaces**

En la interface `SalesBookEntry` (línea ~10) agregar:

```typescript
  documentType: string;
  affectedDocNumber: string | null;
  retentionAmountBs: number;
  retentionVoucherNumber: string | null;
```

En la interface `Totales` (línea ~32) agregar:

```typescript
  retentionAmountBs: number;
```

- [ ] **Step 2: Helper de etiqueta de tipo**

Cerca de los helpers (después de `formatVe`, línea ~86) agregar:

```typescript
const DOC_TYPE_LABEL: Record<string, string> = {
  FACTURA: 'Factura',
  NCV: 'N. Crédito',
  NDV: 'N. Débito',
  RETENCION: 'Retención',
  CXC: 'CxC',
};
function docTypeLabel(t: string): string {
  return DOC_TYPE_LABEL[t] || t;
}
```

- [ ] **Step 3: Encabezados de la tabla detallado**

En el `<thead>` del tab detallado (línea ~1148), reemplazar la fila de encabezados por (agrega Tipo, Doc. Afect., IVA Ret., Comprob.):

```tsx
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium w-10">N&deg;</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Fecha</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Tipo</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">N&deg; Control</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">N&deg; Doc.</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Doc. Afect.</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">Cliente</th>
                      <th className="text-left px-2 py-2.5 text-slate-400 font-medium">RIF</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Exento Bs</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Base Imp. Bs</th>
                      <th className="text-right px-2 py-2.5 text-emerald-400 font-medium">IVA Bs</th>
                      <th className="text-right px-2 py-2.5 text-purple-400 font-medium">IVA Ret. Bs</th>
                      <th className="text-left px-2 py-2.5 text-purple-400 font-medium">Comprob.</th>
                      <th className="text-right px-2 py-2.5 text-amber-400 font-medium">IGTF Bs</th>
                      <th className="text-right px-2 py-2.5 text-slate-400 font-medium">Total Bs</th>
                      <th className="text-center px-2 py-2.5 text-slate-400 font-medium w-20">Acc.</th>
                    </tr>
```

- [ ] **Step 4: Celdas de cada fila**

En el `.map((entry, i) => ...)` (línea ~1180), reemplazar el contenido `<tr>` por uno que incluya las celdas nuevas y resalte montos negativos. Reemplazar desde la celda de Fecha hasta la de Total:

```tsx
                          <tr key={entry.id} className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group ${entry.isRetentionLine ? 'bg-purple-500/5' : ''}`}>
                            <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-2 py-2 text-slate-300">
                              {entry.entryDate ? new Date(entry.entryDate).toLocaleDateString('es-VE') : ''}
                            </td>
                            <td className="px-2 py-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-600/40 text-slate-300 border border-slate-500/30">
                                {docTypeLabel(entry.documentType)}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">{entry.controlNumber || '-'}</td>
                            <td className="px-2 py-2 text-slate-200 font-mono text-[11px]">{entry.invoiceNumber}</td>
                            <td className="px-2 py-2 text-slate-400 font-mono text-[11px]">{entry.affectedDocNumber || '-'}</td>
                            <td className="px-2 py-2 text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate max-w-[150px]">{entry.customerName}</span>
                                {entry.isManual && entry.documentType !== 'RETENCION' && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">MANUAL</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-slate-300 font-mono text-[11px]">{entry.customerRif || 'S/R'}</td>
                            <td className="px-2 py-2 text-right text-slate-300 tabular-nums">{formatVe(entry.exemptAmountBs)}</td>
                            <td className="px-2 py-2 text-right text-slate-300 tabular-nums">{formatVe(entry.taxableBaseBs)}</td>
                            <td className="px-2 py-2 text-right text-emerald-400 tabular-nums font-medium">{formatVe(entry.ivaAmountBs)}</td>
                            <td className="px-2 py-2 text-right text-purple-400 tabular-nums">{entry.retentionAmountBs ? formatVe(entry.retentionAmountBs) : '-'}</td>
                            <td className="px-2 py-2 text-purple-400 font-mono text-[10px]">{entry.retentionVoucherNumber || '-'}</td>
                            <td className="px-2 py-2 text-right text-amber-400 tabular-nums">{formatVe(entry.igtfAmountBs)}</td>
                            <td className="px-2 py-2 text-right text-slate-100 font-semibold tabular-nums">{formatVe(entry.totalBs)}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEditModal(entry)} className="p-1 rounded hover:bg-slate-600/60 text-slate-400 hover:text-blue-400 transition-colors" title="Editar"><Pencil size={14} /></button>
                                <button onClick={() => handleDelete(entry.id)} className="p-1 rounded hover:bg-slate-600/60 text-slate-400 hover:text-red-400 transition-colors" title="Eliminar"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
```

- [ ] **Step 5: Fila de totales (ajustar colSpan y agregar IVA retenido)**

En la fila de totales del detallado (línea ~1238), reemplazar por (colSpan ajustado a las nuevas columnas; agrega total de IVA retenido):

```tsx
                          <tr className="bg-slate-700/30 border-t-2 border-slate-600">
                            <td colSpan={8} className="px-2 py-2.5 text-slate-100 font-bold">
                              TOTALES ({totales.totalEntries} entradas)
                            </td>
                            <td className="px-2 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.exemptAmountBs)}</td>
                            <td className="px-2 py-2.5 text-right text-slate-100 font-bold tabular-nums">{formatVe(totales.taxableBaseBs)}</td>
                            <td className="px-2 py-2.5 text-right text-emerald-400 font-bold tabular-nums">{formatVe(totales.ivaAmountBs)}</td>
                            <td className="px-2 py-2.5 text-right text-purple-400 font-bold tabular-nums">{formatVe(totales.retentionAmountBs)}</td>
                            <td></td>
                            <td className="px-2 py-2.5 text-right text-amber-400 font-bold tabular-nums">{formatVe(totales.igtfAmountBs)}</td>
                            <td className="px-2 py-2.5 text-right text-emerald-400 font-bold tabular-nums">{formatVe(totales.totalBs)}</td>
                            <td></td>
                          </tr>
```

Y en el mensaje "No hay entradas" (línea ~1167) cambiar `colSpan={12}` por `colSpan={16}`.

- [ ] **Step 6: Build + verificación**

Run: `pnpm -C apps/web build` → compila.
En `/fiscal/libro-ventas` (tab Detallado), en un período con factura + NCV + retención: se ven las columnas Tipo, Doc. Afect., IVA Ret. y Comprob.; la NCV con montos negativos; la retención con su monto en "IVA Ret." y el comprobante; los totales muestran débito fiscal neto y el total retenido.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx"
git commit -m "feat: columnas de tipo, documento afectado y retencion en libro de ventas detallado"
```

---

### Task 8: Frontend — columna de tipo y filas NC/ND en el libro de compras

**Files:**
- Modify: `apps/web/src/app/(dashboard)/fiscal/libro-compras/page.tsx` (interface :19-34, tabla)

- [ ] **Step 1: Extender interface**

En la interface de entrada del libro de compras (línea ~19, donde están `taxableBaseBs`, `retentionVoucherNumber`, etc.) agregar:

```typescript
  documentType: string;
  affectedDocNumber: string | null;
```

- [ ] **Step 2: Helper de etiqueta**

Cerca de los helpers (después de `formatVe`, línea ~64) agregar:

```typescript
const PURCHASE_DOC_LABEL: Record<string, string> = {
  FACTURA: 'Factura',
  NCC: 'N. Crédito',
  NDC: 'N. Débito',
  RETENCION_IVA: 'Ret. IVA',
  RETENCION_ISLR: 'Ret. ISLR',
};
function purchaseDocLabel(t: string): string {
  return PURCHASE_DOC_LABEL[t] || t;
}
```

- [ ] **Step 3: Mostrar el tipo en las filas no-retención**

En la tabla del libro de compras, localizar la celda que hoy muestra el número de factura del proveedor (alrededor de `entry.supplierInvoiceNumber`, libro-compras/page.tsx:562) y anteponer una celda/etiqueta de tipo para las filas que no son de retención. Donde se arma cada fila normal (la condición `!entry.isRetentionLine && !entry.isIslrRetentionLine`), agregar junto al número de documento un chip:

```tsx
{!entry.isRetentionLine && !entry.isIslrRetentionLine && (
  <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold bg-slate-600/40 text-slate-300 border border-slate-500/30">
    {purchaseDocLabel(entry.documentType)}
  </span>
)}
```

(Ubicarlo en la celda del número de documento del proveedor para no romper el `colSpan` del resto de la tabla. El detalle visual exacto se ajusta con la skill frontend-design manteniendo la estética slate.)

- [ ] **Step 4: Build + verificación**

Run: `pnpm -C apps/web build` → compila.
En `/fiscal/libro-compras`, en un período con una NCC confirmada: la fila aparece con el chip "N. Crédito", montos negativos, y el total de crédito fiscal del período baja en consecuencia.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/fiscal/libro-compras/page.tsx"
git commit -m "feat: etiqueta de tipo de documento en el libro de compras detallado"
```

---

### Task 9: Verificación end-to-end + docs + push

- [ ] **Step 1: Flujo completo de ventas**

1. Factura fiscal a crédito a contribuyente especial → retención auto.
2. NCV sobre una factura fiscal → confirmar → aparece en el detallado (negativo, tipo N.Crédito, doc afectado) y NO en el Z.
3. Registrar comprobante de la retención → línea en el detallado (tipo Retención, IVA Ret., comprobante) y fila en el Z **sin** mostrar la factura.
4. Totales del detallado: débito fiscal neto (factura − NCV), total de IVA retenido aparte.

- [ ] **Step 2: Flujo completo de compras**

1. NCC sobre una factura de compra fiscal → confirmar → aparece en el libro de compras (negativo, tipo N.Crédito) → el crédito fiscal del período baja.

- [ ] **Step 3: Actualizar PROGRESS.md**

Marcar en la sección "🔍 EN PROGRESO — Auditoría libros fiscales" los ítems resueltos: NCC/NDC en libro de compras → [RESUELTO]; columnas faltantes del detallado de ventas → [RESUELTO]; bug factura en Z → [RESUELTO]. Dejar NCV/NDV de forma libre, alícuotas, TXT SENIAT, importaciones e ISLR como pendientes de decisión.

- [ ] **Step 4: Push (deploy lo hace el usuario)**

```bash
git push origin main
```

No ejecutar el deploy — Diego lo hace manualmente.

---

## Self-Review (ejecutada al escribir el plan)

- **Cobertura:** bug factura en Z → Task 1 (+ refinado en Task 3). Columnas del detallado de ventas (tipo, doc afectado, IVA retenido, comprobante) → Tasks 2,3,7. NCV/NDV al detallado → Task 4. NCC/NDC al libro de compras → Task 5. Totales con retención separada → Task 6. Etiqueta de tipo en compras → Task 8. Verificación + docs → Task 9.
- **Tipos consistentes:** `documentType` (string), `affectedDocNumber`, `retentionAmountBs`, `retentionVoucherNumber` usados igual en schema, migración, services y ambos frontends. Valores: ventas FACTURA/NCV/NDV/RETENCION/CXC; compras FACTURA/NCC/NDC/RETENCION_IVA/RETENCION_ISLR.
- **Migración:** idempotente (IF NOT EXISTS) + backfill de datos existentes (retenciones de venta y compra, CxC) + replicada en fix-schema.sql.
- **Sin placeholders:** cada paso tiene el código concreto; el ajuste fino visual de Task 8 se delega a frontend-design por diseño, con la ubicación y el chip ya especificados.
- **Fuera de alcance (declarado):** desglose por alícuota, NCV/NDV de forma libre como línea propia (hoy van por Z si son de máquina), TXT SENIAT — siguen como deuda técnica en PROGRESS.md.
