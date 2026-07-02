# Retenciones (IVA + ISLR) sobre CxP — Plan 1: Backend / Motor Fiscal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hacer que las retenciones de IVA e ISLR sobre Cuentas por Pagar sean comprobantes-documento (no restan el neto de la CxP) que se crean inline o por pantalla, van al libro de compras, y son seleccionables como documentos negativos en el recibo de pago.

**Architecture:** Se espeja el patrón de la retención de IVA existente. `IslrRetentionVoucherLine` gana `payableId` (la de IVA ya lo tiene). El recibo (`ReceiptItem`) gana FKs a los comprobantes de retención + tipos de enum, y los netea con `sign`. Se quita la reducción del neto de la CxP. Una migración marca los comprobantes preexistentes como aplicados para evitar doble descuento.

**Tech Stack:** NestJS + Prisma (Postgres) en `apps/api`; monorepo pnpm.

**Verificación:** el proyecto NO tiene tests automatizados. Cada tarea cierra con `pnpm --filter @trinity/api exec tsc --noEmit` en 0 + commit. Prueba funcional al final por API/BD. Este es el **Plan 1 (backend)**; el frontend va en el Plan 2.

**Alcance de este plan:** solo backend + schema. El **Plan 2** hará los formularios/pantallas.

---

## Estructura de archivos

**Modificados:**
- `packages/database/prisma/schema.prisma` + nueva migración + `deploy/fix-schema.sql`
- `apps/api/src/modules/payables/dto/create-payable.dto.ts`
- `apps/api/src/modules/payables/payables.service.ts`
- `apps/api/src/modules/retention-vouchers/retention-vouchers.service.ts` (+ dto/controller)
- `apps/api/src/modules/islr-retention-vouchers/islr-retention-vouchers.service.ts` (+ dto/controller)
- `apps/api/src/modules/receipts/receipts.service.ts` (+ `dto/create-receipt.dto.ts`)

---

## Task 1: Schema + migración + fix-schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260702190000_retenciones_cxp/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: `ReceiptItemType` — nuevos tipos**

En `schema.prisma`, reemplazar el enum:

```prisma
enum ReceiptItemType {
  RECEIVABLE
  PAYABLE
  DIFFERENTIAL
  CREDIT_NOTE
  DEBIT_NOTE
  IVA_RETENTION
  SALES_IVA_RETENTION
}
```

por:

```prisma
enum ReceiptItemType {
  RECEIVABLE
  PAYABLE
  DIFFERENTIAL
  CREDIT_NOTE
  DEBIT_NOTE
  IVA_RETENTION
  SALES_IVA_RETENTION
  PURCHASE_IVA_RETENTION
  PURCHASE_ISLR_RETENTION
}
```

- [ ] **Step 2: `ReceiptItem` — FKs a los comprobantes**

En el modelo `ReceiptItem`, ubicar la línea `customerIvaRetention   CustomerIvaRetention? @relation(fields: [customerIvaRetentionId], references: [id])` y agregar **debajo**:

```prisma
  retentionVoucherId     String?
  retentionVoucher       RetentionVoucher?     @relation(fields: [retentionVoucherId], references: [id])
  islrRetentionVoucherId String?
  islrRetentionVoucher   IslrRetentionVoucher? @relation(fields: [islrRetentionVoucherId], references: [id])
```

- [ ] **Step 3: `RetentionVoucher` — appliedAt + relación**

En el modelo `RetentionVoucher`, ubicar `bookEntries        PurchaseBookEntry[]` y agregar **debajo**:

```prisma
  appliedAt          DateTime?
  receiptItems       ReceiptItem[]
```

- [ ] **Step 4: `IslrRetentionVoucher` — appliedAt + relación**

En el modelo `IslrRetentionVoucher`, ubicar la línea `lines                    IslrRetentionVoucherLine[]` y agregar **debajo**:

```prisma
  appliedAt                DateTime?
  receiptItems             ReceiptItem[]
```

- [ ] **Step 5: `IslrRetentionVoucherLine` — payableId**

En el modelo `IslrRetentionVoucherLine`, ubicar:

```prisma
  purchaseOrderId          String?
  purchaseOrder            PurchaseOrder?        @relation(fields: [purchaseOrderId], references: [id])
```

y agregar **debajo**:

```prisma
  payableId                String?
  payable                  Payable?              @relation(fields: [payableId], references: [id])
```

- [ ] **Step 6: `Payable` — relación inversa ISLR**

En el modelo `Payable`, ubicar `retentionVoucherLines  RetentionVoucherLine[]` y agregar **debajo**:

```prisma
  islrRetentionVoucherLines IslrRetentionVoucherLine[]
```

- [ ] **Step 7: Escribir la migración**

Crear `packages/database/prisma/migrations/20260702190000_retenciones_cxp/migration.sql`:

```sql
-- ReceiptItem: FKs a comprobantes de retencion de compra
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "retentionVoucherId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "islrRetentionVoucherId" TEXT;

-- IslrRetentionVoucherLine: soporte de CxP
ALTER TABLE "IslrRetentionVoucherLine" ADD COLUMN IF NOT EXISTS "payableId" TEXT;

-- appliedAt en los comprobantes
ALTER TABLE "RetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TABLE "IslrRetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);

-- Nuevos valores del enum (idempotente)
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_IVA_RETENTION';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_ISLR_RETENTION';

-- FKs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_retentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_retentionVoucherId_fkey"
      FOREIGN KEY ("retentionVoucherId") REFERENCES "RetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_islrRetentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_islrRetentionVoucherId_fkey"
      FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'IslrRetentionVoucherLine_payableId_fkey') THEN
    ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_payableId_fkey"
      FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ANTI DOBLE-DESCUENTO (una sola vez): marcar como aplicados los comprobantes
-- preexistentes, para que solo los creados DESPUES aparezcan en el recibo.
-- OJO: esto va SOLO en esta migracion, NUNCA en fix-schema.sql (si no, cada deploy
-- marcaria aplicados los comprobantes pendientes nuevos).
UPDATE "RetentionVoucher" SET "appliedAt" = now() WHERE "appliedAt" IS NULL;
UPDATE "IslrRetentionVoucher" SET "appliedAt" = now() WHERE "appliedAt" IS NULL;
```

- [ ] **Step 8: Espejo en `deploy/fix-schema.sql` (SOLO estructura, NO el UPDATE)**

Agregar al final de `deploy/fix-schema.sql`:

```sql
-- =============================================================================
-- RETENCIONES SOBRE CUENTAS POR PAGAR (Session 106)
-- Comprobantes de retencion (IVA/ISLR) seleccionables en el recibo de pago.
-- =============================================================================
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "retentionVoucherId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "islrRetentionVoucherId" TEXT;
ALTER TABLE "IslrRetentionVoucherLine" ADD COLUMN IF NOT EXISTS "payableId" TEXT;
ALTER TABLE "RetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TABLE "IslrRetentionVoucher" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_IVA_RETENTION';
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'PURCHASE_ISLR_RETENTION';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_retentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_retentionVoucherId_fkey"
      FOREIGN KEY ("retentionVoucherId") REFERENCES "RetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ReceiptItem_islrRetentionVoucherId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_islrRetentionVoucherId_fkey"
      FOREIGN KEY ("islrRetentionVoucherId") REFERENCES "IslrRetentionVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'IslrRetentionVoucherLine_payableId_fkey') THEN
    ALTER TABLE "IslrRetentionVoucherLine" ADD CONSTRAINT "IslrRetentionVoucherLine_payableId_fkey"
      FOREIGN KEY ("payableId") REFERENCES "Payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
```

- [ ] **Step 9: Aplicar migración local + generar cliente**

Run:
```bash
pnpm --filter @trinity/database exec prisma migrate deploy
pnpm --filter @trinity/database exec prisma generate
```
Expected: "1 migration applied" + "Generated Prisma Client".

- [ ] **Step 10: Verificar columnas**

Run:
```bash
docker exec trinity-postgres-1 psql -U trebol -d trebol_db -c "\d \"ReceiptItem\"" | grep -E "retentionVoucherId|islrRetentionVoucherId"
docker exec trinity-postgres-1 psql -U trebol -d trebol_db -c "\d \"IslrRetentionVoucherLine\"" | grep payableId
```
Expected: columnas presentes.

- [ ] **Step 11: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260702190000_retenciones_cxp deploy/fix-schema.sql
git commit -m "feat: Sesion 106 - schema retenciones sobre CxP (ReceiptItem->comprobantes, ISLR->payable)"
```

---

## Task 2: Payables inline — dejar de restar el neto + ISLR inline

**Files:**
- Modify: `apps/api/src/modules/payables/dto/create-payable.dto.ts`
- Modify: `apps/api/src/modules/payables/payables.service.ts:312-321` (quitar reducción) y agregar bloque ISLR

- [ ] **Step 1: DTO — campos ISLR**

En `create-payable.dto.ts`, ubicar:

```typescript
  @IsOptional()
  @IsNumber()
  @Min(0)
  retentionPct?: number;
```

y agregar **debajo**:

```typescript
  // Retencion ISLR (crea IslrRetentionVoucher documento)
  @IsOptional()
  @IsBoolean()
  createIslrRetention?: boolean;

  @IsOptional()
  @IsString()
  islrRetentionTypeId?: string;
```

- [ ] **Step 2: Quitar la reducción del neto en el bloque IVA**

En `payables.service.ts`, dentro del bloque `if (dto.createRetention && ...)`, **eliminar** este `payable.update` (era la reducción del neto):

```typescript
        // Update payable retention fields
        await tx.payable.update({
          where: { id: payable.id },
          data: {
            retentionUsd: retAmountUsd,
            retentionBs: retAmountBs,
            netPayableUsd: Math.round((amountUsd - retAmountUsd) * 100) / 100,
            netPayableBs: Math.round((amountBs - retAmountBs) * 100) / 100,
          },
        });
```

(El neto ya queda = monto porque en la creación se setea `netPayableUsd = amountUsd`. La retención IVA sigue creando su `RetentionVoucher` + línea de libro; solo deja de tocar el neto.)

- [ ] **Step 3: Agregar el bloque ISLR inline**

En `payables.service.ts`, **justo después** del cierre del bloque `if (dto.createRetention && isFiscal && userId && totalIva > 0) { ... }` (donde antes estaba el update borrado), agregar:

```typescript
      // Retencion ISLR inline (documento aparte, NO reduce el neto)
      const islrBaseCurr = exemptBase + taxableBase8 + taxableBase16 + taxableBase31;
      if (dto.createIslrRetention && dto.islrRetentionTypeId && isFiscal && userId && islrBaseCurr > 0) {
        const tipo = await tx.islrRetentionType.findUnique({ where: { id: dto.islrRetentionTypeId } });
        if (!tipo) throw new BadRequestException('Tipo de retencion ISLR no encontrado');

        const valorUT = (config as any)?.unidadTributaria ?? 43;
        const baseUsd = toUsd(islrBaseCurr);
        const baseBs = toBs(islrBaseCurr);

        let sustraendoBs = 0;
        if (tipo.sustraendoUt > 0 && supplier.supplierType === 'NATURAL_RESIDENTE') {
          sustraendoBs = Math.round(tipo.sustraendoUt * valorUT * 100) / 100;
        }
        const baseAjustadaBs = baseBs * (tipo.baseImponiblePct / 100);
        const retBs = Math.max(0, Math.round((baseAjustadaBs * (tipo.retentionPct / 100) - sustraendoBs) * 100) / 100);
        const baseAjustadaUsd = baseUsd * (tipo.baseImponiblePct / 100);
        const sustraendoUsd = r > 0 ? Math.round((sustraendoBs / r) * 100) / 100 : 0;
        const retUsd = Math.max(0, Math.round((baseAjustadaUsd * (tipo.retentionPct / 100) - sustraendoUsd) * 100) / 100);

        // Numero global ISLR: YYYYMM + 8 digitos
        const islrNext = (config as any)?.islrRetentionNextNumber || 1;
        const now2 = new Date();
        const yyyymm2 = `${now2.getFullYear()}${(now2.getMonth() + 1).toString().padStart(2, '0')}`;
        const islrNumber = `${yyyymm2}${islrNext.toString().padStart(8, '0')}`;
        await tx.companyConfig.update({
          where: { id: 'singleton' },
          data: { islrRetentionNextNumber: islrNext + 1 } as any,
        });

        const islrVoucher = await tx.islrRetentionVoucher.create({
          data: {
            number: islrNumber,
            supplierId: dto.supplierId,
            serieId: dto.serieId || null,
            status: 'ISSUED',
            issueDate: receptionDate || originalDate || new Date(),
            retentionAmountUsd: retUsd,
            retentionAmountBs: retBs,
            exchangeRate: r,
            unidadTributaria: valorUT,
            notes: `Retencion ISLR sobre CxP ${number}`,
            createdById: userId,
            lines: {
              create: {
                payableId: payable.id,
                islrRetentionTypeId: tipo.id,
                supplierInvoiceNumber: dto.documentNumber || null,
                supplierControlNumber: dto.controlFiscal || null,
                invoiceDate: originalDate || new Date(),
                invoiceTotalUsd: amountUsd,
                invoiceTotalBs: amountBs,
                taxableBaseUsd: baseUsd,
                taxableBaseBs: baseBs,
                baseImponiblePct: tipo.baseImponiblePct,
                retentionPct: tipo.retentionPct,
                sustraendoUt: tipo.sustraendoUt,
                sustraendoBs,
                retentionAmountUsd: retUsd,
                retentionAmountBs: retBs,
                exchangeRate: r,
                isManual: false,
              },
            },
          },
        });

        // Linea del libro de compras (negativa) por la retencion ISLR
        await tx.purchaseBookEntry.create({
          data: {
            islrRetentionVoucherId: islrVoucher.id,
            islrRetentionVoucherNumber: islrNumber,
            payableId: payable.id,
            entryDate: receptionDate || originalDate || new Date(),
            documentDate: originalDate || receptionDate || new Date(),
            supplierControlNumber: dto.controlFiscal || null,
            supplierInvoiceNumber: dto.documentNumber || number,
            supplierName: supplier.name,
            supplierRif: supplier.rif || '',
            exemptAmountBs: 0,
            taxableBaseBs: 0,
            ivaAmountBs: 0,
            islrRetentionAmountBs: retBs,
            totalBs: -retBs,
            isIslrRetentionLine: true,
            isManual: true,
            createdById: userId,
          },
        });
      }
```

- [ ] **Step 4: Typecheck API**

Run: `pnpm --filter @trinity/api exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payables
git commit -m "feat: Sesion 106 - CxP: retencion no reduce neto + ISLR inline (documento + libro)"
```

---

## Task 3: Servicio de retención IVA acepta CxP

**Files:**
- Modify: `apps/api/src/modules/retention-vouchers/retention-vouchers.service.ts`
- Modify: `apps/api/src/modules/retention-vouchers/dto/create-retention-voucher.dto.ts`
- Modify: `apps/api/src/modules/retention-vouchers/retention-vouchers.controller.ts`

- [ ] **Step 1: DTO de línea — payableId opcional**

En `create-retention-voucher.dto.ts`, en la clase de línea, cambiar `purchaseOrderId` a opcional y agregar `payableId`:

```typescript
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  payableId?: string;
```

- [ ] **Step 2: `getAvailableDocuments` (lista mezclada)**

En `retention-vouchers.service.ts`, agregar un método nuevo (además del `getAvailablePurchaseOrders` existente, que se deja):

```typescript
  /** FCs procesadas + CxP fiscales con IVA, sin retencion IVA activa, del proveedor. */
  async getAvailableDocuments(supplierId: string) {
    const usedLines = await this.prisma.retentionVoucherLine.findMany({
      where: { retentionVoucher: { supplierId, status: { not: 'CANCELLED' } } },
      select: { purchaseOrderId: true, payableId: true },
    });
    const usedPo = usedLines.map((l) => l.purchaseOrderId).filter((x): x is string => !!x);
    const usedPay = usedLines.map((l) => l.payableId).filter((x): x is string => !!x);

    const [orders, payables] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { supplierId, status: 'PROCESSED', totalIvaUsd: { gt: 0 }, ...(usedPo.length ? { id: { notIn: usedPo } } : {}) },
        select: { id: true, number: true, invoiceDate: true, totalIvaUsd: true, totalIvaBs: true, totalUsd: true, totalBs: true, exchangeRate: true, supplierControlNumber: true, supplierInvoiceNumber: true },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.payable.findMany({
        where: { supplierId, totalIvaUsd: { gt: 0 }, serie: { isFiscal: true }, ...(usedPay.length ? { id: { notIn: usedPay } } : {}) },
        select: { id: true, number: true, documentNumber: true, originalDate: true, totalIvaUsd: true, totalIvaBs: true, amountUsd: true, amountBs: true, exchangeRate: true, controlFiscal: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return [
      ...orders.map((o) => ({ docType: 'PURCHASE_ORDER' as const, id: o.id, number: o.number, invoiceDate: o.invoiceDate, ivaUsd: o.totalIvaUsd, ivaBs: o.totalIvaBs, totalUsd: o.totalUsd, totalBs: o.totalBs, exchangeRate: o.exchangeRate, controlNumber: o.supplierControlNumber, invoiceNumber: o.supplierInvoiceNumber })),
      ...payables.map((p) => ({ docType: 'PAYABLE' as const, id: p.id, number: p.documentNumber || p.number, invoiceDate: p.originalDate, ivaUsd: p.totalIvaUsd, ivaBs: p.totalIvaBs, totalUsd: p.amountUsd, totalBs: p.amountBs, exchangeRate: p.exchangeRate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber })),
    ];
  }
```

- [ ] **Step 3: `create` acepta líneas por payableId**

En `retention-vouchers.service.ts`, reemplazar el `create` para resolver cada línea desde FC **o** CxP. Reemplazar el bloque que carga y valida `orders` y arma `lineData` por esta versión que soporta ambos (mantiene las mismas validaciones de proveedor/duplicado, adaptadas):

```typescript
  async create(dto: CreateRetentionVoucherDto, userId: string) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Debe incluir al menos un documento en el comprobante');
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const defaultPct = dto.retentionPct ?? config?.ivaRetentionPct ?? 75;

    // Resolver cada linea a un documento (FC o CxP) con campos comunes
    const resolved = await Promise.all(dto.lines.map(async (l) => {
      if (l.purchaseOrderId) {
        const po = await this.prisma.purchaseOrder.findUnique({ where: { id: l.purchaseOrderId } });
        if (!po) throw new BadRequestException('Factura de compra no encontrada');
        if (po.supplierId !== dto.supplierId) throw new BadRequestException(`La factura ${po.number} no pertenece al proveedor`);
        if (po.status !== 'PROCESSED') throw new BadRequestException(`La factura ${po.number} no esta procesada`);
        return { line: l, kind: 'PO' as const, id: po.id, totalUsd: po.totalUsd, totalBs: po.totalBs, ivaUsd: po.totalIvaUsd, ivaBs: po.totalIvaBs, exchangeRate: po.exchangeRate, invoiceDate: po.invoiceDate, controlNumber: po.supplierControlNumber, invoiceNumber: po.supplierInvoiceNumber };
      }
      if (l.payableId) {
        const p = await this.prisma.payable.findUnique({ where: { id: l.payableId } });
        if (!p) throw new BadRequestException('Cuenta por pagar no encontrada');
        if (p.supplierId !== dto.supplierId) throw new BadRequestException(`La CxP ${p.number} no pertenece al proveedor`);
        return { line: l, kind: 'PAY' as const, id: p.id, totalUsd: p.amountUsd, totalBs: p.amountBs, ivaUsd: p.totalIvaUsd, ivaBs: p.totalIvaBs, exchangeRate: p.exchangeRate, invoiceDate: p.originalDate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber };
      }
      throw new BadRequestException('Cada linea debe referir una factura de compra o una CxP');
    }));

    // No duplicar en comprobante IVA activo
    const poIds = resolved.filter((r) => r.kind === 'PO').map((r) => r.id);
    const payIds = resolved.filter((r) => r.kind === 'PAY').map((r) => r.id);
    const dup = await this.prisma.retentionVoucherLine.findMany({
      where: { retentionVoucher: { status: { not: 'CANCELLED' } }, OR: [{ purchaseOrderId: { in: poIds } }, { payableId: { in: payIds } }] },
      select: { retentionVoucher: { select: { number: true } } },
    });
    if (dup.length > 0) throw new BadRequestException(`Algunos documentos ya tienen retencion IVA activa: ${dup.map((d) => d.retentionVoucher.number).join(', ')}`);

    return this.prisma.$transaction(async (tx) => {
      const { number, nextSeq } = await this.generateNumber(tx);
      let totalRetUsd = 0, totalRetBs = 0, headerExchangeRate = 0;
      const lineData: any[] = [];
      for (const rdoc of resolved) {
        const linePct = rdoc.line.retentionPct ?? defaultPct;
        const isManual = rdoc.line.isManual ?? false;
        let retUsd: number, retBs: number;
        if (isManual && rdoc.line.retentionAmountUsd != null) {
          retUsd = round2(rdoc.line.retentionAmountUsd);
          retBs = rdoc.line.retentionAmountBs != null ? round2(rdoc.line.retentionAmountBs) : round2(retUsd * rdoc.exchangeRate);
        } else {
          retUsd = round2(rdoc.ivaUsd * (linePct / 100));
          retBs = round2(rdoc.ivaBs * (linePct / 100));
        }
        totalRetUsd += retUsd; totalRetBs += retBs;
        if (!headerExchangeRate) headerExchangeRate = rdoc.exchangeRate;
        lineData.push({
          purchaseOrderId: rdoc.kind === 'PO' ? rdoc.id : null,
          payableId: rdoc.kind === 'PAY' ? rdoc.id : null,
          supplierInvoiceNumber: rdoc.invoiceNumber,
          supplierControlNumber: rdoc.controlNumber,
          invoiceDate: rdoc.invoiceDate,
          invoiceTotalUsd: rdoc.totalUsd,
          invoiceTotalBs: rdoc.totalBs,
          taxableBaseUsd: round2(rdoc.totalUsd - rdoc.ivaUsd),
          taxableBaseBs: round2(rdoc.totalBs - rdoc.ivaBs),
          ivaAmountUsd: rdoc.ivaUsd,
          ivaAmountBs: rdoc.ivaBs,
          retentionPct: linePct,
          retentionAmountUsd: retUsd,
          retentionAmountBs: retBs,
          exchangeRate: rdoc.exchangeRate,
          isManual,
        });
      }
      const voucher = await tx.retentionVoucher.create({
        data: { number, supplierId: dto.supplierId, serieId: dto.serieId || null, status: 'PENDING', retentionPct: defaultPct, retentionAmountUsd: round2(totalRetUsd), retentionAmountBs: round2(totalRetBs), exchangeRate: headerExchangeRate, notes: dto.notes || null, createdById: userId, lines: { create: lineData } },
        include: this.includeDetail,
      });
      await tx.companyConfig.update({ where: { id: 'singleton' }, data: { retentionNextNumber: nextSeq } });
      return voucher;
    });
  }
```

- [ ] **Step 4: `issue` — línea de libro con la FK correcta**

En `issue`, dentro del `for (const line of updated.lines)`, cambiar el `purchaseBookEntry.create` para que use la FK que corresponda:

```typescript
        await tx.purchaseBookEntry.create({
          data: {
            purchaseOrderId: line.purchaseOrderId || null,
            payableId: line.payableId || null,
            entryDate: issueDateObj,
            supplierControlNumber: line.supplierControlNumber || null,
            supplierInvoiceNumber: line.supplierInvoiceNumber || null,
            supplierName: updated.supplier.name,
            supplierRif: updated.supplier.rif || 'S/R',
            retentionVoucherNumber: updated.number,
            retentionAmountBs: line.retentionAmountBs,
            totalBs: round2(-line.retentionAmountBs),
            isRetentionLine: true,
            retentionVoucherId: updated.id,
            isManual: false,
            createdById: userId,
          },
        });
```

- [ ] **Step 5: `includeDetail` — incluir payable en las líneas**

En el `includeDetail`, dentro de `lines.include`, agregar junto a `purchaseOrder`:

```typescript
        payable: { select: { id: true, number: true, documentNumber: true, originalDate: true, totalIvaUsd: true, totalIvaBs: true, amountUsd: true, amountBs: true, exchangeRate: true, controlFiscal: true } },
```

- [ ] **Step 6: Controller — endpoint de documentos**

En `retention-vouchers.controller.ts`, agregar (junto al de `available-orders`):

```typescript
  @Get('available-documents/:supplierId')
  availableDocuments(@Param('supplierId') supplierId: string) {
    return this.service.getAvailableDocuments(supplierId);
  }
```

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @trinity/api exec tsc --noEmit` → 0 errores.
```bash
git add apps/api/src/modules/retention-vouchers
git commit -m "feat: Sesion 106 - retencion IVA acepta CxP (lista mezclada + create/issue por payable)"
```

---

## Task 4: Servicio de retención ISLR acepta CxP

**Files:**
- Modify: `apps/api/src/modules/islr-retention-vouchers/islr-retention-vouchers.service.ts`
- Modify: `apps/api/src/modules/islr-retention-vouchers/dto/create-islr-retention-voucher.dto.ts`
- Modify: `apps/api/src/modules/islr-retention-vouchers/islr-retention-vouchers.controller.ts`

- [ ] **Step 1: DTO de línea — payableId, purchaseOrderId opcional**

En `create-islr-retention-voucher.dto.ts`, cambiar la clase de línea:

```typescript
export class CreateIslrRetentionVoucherLineDto {
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  payableId?: string;

  @IsString()
  islrRetentionTypeId: string;

  @IsOptional()
  @IsBoolean()
  isManual?: boolean;

  @IsOptional()
  @IsNumber()
  retentionAmountUsd?: number;

  @IsOptional()
  @IsNumber()
  retentionAmountBs?: number;
}
```

- [ ] **Step 2: `getAvailableDocuments` (mezclada, base sin IVA)**

En `islr-retention-vouchers.service.ts`, agregar (además del `getAvailablePurchaseOrders` existente):

```typescript
  async getAvailableDocuments(supplierId: string) {
    const usedLines = await this.prisma.islrRetentionVoucherLine.findMany({
      where: { islrRetentionVoucher: { supplierId, status: { not: 'CANCELLED' } } },
      select: { purchaseOrderId: true, payableId: true },
    });
    const usedPo = usedLines.map((l) => l.purchaseOrderId).filter((x): x is string => !!x);
    const usedPay = usedLines.map((l) => l.payableId).filter((x): x is string => !!x);

    const [orders, payables, supplier] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { supplierId, status: 'PROCESSED', subtotalUsd: { gt: 0 }, ...(usedPo.length ? { id: { notIn: usedPo } } : {}) },
        select: { id: true, number: true, invoiceDate: true, subtotalUsd: true, subtotalBs: true, totalUsd: true, totalBs: true, exchangeRate: true, supplierControlNumber: true, supplierInvoiceNumber: true },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.payable.findMany({
        where: { supplierId, serie: { isFiscal: true }, ...(usedPay.length ? { id: { notIn: usedPay } } : {}) },
        select: { id: true, number: true, documentNumber: true, originalDate: true, exemptBaseUsd: true, exemptBaseBs: true, taxableBase8Usd: true, taxableBase8Bs: true, taxableBase16Usd: true, taxableBase16Bs: true, taxableBase31Usd: true, taxableBase31Bs: true, amountUsd: true, amountBs: true, exchangeRate: true, controlFiscal: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { islrConceptId: true } }),
    ]);

    const docs = [
      ...orders.map((o) => ({ docType: 'PURCHASE_ORDER' as const, id: o.id, number: o.number, invoiceDate: o.invoiceDate, baseUsd: o.subtotalUsd, baseBs: o.subtotalBs, totalUsd: o.totalUsd, totalBs: o.totalBs, exchangeRate: o.exchangeRate, controlNumber: o.supplierControlNumber, invoiceNumber: o.supplierInvoiceNumber })),
      ...payables.map((p) => {
        const baseUsd = round2(p.exemptBaseUsd + p.taxableBase8Usd + p.taxableBase16Usd + p.taxableBase31Usd);
        const baseBs = round2(p.exemptBaseBs + p.taxableBase8Bs + p.taxableBase16Bs + p.taxableBase31Bs);
        return { docType: 'PAYABLE' as const, id: p.id, number: p.documentNumber || p.number, invoiceDate: p.originalDate, baseUsd, baseBs, totalUsd: p.amountUsd, totalBs: p.amountBs, exchangeRate: p.exchangeRate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber };
      }).filter((p) => p.baseUsd > 0),
    ];
    return { documents: docs, defaultConceptId: supplier?.islrConceptId || null };
  }
```

- [ ] **Step 3: `create` resuelve FC o CxP**

En `islr-retention-vouchers.service.ts`, reemplazar la carga/validación de `orders` y el armado de `lineData` en `create` por una versión que resuelve cada línea a un documento (espejo de Task 3, pero con base sin IVA y concepto por línea). Base FC = `subtotalUsd/Bs`; base CxP = `exemptBase + taxableBase8+16+31` (Usd/Bs). Resolver:

```typescript
    const resolved = await Promise.all(dto.lines.map(async (l) => {
      if (l.purchaseOrderId) {
        const po = await this.prisma.purchaseOrder.findUnique({ where: { id: l.purchaseOrderId } });
        if (!po) throw new BadRequestException('Factura de compra no encontrada');
        if (po.supplierId !== dto.supplierId) throw new BadRequestException(`La factura ${po.number} no pertenece al proveedor`);
        if (po.status !== 'PROCESSED') throw new BadRequestException(`La factura ${po.number} no esta procesada`);
        return { line: l, kind: 'PO' as const, id: po.id, baseUsd: po.subtotalUsd, baseBs: po.subtotalBs, totalUsd: po.totalUsd, totalBs: po.totalBs, exchangeRate: po.exchangeRate, invoiceDate: po.invoiceDate, controlNumber: po.supplierControlNumber, invoiceNumber: po.supplierInvoiceNumber };
      }
      if (l.payableId) {
        const p = await this.prisma.payable.findUnique({ where: { id: l.payableId } });
        if (!p) throw new BadRequestException('Cuenta por pagar no encontrada');
        if (p.supplierId !== dto.supplierId) throw new BadRequestException(`La CxP ${p.number} no pertenece al proveedor`);
        const baseUsd = round2(p.exemptBaseUsd + p.taxableBase8Usd + p.taxableBase16Usd + p.taxableBase31Usd);
        const baseBs = round2(p.exemptBaseBs + p.taxableBase8Bs + p.taxableBase16Bs + p.taxableBase31Bs);
        return { line: l, kind: 'PAY' as const, id: p.id, baseUsd, baseBs, totalUsd: p.amountUsd, totalBs: p.amountBs, exchangeRate: p.exchangeRate, invoiceDate: p.originalDate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber };
      }
      throw new BadRequestException('Cada linea debe referir una factura de compra o una CxP');
    }));
```

Luego, en el `for` que arma `lineData`, usar `rdoc.baseUsd/baseBs` como `taxableBase`, aplicar la fórmula ISLR ya existente (concepto `baseImponiblePct`/`retentionPct`/`sustraendoUt`; sustraendo solo si `supplier.supplierType === 'NATURAL_RESIDENTE'`), y setear en cada línea `purchaseOrderId: rdoc.kind==='PO' ? rdoc.id : null` y `payableId: rdoc.kind==='PAY' ? rdoc.id : null`. La validación de duplicado usa `OR: [{ purchaseOrderId: { in: poIds } }, { payableId: { in: payIds } }]` sobre `islrRetentionVoucherLine` con `islrRetentionVoucher.status != 'CANCELLED'`.

- [ ] **Step 4: `issue` — línea de libro con la FK correcta**

En `issue`, en el `purchaseBookEntry.create` por línea, agregar `payableId: line.payableId || null` junto a `purchaseOrderId: line.purchaseOrderId` (que pasa a `line.purchaseOrderId || null`).

- [ ] **Step 5: `includeDetail` — incluir payable en las líneas**

En el `includeDetail.lines.include`, agregar junto a `purchaseOrder`:

```typescript
        payable: { select: { id: true, number: true, documentNumber: true, originalDate: true, amountUsd: true, amountBs: true, exchangeRate: true, controlFiscal: true } },
```

- [ ] **Step 6: Controller — endpoint de documentos**

En `islr-retention-vouchers.controller.ts`, agregar:

```typescript
  @Get('available-documents/:supplierId')
  availableDocuments(@Param('supplierId') supplierId: string) {
    return this.service.getAvailableDocuments(supplierId);
  }
```

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @trinity/api exec tsc --noEmit` → 0 errores.
```bash
git add apps/api/src/modules/islr-retention-vouchers
git commit -m "feat: Sesion 106 - retencion ISLR acepta CxP (lista mezclada + create/issue por payable)"
```

---

## Task 5: Recibo de pago — seleccionar comprobantes de retención

**Files:**
- Modify: `apps/api/src/modules/receipts/dto/create-receipt.dto.ts`
- Modify: `apps/api/src/modules/receipts/receipts.service.ts`

- [ ] **Step 1: DTO de ítem — nuevas FKs**

En `create-receipt.dto.ts`, en `ReceiptItemDto`, agregar junto a `customerIvaRetentionId`:

```typescript
  @IsOptional()
  @IsString()
  retentionVoucherId?: string;

  @IsOptional()
  @IsString()
  islrRetentionVoucherId?: string;
```

- [ ] **Step 2: `create` — unión de tipos + ramas nuevas**

En `receipts.service.ts`, en la definición del array `items`, ampliar el union de `itemType` a:

```typescript
      itemType: 'RECEIVABLE' | 'PAYABLE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'IVA_RETENTION' | 'SALES_IVA_RETENTION' | 'PURCHASE_IVA_RETENTION' | 'PURCHASE_ISLR_RETENTION';
```

y agregar los campos opcionales `retentionVoucherId?: string;` e `islrRetentionVoucherId?: string;` a ese tipo inline.

En el `for (const item of dto.itemIds)`, **antes** del `else if (item.customerIvaRetentionId)`, agregar:

```typescript
      } else if (item.retentionVoucherId) {
        const v = await this.prisma.retentionVoucher.findUnique({ where: { id: item.retentionVoucherId } });
        if (!v) throw new BadRequestException(`Retencion IVA ${item.retentionVoucherId} no encontrada`);
        if (v.status !== 'ISSUED') throw new BadRequestException(`La retencion IVA ${v.number} no esta emitida`);
        if (v.appliedAt) throw new BadRequestException(`La retencion IVA ${v.number} ya fue aplicada`);
        items.push({
          itemType: 'PURCHASE_IVA_RETENTION',
          retentionVoucherId: item.retentionVoucherId,
          description: `Ret. IVA ${v.number}`,
          amountUsd: v.retentionAmountUsd,
          amountBsHistoric: v.retentionAmountBs,
          amountBsToday: this.round2(v.retentionAmountUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.islrRetentionVoucherId) {
        const v = await this.prisma.islrRetentionVoucher.findUnique({ where: { id: item.islrRetentionVoucherId } });
        if (!v) throw new BadRequestException(`Retencion ISLR ${item.islrRetentionVoucherId} no encontrada`);
        if (v.status !== 'ISSUED') throw new BadRequestException(`La retencion ISLR ${v.number} no esta emitida`);
        if (v.appliedAt) throw new BadRequestException(`La retencion ISLR ${v.number} ya fue aplicada`);
        items.push({
          itemType: 'PURCHASE_ISLR_RETENTION',
          islrRetentionVoucherId: item.islrRetentionVoucherId,
          description: `Ret. ISLR ${v.number}`,
          amountUsd: v.retentionAmountUsd,
          amountBsHistoric: v.retentionAmountBs,
          amountBsToday: this.round2(v.retentionAmountUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
```

- [ ] **Step 3: Persistir las nuevas FKs**

En el `tx.receipt.create` → `items.create.map`, agregar junto a `customerIvaRetentionId`:

```typescript
              retentionVoucherId: item.retentionVoucherId || null,
              islrRetentionVoucherId: item.islrRetentionVoucherId || null,
```

- [ ] **Step 4: `post` — marcar aplicados**

En `post`, en el `for (const item of receipt.items)`, **antes** de la rama `SALES_IVA_RETENTION`, agregar:

```typescript
        } else if (item.itemType === 'PURCHASE_IVA_RETENTION' && item.retentionVoucherId) {
          await tx.retentionVoucher.update({ where: { id: item.retentionVoucherId }, data: { appliedAt: new Date() } });
        } else if (item.itemType === 'PURCHASE_ISLR_RETENTION' && item.islrRetentionVoucherId) {
          await tx.islrRetentionVoucher.update({ where: { id: item.islrRetentionVoucherId }, data: { appliedAt: new Date() } });
```

- [ ] **Step 5: `cancel` — revertir aplicados**

Leer el método `cancel` de `receipts.service.ts`. Donde revierte `appliedAt` de notas / `ivaRetention` / `customerIvaRetention`, agregar la reversa para los dos nuevos tipos:

```typescript
        } else if (item.itemType === 'PURCHASE_IVA_RETENTION' && item.retentionVoucherId) {
          await tx.retentionVoucher.update({ where: { id: item.retentionVoucherId }, data: { appliedAt: null } });
        } else if (item.itemType === 'PURCHASE_ISLR_RETENTION' && item.islrRetentionVoucherId) {
          await tx.islrRetentionVoucher.update({ where: { id: item.islrRetentionVoucherId }, data: { appliedAt: null } });
```

(Si `cancel` no itera por ítems, agregar un loop equivalente sobre `receipt.items` dentro de su transacción.)

- [ ] **Step 6: `getPendingDocuments` (rama PAYMENT) — traer los comprobantes**

En `receipts.service.ts`, en la rama de pago de `getPendingDocuments`, **reemplazar** el bloque que consulta el modelo muerto `ivaRetention` (`const ivaRetentions = await this.prisma.ivaRetention.findMany(...)` y su `retentionDocs`) por:

```typescript
      const [ivaVouchers, islrVouchers] = await Promise.all([
        this.prisma.retentionVoucher.findMany({
          where: { supplierId: query.entityId, status: 'ISSUED', appliedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.islrRetentionVoucher.findMany({
          where: { supplierId: query.entityId, status: 'ISSUED', appliedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      const retentionDocs = [
        ...ivaVouchers.map((v) => ({ id: v.id, documentType: 'PURCHASE_IVA_RETENTION', retentionVoucherId: v.id, description: `Ret. IVA ${v.number}`, date: v.createdAt, amountUsd: v.retentionAmountUsd, amountBsHistoric: v.retentionAmountBs, exchangeRate: v.exchangeRate, balanceUsd: v.retentionAmountUsd, status: 'POSTED', sign: -1 })),
        ...islrVouchers.map((v) => ({ id: v.id, documentType: 'PURCHASE_ISLR_RETENTION', islrRetentionVoucherId: v.id, description: `Ret. ISLR ${v.number}`, date: v.createdAt, amountUsd: v.retentionAmountUsd, amountBsHistoric: v.retentionAmountBs, exchangeRate: v.exchangeRate, balanceUsd: v.retentionAmountUsd, status: 'POSTED', sign: -1 })),
      ];
      return [...payableDocs, ...noteDocs, ...retentionDocs];
```

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @trinity/api exec tsc --noEmit` → 0 errores.
```bash
git add apps/api/src/modules/receipts
git commit -m "feat: Sesion 106 - recibo de pago netea comprobantes de retencion IVA/ISLR"
```

---

## Task 6: Verificación backend + PROGRESS

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Verificar libro de compras con líneas ISLR por payable**

Confirmar en `apps/api/src/modules/purchase-book/purchase-book.service.ts` que las líneas con `isIslrRetentionLine` / `payableId` se listan igual que las de factura de compra (no filtra solo por `purchaseOrderId`). Si filtra, ajustarlo para incluir entradas por `payableId`. Run: `pnpm --filter @trinity/api exec tsc --noEmit` → 0.

- [ ] **Step 2: Prueba funcional por API (con el entorno local arriba)**

1. Crear CxP fiscal con `createRetention: true` + `createIslrRetention: true` + `islrRetentionTypeId`. Verificar: aparecen un `RetentionVoucher` y un `IslrRetentionVoucher` (GET `/retention-vouchers` y `/islr-retention-vouchers`); la CxP tiene `netPayableUsd == amountUsd` (sin descuento); hay 3 `PurchaseBookEntry` (factura + ret IVA − + ret ISLR −).
2. GET `/receipts/pending-documents?type=PAYMENT&entityId={supplierId}` → devuelve la CxP (+) y los 2 comprobantes (sign −1).
3. POST `/receipts` (PAYMENT) con la CxP y los 2 comprobantes → total = CxP − IVA − ISLR. POST `/receipts/:id/post` → los comprobantes quedan `appliedAt`; `/receipts/:id/cancel` → se liberan.

- [ ] **Step 3: PROGRESS.md**

Agregar entrada "## Sesion 106 — Retenciones (IVA+ISLR) sobre CxP: backend" resumiendo: comprobantes como documentos, CxP a monto completo, ISLR sobre CxP (inline + pantalla), recibo netea con sign, migración que marca aplicados los comprobantes viejos. Marcar **Backend listo / Frontend (Plan 2) pendiente / PENDIENTE DEPLOY**.

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: Sesion 106 - backend retenciones sobre CxP"
```

---

## Checklist de cobertura del spec (backend)

- `ReceiptItem` + enum + `RetentionVoucher/IslrRetentionVoucher.appliedAt` + `IslrRetentionVoucherLine.payableId` + `Payable` relación → Task 1.
- Migración anti doble-descuento (marca aplicados los viejos) → Task 1 Step 7.
- CxP deja de reducir neto + ISLR inline → Task 2.
- Pantalla IVA acepta CxP (lista mezclada, create/issue/available) → Task 3.
- Pantalla ISLR acepta CxP → Task 4.
- Recibo netea comprobantes (create/post/cancel/pending-documents) → Task 5.
- Libro de compras + prueba funcional + docs → Task 6.
- **Frontend** (formulario CxP, pantallas, recibo, detalles) → **Plan 2** (aparte).
