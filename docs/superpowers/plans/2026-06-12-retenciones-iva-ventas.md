# Retenciones de IVA en Ventas (retenciones sufridas de clientes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar las retenciones de IVA que los clientes (contribuyentes especiales) aplican a las facturas de venta de Trinity: como documento con saldo negativo cruzable en recibos de cobro, con tracking del comprobante físico, línea en el libro de ventas, alerta de comprobantes pendientes y soporte de reintegro (salida de caja) cuando la factura ya se cobró completa.

**Architecture:** Espejo del patrón ya existente en compras (`IvaRetention` se cruza con signo −1 en recibos de pago). Se crea el modelo `CustomerIvaRetention` vinculado a `Invoice`/`Customer`, se integra al flujo de recibos de cobro (`getPendingDocuments` / `create` / `post`), se auto-genera al facturar a crédito a clientes marcados `isSpecialTaxpayer` (toggle en POS), y al registrar el comprobante del cliente se crea el `SalesBookEntry` con `isRetentionLine=true` que el libro de ventas ya sabe mostrar. El reintegro (caso "cliente desconocido que pagó completo") es un recibo de cobro con total negativo que genera un `CashMovement` tipo EXPENSE en la sesión de caja.

**Tech Stack:** NestJS + Prisma (PostgreSQL) en `apps/api`, Next.js App Router + Tailwind en `apps/web`, monorepo pnpm.

**Reglas de negocio clave:**
- La retención solo aplica si la factura tiene **serie fiscal** (`serie.isFiscal`) y **IVA > 0**.
- % por defecto: `CompanyConfig.ivaRetentionPct` (ya existe, default 75). Puede ser 100 en casos especiales.
- El monto es ajustable con **tolerancia ±1 Bs** respecto al cálculo teórico (la máquina fiscal redondea distinto).
- La suma de retenciones activas de una factura no puede exceder su IVA en Bs (+ tolerancia).
- El comprobante del cliente tiene **14 dígitos** (`AAAAMM` + 8 dígitos).
- La línea del libro de ventas se crea **solo cuando se registra el comprobante** (con su número en `notes`, que es lo que lee la columna "Comp. de Retención" del libro unificado).
- El cliente por defecto de la factura (`Customer.isDefault`) **nunca** puede marcarse contribuyente especial.

**Nota sobre tests:** el repo no tiene infraestructura de tests (no hay `*.spec.ts` ni runner configurado). Cada task cierra con verificación por build (`pnpm -C apps/api build` / `pnpm -C apps/web build`) y verificación funcional manual (curl / UI / Prisma Studio), siguiendo la práctica del proyecto.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `packages/database/prisma/schema.prisma` | Modify | Campo en Customer, modelo `CustomerIvaRetention`, enum + FK en ReceiptItem |
| `packages/database/prisma/migrations/20260612000000_add_customer_iva_retentions/migration.sql` | Create | Migración idempotente (IF NOT EXISTS) |
| `deploy/fix-schema.sql` | Modify | Red de seguridad del deploy |
| `apps/api/src/modules/customers/dto/create-customer.dto.ts` | Modify | `isSpecialTaxpayer` |
| `apps/api/src/modules/customer-iva-retentions/` (module, controller, service, dto/) | Create | CRUD de retenciones de clientes, registro de comprobante, anulación, pending-count |
| `apps/api/src/app.module.ts` | Modify | Registrar módulo nuevo |
| `apps/api/src/modules/invoices/invoices.service.ts` | Modify | Auto-crear retención al pagar factura a crédito de cliente especial |
| `apps/api/src/modules/receipts/dto/create-receipt.dto.ts` | Modify | `customerIvaRetentionId` en items |
| `apps/api/src/modules/receipts/receipts.service.ts` | Modify | Pending docs, create, post (appliedAt + CashMovement de reintegro) |
| `apps/api/src/modules/sales-book/sales-book.service.ts` | Modify | Excluir líneas de retención de los totales de IVA |
| `apps/web/src/app/(dashboard)/sales/pos/page.tsx` | Modify | Toggle "Contribuyente especial" |
| `apps/web/src/app/(dashboard)/receipts/new/page.tsx` | Modify | Retenciones en recibo de cobro + UI de reintegro |
| `apps/web/src/app/(dashboard)/sales/customer-retentions/page.tsx` | Create | Página de gestión + alerta de comprobantes pendientes |
| `apps/web/src/components/sidebar.tsx` | Modify | Item de menú en VENTAS |

---

### Task 1: Schema Prisma + migración

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (Customer :723, User, Invoice :904, ReceiptItemType :196, ReceiptItem :1191, SalesBookEntry :1510, sección nueva tras :1584)
- Create: `packages/database/prisma/migrations/20260612000000_add_customer_iva_retentions/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Agregar campo a Customer**

En el modelo `Customer` (schema.prisma:723), después de `isActive`:

```prisma
  isSpecialTaxpayer Boolean @default(false)
```

Y en la lista de relaciones del mismo modelo (después de `inventoryAdjustments`):

```prisma
  ivaRetentions         CustomerIvaRetention[]
```

- [ ] **Step 2: Agregar relaciones a Invoice, User y SalesBookEntry**

En `Invoice` (después de `salesBookEntries    SalesBookEntry[]`):

```prisma
  customerIvaRetentions CustomerIvaRetention[]
```

En `User` (buscar las relaciones nombradas tipo `@relation("RetentionVoucherCreator")` para ubicar la sección):

```prisma
  customerIvaRetentions CustomerIvaRetention[] @relation("CustomerIvaRetentionCreator")
```

En `SalesBookEntry` (después de `isRetentionLine`):

```prisma
  customerIvaRetention CustomerIvaRetention?
```

- [ ] **Step 3: Nuevo valor de enum y FK en ReceiptItem**

En `enum ReceiptItemType` (schema.prisma:196) agregar al final:

```prisma
  SALES_IVA_RETENTION
```

En `ReceiptItem` (después de `ivaRetention      IvaRetention?    @relation(...)`):

```prisma
  customerIvaRetentionId String?
  customerIvaRetention   CustomerIvaRetention? @relation(fields: [customerIvaRetentionId], references: [id])
```

- [ ] **Step 4: Nuevo modelo CustomerIvaRetention**

Agregar después del modelo `RetentionVoucherLine` (schema.prisma:1584):

```prisma
// ============================================
// RETENCIONES DE IVA SUFRIDAS (clientes contribuyentes especiales)
// ============================================

model CustomerIvaRetention {
  id                String          @id @default(cuid())
  number            String          @unique
  invoiceId         String
  invoice           Invoice         @relation(fields: [invoiceId], references: [id])
  customerId        String
  customer          Customer        @relation(fields: [customerId], references: [id])
  taxableBaseUsd    Float           @default(0)
  taxableBaseBs     Float           @default(0)
  ivaAmountUsd      Float           @default(0)
  ivaAmountBs       Float           @default(0)
  retentionPct      Float           @default(75)
  retentionUsd      Float           @default(0)
  retentionBs       Float           @default(0)
  exchangeRate      Float           @default(0)
  voucherNumber     String?
  voucherDate       DateTime?
  voucherReceivedAt DateTime?
  appliedAt         DateTime?
  cancelledAt       DateTime?
  notes             String?
  salesBookEntryId  String?         @unique
  salesBookEntry    SalesBookEntry? @relation(fields: [salesBookEntryId], references: [id])
  receiptItems      ReceiptItem[]
  createdById       String
  createdBy         User            @relation("CustomerIvaRetentionCreator", fields: [createdById], references: [id])
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}
```

- [ ] **Step 5: Escribir la migración idempotente**

Create `packages/database/prisma/migrations/20260612000000_add_customer_iva_retentions/migration.sql`:

```sql
-- Customer: flag de contribuyente especial
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isSpecialTaxpayer" BOOLEAN NOT NULL DEFAULT false;

-- ReceiptItemType: nuevo valor (PG 12+ permite ADD VALUE en transacción si no se usa en la misma)
ALTER TYPE "ReceiptItemType" ADD VALUE IF NOT EXISTS 'SALES_IVA_RETENTION';

-- Tabla de retenciones sufridas
CREATE TABLE IF NOT EXISTS "CustomerIvaRetention" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "taxableBaseUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 75,
    "retentionUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voucherNumber" TEXT,
    "voucherDate" TIMESTAMP(3),
    "voucherReceivedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "salesBookEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerIvaRetention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIvaRetention_number_key" ON "CustomerIvaRetention"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerIvaRetention_salesBookEntryId_key" ON "CustomerIvaRetention"("salesBookEntryId");

-- FK en ReceiptItem
ALTER TABLE "ReceiptItem" ADD COLUMN IF NOT EXISTS "customerIvaRetentionId" TEXT;

-- FKs (DO block para idempotencia)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_invoiceId_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_customerId_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_salesBookEntryId_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_salesBookEntryId_fkey"
      FOREIGN KEY ("salesBookEntryId") REFERENCES "SalesBookEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerIvaRetention_createdById_fkey') THEN
    ALTER TABLE "CustomerIvaRetention" ADD CONSTRAINT "CustomerIvaRetention_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReceiptItem_customerIvaRetentionId_fkey') THEN
    ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_customerIvaRetentionId_fkey"
      FOREIGN KEY ("customerIvaRetentionId") REFERENCES "CustomerIvaRetention"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
```

- [ ] **Step 6: Replicar en la red de seguridad del deploy**

Agregar al final de `deploy/fix-schema.sql` el mismo SQL del Step 5 (completo, con los mismos IF NOT EXISTS — es idempotente por diseño).

- [ ] **Step 7: Aplicar y generar cliente**

Run: `pnpm -C packages/database exec prisma migrate dev` (o el comando de migración que use el proyecto localmente; si falla por drift, `prisma migrate deploy` + aplicar `deploy/fix-schema.sql` según la memoria del proyecto)
Luego: `pnpm -C packages/database exec prisma generate`
Expected: migración aplicada sin errores, cliente regenerado con `customerIvaRetention` disponible.

- [ ] **Step 8: Verificar build del API**

Run: `pnpm -C apps/api build`
Expected: compila sin errores.

- [ ] **Step 9: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260612000000_add_customer_iva_retentions/migration.sql deploy/fix-schema.sql
git commit -m "feat: schema de retenciones de IVA sufridas (CustomerIvaRetention) y flag contribuyente especial"
```

---

### Task 2: Backend de clientes — exponer `isSpecialTaxpayer`

**Files:**
- Modify: `apps/api/src/modules/customers/dto/create-customer.dto.ts`

El service (`customers.service.ts:166,173`) pasa el DTO directo a Prisma (`data: dto`), y `UpdateCustomerDto` extiende el create con PartialType, así que solo hace falta el campo en el DTO. `findAll` devuelve el registro completo (sin `select`), por lo que el POS lo recibirá automáticamente.

- [ ] **Step 1: Agregar campo al DTO**

En `create-customer.dto.ts`, agregar import `IsBoolean` a la línea 1 y al final de la clase:

```typescript
  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isSpecialTaxpayer?: boolean;
```

- [ ] **Step 2: Verificar que UpdateCustomerDto hereda el campo**

Leer `apps/api/src/modules/customers/dto/update-customer.dto.ts`. Si usa `PartialType(CreateCustomerDto)` no hay nada que hacer; si declara campos manualmente, agregar el mismo campo opcional.

- [ ] **Step 3: Build + verificación manual**

Run: `pnpm -C apps/api build` → compila.
Con el API corriendo: `PATCH /customers/:id` con body `{"isSpecialTaxpayer": true}` → responde el cliente con el campo en `true`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/customers/dto/create-customer.dto.ts apps/api/src/modules/customers/dto/update-customer.dto.ts
git commit -m "feat: campo isSpecialTaxpayer en DTO de clientes"
```

---

### Task 3: Módulo backend `customer-iva-retentions`

**Files:**
- Create: `apps/api/src/modules/customer-iva-retentions/customer-iva-retentions.module.ts`
- Create: `apps/api/src/modules/customer-iva-retentions/customer-iva-retentions.controller.ts`
- Create: `apps/api/src/modules/customer-iva-retentions/customer-iva-retentions.service.ts`
- Create: `apps/api/src/modules/customer-iva-retentions/dto/create-customer-iva-retention.dto.ts`
- Create: `apps/api/src/modules/customer-iva-retentions/dto/register-voucher.dto.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: DTOs**

`dto/create-customer-iva-retention.dto.ts`:

```typescript
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateCustomerIvaRetentionDto {
  @IsString()
  invoiceId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  retentionPct?: number;

  // Monto en Bs ajustado (tolerancia ±1 Bs vs cálculo teórico)
  @IsOptional()
  @IsNumber()
  @Min(0)
  retentionBs?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // Datos del comprobante (caso reintegro: se registra todo de una vez)
  @IsOptional()
  @IsString()
  voucherNumber?: string;

  @IsOptional()
  @IsString()
  voucherDate?: string;
}
```

`dto/register-voucher.dto.ts`:

```typescript
import { IsString, IsOptional, IsNumber, Min, Matches } from 'class-validator';

export class RegisterVoucherDto {
  @IsString()
  @Matches(/^\d{14}$/, { message: 'El número de comprobante debe tener 14 dígitos (AAAAMM + 8 dígitos)' })
  voucherNumber: string;

  @IsString()
  voucherDate: string;

  // Permite ajustar el monto al del comprobante físico (tolerancia ±1 Bs)
  @IsOptional()
  @IsNumber()
  @Min(0)
  retentionBs?: number;
}
```

- [ ] **Step 2: Service**

`customer-iva-retentions.service.ts`:

```typescript
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerIvaRetentionDto } from './dto/create-customer-iva-retention.dto';
import { RegisterVoucherDto } from './dto/register-voucher.dto';

const TOLERANCE_BS = 1; // margen por redondeos de la máquina fiscal

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class CustomerIvaRetentionsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateNumber(tx: any): Promise<string> {
    const last = await tx.customerIvaRetention.findFirst({
      where: { number: { startsWith: 'RVC-' } },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let next = 1;
    if (last) {
      const n = parseInt(last.number.split('-')[1], 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `RVC-${String(next).padStart(4, '0')}`;
  }

  async create(dto: CreateCustomerIvaRetentionDto, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: {
        serie: { select: { isFiscal: true, isVatExempt: true } },
        customer: true,
        items: true,
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (!invoice.serie?.isFiscal || invoice.serie?.isVatExempt) {
      throw new BadRequestException('La factura no es de serie fiscal — no aplica retención de IVA');
    }
    if ((invoice.ivaBs || 0) <= 0) {
      throw new BadRequestException('La factura no tiene IVA — no aplica retención');
    }
    if (!invoice.customerId) {
      throw new BadRequestException('La factura no tiene cliente asignado');
    }

    // Suma de retenciones activas existentes sobre esta factura
    const existing = await this.prisma.customerIvaRetention.aggregate({
      where: { invoiceId: invoice.id, cancelledAt: null },
      _sum: { retentionBs: true },
    });
    const alreadyRetainedBs = existing._sum.retentionBs || 0;

    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const pct = dto.retentionPct || config?.ivaRetentionPct || 75;
    const calculatedBs = round2(invoice.ivaBs * (pct / 100));
    const retentionBs = dto.retentionBs !== undefined ? round2(dto.retentionBs) : calculatedBs;

    if (Math.abs(retentionBs - calculatedBs) > TOLERANCE_BS) {
      throw new BadRequestException(
        `El monto (Bs ${retentionBs.toFixed(2)}) se desvía más de ${TOLERANCE_BS} Bs del cálculo teórico (Bs ${calculatedBs.toFixed(2)} = ${pct}% del IVA)`,
      );
    }
    if (alreadyRetainedBs + retentionBs > invoice.ivaBs + TOLERANCE_BS) {
      throw new BadRequestException(
        `La factura ya tiene Bs ${alreadyRetainedBs.toFixed(2)} retenidos; con este monto se excede el IVA de la factura (Bs ${invoice.ivaBs.toFixed(2)})`,
      );
    }

    const rate = invoice.exchangeRate || 0;
    const retentionUsd = rate > 0 ? round2(retentionBs / rate) : 0;

    // Base imponible = items no exentos
    let taxableBaseUsd = 0;
    for (const item of invoice.items) {
      if (item.ivaType !== 'EXEMPT') taxableBaseUsd += item.unitPrice * item.quantity;
    }
    taxableBaseUsd = round2(taxableBaseUsd);
    const taxableBaseBs = round2(taxableBaseUsd * rate);

    if (dto.voucherNumber && !/^\d{14}$/.test(dto.voucherNumber)) {
      throw new BadRequestException('El número de comprobante debe tener 14 dígitos');
    }

    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      const retention = await tx.customerIvaRetention.create({
        data: {
          number,
          invoiceId: invoice.id,
          customerId: invoice.customerId!,
          taxableBaseUsd,
          taxableBaseBs,
          ivaAmountUsd: invoice.ivaUsd || 0,
          ivaAmountBs: invoice.ivaBs || 0,
          retentionPct: pct,
          retentionUsd,
          retentionBs,
          exchangeRate: rate,
          notes: dto.notes || null,
          createdById: userId,
        },
        include: { invoice: { select: { number: true, controlNumber: true } }, customer: true },
      });

      // Caso reintegro: comprobante entregado de una vez → línea del libro de ventas inmediata
      if (dto.voucherNumber && dto.voucherDate) {
        return this.applyVoucherInTx(tx, retention.id, {
          voucherNumber: dto.voucherNumber,
          voucherDate: dto.voucherDate,
        }, userId);
      }
      return retention;
    });
  }

  // Lógica compartida de registro de comprobante (usada por create con voucher y por registerVoucher)
  private async applyVoucherInTx(tx: any, id: string, dto: { voucherNumber: string; voucherDate: string; retentionBs?: number }, userId: string) {
    const retention = await tx.customerIvaRetention.findUnique({
      where: { id },
      include: {
        invoice: { select: { number: true, controlNumber: true, ivaBs: true } },
        customer: true,
      },
    });
    if (!retention) throw new NotFoundException('Retención no encontrada');
    if (retention.cancelledAt) throw new BadRequestException('La retención está anulada');
    if (retention.voucherNumber) throw new BadRequestException('La retención ya tiene comprobante registrado');

    let retentionBs = retention.retentionBs;
    let retentionUsd = retention.retentionUsd;
    if (dto.retentionBs !== undefined) {
      const adjusted = Math.round(dto.retentionBs * 100) / 100;
      const calculated = Math.round(retention.ivaAmountBs * (retention.retentionPct / 100) * 100) / 100;
      if (Math.abs(adjusted - calculated) > TOLERANCE_BS) {
        throw new BadRequestException(
          `El monto del comprobante (Bs ${adjusted.toFixed(2)}) se desvía más de ${TOLERANCE_BS} Bs del cálculo teórico (Bs ${calculated.toFixed(2)})`,
        );
      }
      retentionBs = adjusted;
      retentionUsd = retention.exchangeRate > 0 ? Math.round((adjusted / retention.exchangeRate) * 100) / 100 : 0;
    }

    const voucherDate = new Date(dto.voucherDate);
    voucherDate.setUTCHours(12, 0, 0, 0);

    const entry = await tx.salesBookEntry.create({
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
        ivaAmountBs: retentionBs,
        igtfAmountBs: 0,
        totalBs: 0,
        isManual: false,
        isRetentionLine: true,
        notes: dto.voucherNumber, // la columna "Comp. de Retención" del libro lee notes
        createdById: userId,
      },
    });

    return tx.customerIvaRetention.update({
      where: { id },
      data: {
        voucherNumber: dto.voucherNumber,
        voucherDate,
        voucherReceivedAt: new Date(),
        retentionBs,
        retentionUsd,
        salesBookEntryId: entry.id,
      },
      include: { invoice: { select: { number: true, controlNumber: true } }, customer: true },
    });
  }

  async registerVoucher(id: string, dto: RegisterVoucherDto, userId: string) {
    return this.prisma.$transaction(async (tx) => this.applyVoucherInTx(tx, id, dto, userId));
  }

  async findAll(filters: { status?: string; search?: string; from?: string; to?: string }) {
    const where: any = {};
    if (filters.status === 'pending-voucher') {
      where.voucherNumber = null;
      where.cancelledAt = null;
    } else if (filters.status === 'voucher-received') {
      where.voucherNumber = { not: null };
      where.cancelledAt = null;
    } else if (filters.status === 'cancelled') {
      where.cancelledAt = { not: null };
    }
    if (filters.search) {
      where.OR = [
        { number: { contains: filters.search, mode: 'insensitive' } },
        { voucherNumber: { contains: filters.search, mode: 'insensitive' } },
        { invoice: { number: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        const d = new Date(filters.from);
        d.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = d;
      }
      if (filters.to) {
        const d = new Date(filters.to);
        d.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }
    return this.prisma.customerIvaRetention.findMany({
      where,
      include: {
        invoice: { select: { id: true, number: true, controlNumber: true, totalBs: true } },
        customer: { select: { id: true, name: true, rif: true, documentType: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pendingCount() {
    const count = await this.prisma.customerIvaRetention.count({
      where: { voucherNumber: null, cancelledAt: null },
    });
    return { count };
  }

  async cancel(id: string, userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new BadRequestException('Solo ADMIN puede anular retenciones');
    }
    const retention = await this.prisma.customerIvaRetention.findUnique({ where: { id } });
    if (!retention) throw new NotFoundException('Retención no encontrada');
    if (retention.cancelledAt) throw new BadRequestException('La retención ya está anulada');
    if (retention.appliedAt) {
      throw new BadRequestException('La retención ya fue aplicada en un recibo de cobro — anule el recibo primero');
    }
    return this.prisma.$transaction(async (tx) => {
      if (retention.salesBookEntryId) {
        await tx.customerIvaRetention.update({ where: { id }, data: { salesBookEntryId: null } });
        await tx.salesBookEntry.delete({ where: { id: retention.salesBookEntryId } });
      }
      return tx.customerIvaRetention.update({
        where: { id },
        data: { cancelledAt: new Date() },
      });
    });
  }
}
```

- [ ] **Step 3: Controller**

`customer-iva-retentions.controller.ts` (mismo guard que sales-book.controller.ts):

```typescript
import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CustomerIvaRetentionsService } from './customer-iva-retentions.service';
import { CreateCustomerIvaRetentionDto } from './dto/create-customer-iva-retention.dto';
import { RegisterVoucherDto } from './dto/register-voucher.dto';

@Controller('customer-iva-retentions')
@UseGuards(AuthGuard('jwt'))
export class CustomerIvaRetentionsController {
  constructor(private readonly service: CustomerIvaRetentionsService) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ status, search, from, to });
  }

  @Get('pending-count')
  pendingCount() {
    return this.service.pendingCount();
  }

  @Post()
  create(@Body() dto: CreateCustomerIvaRetentionDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id/voucher')
  registerVoucher(@Param('id') id: string, @Body() dto: RegisterVoucherDto, @Request() req: any) {
    return this.service.registerVoucher(id, dto, req.user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.service.cancel(id, req.user.role);
  }
}
```

- [ ] **Step 4: Module + registro en app.module.ts**

`customer-iva-retentions.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CustomerIvaRetentionsController } from './customer-iva-retentions.controller';
import { CustomerIvaRetentionsService } from './customer-iva-retentions.service';

@Module({
  controllers: [CustomerIvaRetentionsController],
  providers: [CustomerIvaRetentionsService],
  exports: [CustomerIvaRetentionsService],
})
export class CustomerIvaRetentionsModule {}
```

En `apps/api/src/app.module.ts`: agregar el import y sumarlo al array `imports` (seguir el patrón de los demás módulos del archivo). Nota: si el proyecto usa un `PrismaModule` global no hace falta importarlo; verificar cómo lo hacen los módulos vecinos (p.ej. `retention-vouchers`).

- [ ] **Step 5: Build + verificación manual**

Run: `pnpm -C apps/api build` → compila.
Con el API corriendo y un token válido:
1. `POST /customer-iva-retentions` con `{"invoiceId": "<factura fiscal con IVA>"}` → crea con number `RVC-0001`, retentionBs = 75% del IVA.
2. Repetir con la misma factura hasta exceder el IVA → error de exceso.
3. `PATCH /customer-iva-retentions/:id/voucher` con `{"voucherNumber": "20260600000001", "voucherDate": "2026-06-12"}` → setea voucher y crea SalesBookEntry con `isRetentionLine: true` (verificar en Prisma Studio).
4. `GET /customer-iva-retentions/pending-count` → `{count: N}`.
5. Probar `POST` contra factura de serie NO fiscal → error de validación.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/customer-iva-retentions apps/api/src/app.module.ts
git commit -m "feat: modulo de retenciones de IVA sufridas de clientes (CRUD, comprobante, libro de ventas)"
```

---

### Task 4: Auto-crear retención al pagar factura a crédito de cliente especial

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts` (método `pay`, dentro del bloque `if (dto.isCredit && invoice.customerId)` que crea la Receivable, ~líneas 762-778)

- [ ] **Step 1: Insertar la auto-creación dentro de la transacción**

Inmediatamente después del `await tx.receivable.create({...})` del bloque de crédito (línea ~777), dentro del mismo `if`:

```typescript
        // Auto-crear retención de IVA si el cliente es contribuyente especial
        // (solo serie fiscal, no exenta, con IVA > 0)
        if (
          invoice.customer?.isSpecialTaxpayer &&
          paymentSerie.isFiscal &&
          !paymentSerie.isVatExempt &&
          (invoice.ivaBs || 0) > 0
        ) {
          const retPct = config?.ivaRetentionPct || 75;
          const retBs = Math.round(invoice.ivaBs * (retPct / 100) * 100) / 100;
          const retUsd = invoice.exchangeRate > 0
            ? Math.round((retBs / invoice.exchangeRate) * 100) / 100
            : 0;
          let retBaseUsd = 0;
          for (const item of invoice.items) {
            if (item.ivaType !== 'EXEMPT') retBaseUsd += item.unitPrice * item.quantity;
          }
          retBaseUsd = Math.round(retBaseUsd * 100) / 100;

          const lastRet = await tx.customerIvaRetention.findFirst({
            where: { number: { startsWith: 'RVC-' } },
            orderBy: { createdAt: 'desc' },
            select: { number: true },
          });
          let nextRetNum = 1;
          if (lastRet) {
            const n = parseInt(lastRet.number.split('-')[1], 10);
            if (!isNaN(n)) nextRetNum = n + 1;
          }

          await tx.customerIvaRetention.create({
            data: {
              number: `RVC-${String(nextRetNum).padStart(4, '0')}`,
              invoiceId: id,
              customerId: invoice.customerId,
              taxableBaseUsd: retBaseUsd,
              taxableBaseBs: Math.round(retBaseUsd * invoice.exchangeRate * 100) / 100,
              ivaAmountUsd: invoice.ivaUsd || 0,
              ivaAmountBs: invoice.ivaBs || 0,
              retentionPct: retPct,
              retentionUsd: retUsd,
              retentionBs: retBs,
              exchangeRate: invoice.exchangeRate,
              notes: 'Generada automáticamente (cliente contribuyente especial)',
              createdById: user.id,
            },
          });
        }
```

Notas para el ejecutor: `invoice.customer`, `invoice.items`, `paymentSerie`, `config` y `user` ya existen en el scope de `pay()` (ver líneas 459-535). El campo `isSpecialTaxpayer` existe tras Task 1+2.

- [ ] **Step 2: Build**

Run: `pnpm -C apps/api build`
Expected: compila sin errores.

- [ ] **Step 3: Verificación manual**

1. Marcar un cliente con `isSpecialTaxpayer: true` (PATCH de Task 2).
2. En el POS (o vía API), facturar a crédito a ese cliente por una caja con serie fiscal y productos con IVA.
3. Verificar en Prisma Studio: existe `CustomerIvaRetention` nueva ligada a la factura, `retentionBs` = 75% del `ivaBs`, sin voucher ni appliedAt.
4. Facturar a crédito a un cliente NO marcado → no se crea retención.
5. Facturar de contado a cliente marcado → no se crea retención.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts
git commit -m "feat: auto-crear retencion de IVA al facturar a credito a contribuyente especial"
```

---

### Task 5: Integración con recibos de cobro (backend)

**Files:**
- Modify: `apps/api/src/modules/receipts/dto/create-receipt.dto.ts`
- Modify: `apps/api/src/modules/receipts/receipts.service.ts`

- [ ] **Step 1: DTO — aceptar retenciones de cliente**

En `ReceiptItemDto` (create-receipt.dto.ts), después de `ivaRetentionId`:

```typescript
  @IsOptional()
  @IsString()
  customerIvaRetentionId?: string;
```

- [ ] **Step 2: `create()` — nuevo tipo de item**

En receipts.service.ts:
1. En el tipo del array `items` (línea ~113): cambiar la unión a `'RECEIVABLE' | 'PAYABLE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'IVA_RETENTION' | 'SALES_IVA_RETENTION'` y agregar `customerIvaRetentionId?: string;` a los campos.
2. Después del bloque `else if (item.ivaRetentionId) {...}` (línea ~218), agregar:

```typescript
      } else if (item.customerIvaRetentionId) {
        const retention = await this.prisma.customerIvaRetention.findUnique({
          where: { id: item.customerIvaRetentionId },
          include: { invoice: { select: { number: true } } },
        });
        if (!retention) throw new BadRequestException(`Retención ${item.customerIvaRetentionId} no encontrada`);
        if (retention.appliedAt) throw new BadRequestException(`Retención ${retention.number} ya fue aplicada`);
        if (retention.cancelledAt) throw new BadRequestException(`Retención ${retention.number} está anulada`);

        items.push({
          itemType: 'SALES_IVA_RETENTION',
          customerIvaRetentionId: item.customerIvaRetentionId,
          description: `Ret. IVA ${retention.number} (${retention.invoice?.number || ''})`,
          amountUsd: retention.retentionUsd,
          amountBsHistoric: retention.retentionBs,
          amountBsToday: this.round2(retention.retentionUsd * rate.rate),
          differentialBs: 0,
          sign: item.sign,
        });
      }
```

3. En el `items.create` del `tx.receipt.create` (línea ~284), agregar al map: `customerIvaRetentionId: item.customerIvaRetentionId || null,`

- [ ] **Step 3: `post()` — marcar aplicada + reintegro de caja**

1. Después del bloque `else if (item.itemType === 'IVA_RETENTION' ...)` (línea ~428), agregar:

```typescript
        } else if (item.itemType === 'SALES_IVA_RETENTION' && item.customerIvaRetentionId) {
          await tx.customerIvaRetention.update({
            where: { id: item.customerIvaRetentionId },
            data: { appliedAt: new Date() },
          });
        }
```

2. Después del loop que crea los `receiptPayment` (línea ~444) y antes del update a POSTED, agregar la salida de caja para reintegros:

```typescript
      // Recibo de cobro con total negativo = salida de dinero (reintegro de retención, etc.)
      if (receipt.type === 'COLLECTION' && receipt.totalUsd < -0.01 && dto.cashSessionId) {
        await tx.cashMovement.create({
          data: {
            cashSessionId: dto.cashSessionId,
            type: 'EXPENSE',
            amountUsd: Math.abs(this.round2(receipt.totalUsd)),
            amountBs: Math.abs(this.round2(receipt.totalUsd * rate.rate)),
            exchangeRate: rate.rate,
            currency: 'USD',
            reason: `Reintegro recibo ${receipt.number}`,
            isManual: false,
            createdById: userId,
          },
        });
      }
```

- [ ] **Step 4: `getPendingDocuments()` — devolver retenciones del cliente**

En el modo collection (después del fetch de `saleNotes`, línea ~641), agregar:

```typescript
    // Retenciones de IVA sufridas pendientes de cruzar (signo -1)
    let salesRetentions: any[] = [];
    if (customerId) {
      salesRetentions = await this.prisma.customerIvaRetention.findMany({
        where: { customerId, appliedAt: null, cancelledAt: null },
        include: { invoice: { select: { number: true } } },
        orderBy: { createdAt: 'asc' },
      });
    }
```

Y en el objeto de retorno (línea ~643), después de `notes: [...]`, agregar:

```typescript
      retentions: salesRetentions.map((r) => ({
        id: r.id,
        documentType: 'SALES_IVA_RETENTION',
        customerIvaRetentionId: r.id,
        description: `Ret. IVA ${r.number} (${r.invoice?.number || ''})${r.voucherNumber ? ` — Comp. ${r.voucherNumber}` : ''}`,
        date: r.createdAt,
        amountUsd: r.retentionUsd,
        amountBsHistoric: r.retentionBs,
        exchangeRate: r.exchangeRate,
        balanceUsd: r.retentionUsd,
        status: 'POSTED',
        sign: -1,
      })),
```

- [ ] **Step 5: Build + verificación manual**

Run: `pnpm -C apps/api build` → compila.
Flujo completo caso 2/3 (vía API o esperar al frontend de Task 7):
1. `GET /receipts/pending-documents?customerId=<id>` → incluye la retención de Task 4 en `retentions` con `sign: -1`.
2. `POST /receipts` con itemIds = [CxC con sign 1, retención con sign -1] → total = factura − retención.
3. `POST /receipts/:id/post` (o el endpoint de post que use el controller — verificar en receipts.controller.ts) con pagos por el neto → la CxC queda PAID y la retención queda con `appliedAt`.

Flujo caso 1 (reintegro):
4. Crear retención con voucher sobre factura de contado ya pagada (Task 3, Step 5.3).
5. Recibo de cobro solo con esa retención (sign -1) → total negativo.
6. Postear con `cashSessionId` de una sesión abierta y un pago por el monto → se crea `CashMovement` tipo EXPENSE "Reintegro recibo RCB-XXXX" (verificar en Prisma Studio y en el detalle de la sesión de caja).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/receipts
git commit -m "feat: retenciones de clientes cruzables en recibos de cobro con reintegro de caja"
```

---

### Task 6: Libro de ventas — excluir retenciones de los totales

**Files:**
- Modify: `apps/api/src/modules/sales-book/sales-book.service.ts:39-45`

La línea de retención guarda el monto retenido en `ivaAmountBs`; sin exclusión, `findAll` lo sumaría al débito fiscal del período (incorrecto).

- [ ] **Step 1: Excluir isRetentionLine de los totales**

En el loop de totales de `findAll()` (líneas 39-45), reemplazar:

```typescript
    for (const entry of entries) {
      totalExempt += entry.exemptAmountBs;
      totalTaxableBase += entry.taxableBaseBs;
      totalIva += entry.ivaAmountBs;
      totalIgtf += entry.igtfAmountBs;
      totalAmount += entry.totalBs;
    }
```

por:

```typescript
    for (const entry of entries) {
      if (entry.isRetentionLine) continue; // el IVA retenido no es débito fiscal
      totalExempt += entry.exemptAmountBs;
      totalTaxableBase += entry.taxableBaseBs;
      totalIva += entry.ivaAmountBs;
      totalIgtf += entry.igtfAmountBs;
      totalAmount += entry.totalBs;
    }
```

- [ ] **Step 2: Build + verificación**

Run: `pnpm -C apps/api build` → compila.
`GET /sales-book?from=...&to=...` en un período con una retención registrada → la entrada aparece en `entries` pero NO infla `totales.ivaAmountBs`.
Verificar también el libro unificado (`/fiscal/libro-ventas` en el web): la fila morada de retención muestra el monto en "IVA Retenido" y el número de comprobante en "Comp. de Retención" (esto ya funcionaba — solo confirmar).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/sales-book/sales-book.service.ts
git commit -m "fix: excluir lineas de retencion de los totales del libro de ventas"
```

---

### Task 7: POS — toggle "Contribuyente especial"

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx` (estado ~línea 88-92, fetch de cliente ~línea 990, sección de cliente ~líneas 1301-1313)

- [ ] **Step 1: Estado del cliente seleccionado**

Junto a los useState de cliente (línea ~88):

```typescript
  const [customerIsSpecial, setCustomerIsSpecial] = useState(false);
  const [customerIsDefault, setCustomerIsDefault] = useState(false);
```

- [ ] **Step 2: Poblar el estado desde el fetch existente**

En el `useEffect` que hace `fetch('/api/proxy/customers/${customerId}')` (línea ~990), dentro del `.then` que procesa `data`, agregar:

```typescript
        setCustomerIsSpecial(!!data.isSpecialTaxpayer);
        setCustomerIsDefault(!!data.isDefault);
```

Y en cada lugar donde se limpia el cliente (`setCustomerId(null); setCustomerName('');` — líneas ~655, 693, 801, 937, 1041, 1309), no hace falta tocar nada más: el efecto de la línea 990 hace `if (!customerId) return;`, así que basta con resetear ahí también. Agregar al inicio de ese efecto:

```typescript
    if (!customerId) { setCustomerIsSpecial(false); setCustomerIsDefault(false); return; }
```

(reemplazando el guard existente `if (!customerId) return;`).

- [ ] **Step 3: Handler del toggle**

Cerca de los demás handlers de cliente (después del effect anterior):

```typescript
  const toggleSpecialTaxpayer = async () => {
    if (!customerId || customerIsDefault) return;
    const newValue = !customerIsSpecial;
    setCustomerIsSpecial(newValue); // optimista
    try {
      const res = await fetch(`/api/proxy/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSpecialTaxpayer: newValue }),
      });
      if (!res.ok) setCustomerIsSpecial(!newValue); // revertir
    } catch {
      setCustomerIsSpecial(!newValue);
    }
  };
```

- [ ] **Step 4: UI del toggle en la sección de cliente**

En la sección de cliente seleccionado (línea ~1303-1310), junto al nombre y el botón "Quitar", agregar (ajustar clases al estilo del bloque):

```tsx
                {!customerIsDefault && (
                  <button
                    onClick={toggleSpecialTaxpayer}
                    title="Contribuyente especial: el sistema generará la retención de IVA al facturar a crédito"
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      customerIsSpecial
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                        : 'bg-slate-700/40 border-slate-600 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {customerIsSpecial ? '✓ Contribuyente especial' : 'Contribuyente?'}
                  </button>
                )}
```

- [ ] **Step 5: Build + verificación manual**

Run: `pnpm -C apps/web build` → compila.
En el POS: seleccionar un cliente normal → aparece el chip; click → queda morado y persiste (recargar página y re-seleccionar cliente → sigue activo). Seleccionar el cliente por defecto → el chip NO aparece.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/pos/page.tsx"
git commit -m "feat: toggle de contribuyente especial en el POS"
```

---

### Task 8: Recibo de cobro (frontend) — retenciones + reintegro

**Files:**
- Modify: `apps/web/src/app/(dashboard)/receipts/new/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/receipts/[id]/page.tsx` (etiqueta del nuevo itemType)

- [ ] **Step 1: Interface + merge de pending docs**

En `PendingDoc` (línea ~9) agregar `customerIvaRetentionId?: string;`.

En `fetchPendingDocs` (línea ~329), cambiar:

```typescript
        const allDocs = [...json.receivables, ...(json.notes || [])];
```

por:

```typescript
        const allDocs = [...json.receivables, ...(json.notes || []), ...(json.retentions || [])];
```

- [ ] **Step 2: Enviar el ID al crear el recibo**

En los dos builders de `itemIds` (`saveDraft` línea ~399 y `openPayModal` línea ~440), agregar a cada objeto:

```typescript
          customerIvaRetentionId: d.customerIvaRetentionId,
```

- [ ] **Step 3: Etiqueta y estilo del documento**

Donde se renderiza `doc.documentType` en las listas de pendientes/seleccionados (buscar las expresiones tipo `doc.documentType === 'IVA_RETENTION' ? 'Ret. IVA' : ...` alrededor de las líneas 804-816 y equivalentes), extender para que `'SALES_IVA_RETENTION'` muestre `'Ret. IVA'` con el mismo estilo morado que `IVA_RETENTION` (`bg-purple-500/5`, texto morado). El signo ya viene del API (`doc.sign ?? ...` en `addDoc`, línea 351 — no requiere cambio).

- [ ] **Step 4: UI de reintegro cuando el total es negativo**

Donde se muestra el total del recibo y en el modal de pago (buscar el render de `totalUsd`), cuando `totalUsd < 0` mostrar una nota:

```tsx
            {totalUsd < 0 && (
              <p className="text-xs text-amber-400 mt-1">
                Total negativo: este recibo registra una salida de dinero (reintegro al cliente).
                Los pagos indican cómo se devuelve el dinero.
              </p>
            )}
```

Verificar que la validación del modal de pago compare contra `Math.abs(totalUsd)` (el backend ya valida con valor absoluto en receipts.service.ts:343-344); si el frontend bloquea pagos cuando `totalUsd < 0`, ajustar usando `Math.abs()`.

- [ ] **Step 5: Detalle del recibo**

En `receipts/[id]/page.tsx`, buscar dónde se mapea `itemType` a etiqueta (similar a 'IVA_RETENTION') y agregar el caso `'SALES_IVA_RETENTION'` → `'Ret. IVA Cliente'` con estilo morado.

- [ ] **Step 6: Build + verificación manual**

Run: `pnpm -C apps/web build` → compila.
UI: en "Recibos de cobro → Nuevo", seleccionar el cliente especial de Task 4 → aparecen la CxC (+) y la retención (−) moradas; cruzar ambas → total neto; pagar → recibo POSTED, CxC pagada, retención aplicada (desaparece de pendientes).
Reintegro: recibo solo con una retención → total negativo con la nota de salida de dinero → postear con sesión de caja → verificar el movimiento de caja en la sesión.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(dashboard)/receipts/new/page.tsx" "apps/web/src/app/(dashboard)/receipts/[id]/page.tsx"
git commit -m "feat: cruzar retenciones de clientes en recibos de cobro con soporte de reintegro"
```

---

### Task 9: Página "Retenciones clientes" + sidebar + alerta

**Files:**
- Create: `apps/web/src/app/(dashboard)/sales/customer-retentions/page.tsx`
- Modify: `apps/web/src/components/sidebar.tsx:71-77` (sección VENTAS)

- [ ] **Step 1: Item en el sidebar**

En la sección VENTAS (sidebar.tsx items, línea 71-77), después de 'Notas Cr/Db':

```tsx
      { label: 'Retenciones clientes', href: '/sales/customer-retentions', icon: <Shield size={18} /> },
```

(`Shield` ya se importa de lucide-react en este archivo — verificar el import de la línea superior; si no está, agregarlo.)

- [ ] **Step 2: Página de gestión**

Create `apps/web/src/app/(dashboard)/sales/customer-retentions/page.tsx`. Estructura (usar como referencia visual `apps/web/src/app/(dashboard)/purchases/retentions/page.tsx` — misma familia de componentes Tailwind del proyecto):

- `document.title = 'Retenciones de Clientes | Trinity ERP'` en un `useEffect(..., [])`.
- Tabs de filtro: **Pendientes de comprobante** (default), **Con comprobante**, **Anuladas**, **Todas** → param `status` del `GET /api/proxy/customer-iva-retentions`.
- Banner de alerta arriba cuando el tab "Pendientes" tiene filas: `"{n} retención(es) sin comprobante — exigir el comprobante al cliente"` en ámbar; cada fila pendiente muestra **días transcurridos** desde `createdAt` (rojo si > 7 días, que es cuando legalmente ya debería haberlo entregado).
- Columnas de la tabla: Número (RVC), Fecha, Cliente, Factura, % / Monto Bs, Comprobante (número + fecha o "—"), Estado (Pendiente comprobante / Aplicada / Con comprobante / Anulada — derivado de `appliedAt`/`voucherNumber`/`cancelledAt`), Días, Acciones.
- Acción **"Registrar comprobante"** (filas sin voucher): modal con voucherNumber (input con validación 14 dígitos), voucherDate (date input), retentionBs editable precargado con el monto actual y leyenda "Tolerancia ±1 Bs vs cálculo teórico" → `PATCH /api/proxy/customer-iva-retentions/:id/voucher`.
- Acción **"Anular"** (solo si no está aplicada; confirmación) → `PATCH /api/proxy/customer-iva-retentions/:id/cancel`.
- Botón **"Nueva retención (reintegro)"**: modal que busca la factura por número (`GET /api/proxy/invoices?search=<num>` — el endpoint de listado de facturas ya soporta búsqueda; verificar el shape de la respuesta en `sales/invoices/page.tsx`), muestra cliente/total/IVA de la factura elegida, % (default 75), monto Bs precalculado y editable, y campos opcionales de comprobante (número + fecha) → `POST /api/proxy/customer-iva-retentions`. Texto de ayuda: "Si registras el comprobante aquí, la línea del libro de ventas se crea de inmediato; luego haz el recibo de cobro para registrar la salida del dinero (reintegro)".
- Estados con chips de color: pendiente = ámbar, aplicada sin comprobante = ámbar/rojo según días, con comprobante = verde, anulada = gris.
- Fechas mostradas con `toLocaleDateString('es-VE')`; montos con `toLocaleString('es-VE', { minimumFractionDigits: 2 })`.

Aplicar la skill `frontend-design` (.agents/skills/frontend-design/SKILL.md) para la calidad visual, manteniendo la estética oscura slate del resto del dashboard.

- [ ] **Step 3: Build + verificación manual**

Run: `pnpm -C apps/web build` → compila.
UI: la página lista las retenciones creadas en tasks anteriores; registrar un comprobante desde el modal → pasa al tab "Con comprobante" y la línea aparece en `/fiscal/libro-ventas` (vista del período del comprobante, columnas IVA Retenido y Comp. de Retención); crear una retención con comprobante desde "Nueva retención (reintegro)" sobre una factura de contado → aparece directa en "Con comprobante" y queda pendiente de cruzar en recibo.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sales/customer-retentions" apps/web/src/components/sidebar.tsx
git commit -m "feat: pagina de retenciones de clientes con alerta de comprobantes pendientes"
```

---

### Task 10: Verificación end-to-end + actualización de docs + deploy

- [ ] **Step 1: Flujo completo caso 2/3 (crédito)**

1. POS: cliente nuevo → activar toggle "Contribuyente especial" → facturar a crédito (serie fiscal, productos con IVA).
2. Verificar retención auto-creada en "Retenciones clientes" (tab Pendientes, badge con días).
3. Recibo de cobro: cruzar CxC + retención → pagar neto → CxC pagada, retención "Aplicada".
4. Registrar comprobante (14 dígitos) → línea en libro de ventas con número de comprobante, totales del libro sin inflar.

- [ ] **Step 2: Flujo completo caso 1 (reintegro)**

1. Facturar de contado (fiscal, IVA > 0) a cliente cualquiera, cobrar completo.
2. "Nueva retención (reintegro)" con datos del comprobante → creada con comprobante y línea en libro.
3. Recibo de cobro solo con la retención → total negativo → postear con sesión de caja → movimiento EXPENSE en la sesión.

- [ ] **Step 3: Actualizar PROGRESS.md y PROJECT.md**

Documentar el módulo nuevo siguiendo el formato existente (modelos, endpoints, flujos, decisiones: tolerancia ±1 Bs, línea de libro solo con comprobante, reintegro vía CashMovement).

- [ ] **Step 4: Pre-deploy checklist (CLAUDE.md) + deploy**

1. `git status` → limpio, todo commiteado y pusheado (`git push origin main`).
2. Migración commiteada; módulo nuevo importado en app.module.ts commiteado.
3. Deploy: `ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"`
4. Health check del script OK; smoke test en producción: `GET /customer-iva-retentions/pending-count` responde.

---

## Self-Review (ejecutada al escribir el plan)

- **Cobertura de spec:** caso 1 (reintegro) → Tasks 3+5+8+9; casos 2/3 (crédito + cruce) → Tasks 4+5+8; toggle POS sin cliente default → Task 7; alerta de comprobantes → Task 9; libro de ventas → Tasks 3 (creación de línea) + 6 (totales); validaciones serie fiscal + IVA>0 → Tasks 3+4; tolerancia máquina fiscal → Tasks 3 (TOLERANCE_BS) + 9 (UI); recibo total negativo = salida de dinero → Task 5 Step 3 + Task 8 Step 4.
- **Tipos consistentes:** `CustomerIvaRetention`, `customerIvaRetentionId`, `SALES_IVA_RETENTION`, prefijo `RVC-`, campos `retentionBs/retentionUsd/retentionPct/voucherNumber/voucherDate/voucherReceivedAt/appliedAt/cancelledAt/salesBookEntryId` usados igual en schema, service, receipts y frontend.
- **Sin placeholders:** los pasos de UI de Task 9 describen contenido concreto (columnas, endpoints, validaciones); el layout fino queda a la skill frontend-design por diseño, no por omisión.
