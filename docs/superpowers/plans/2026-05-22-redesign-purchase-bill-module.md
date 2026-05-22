# Redesign Purchase Module as Purchase Bill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-step purchase order flow (DRAFT → SENT → RECEIVED) with a simplified "Factura de Compra" (Purchase Bill) that goes directly PENDING → PROCESSED, entering inventory and the fiscal purchase book upon processing.

**Architecture:** Keep the internal Prisma model name `PurchaseOrder` to avoid mass refactoring of relations, but add new fiscal/financial fields and simplify the status enum to PENDING/PROCESSED/CANCELLED. The backend controller moves from `/purchase-orders` to `/purchases` for cleaner URLs. The frontend relabels everything from "Orden de compra" to "Factura de compra" and builds a new form with per-line discounts, global discount, and a fiscal totals footer.

**Tech Stack:** Prisma (PostgreSQL), NestJS, Next.js 14 App Router, TypeScript

---

## File Structure

### Database
- **Modify:** `packages/database/prisma/schema.prisma` — Update `PurchaseStatus` enum, add fields to `PurchaseOrder` and `PurchaseOrderItem`
- **Create:** `packages/database/prisma/migrations/YYYYMMDD_redesign_purchase_bill_module/migration.sql`

### Backend (NestJS)
- **Modify:** `apps/api/src/modules/purchase-orders/purchase-orders.controller.ts` — Change route to `/purchases`, update endpoints
- **Modify:** `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` — Rewrite create/process/cancel logic
- **Modify:** `apps/api/src/modules/purchase-orders/dto/create-purchase-order.dto.ts` — Add new fields (discounts, fiscal numbers, etc.)
- **Modify:** `apps/api/src/modules/purchase-orders/dto/receive-purchase-order.dto.ts` — Rename/repurpose as ProcessPurchaseBillDto
- **Modify:** `apps/api/src/modules/fiscal/fiscal.service.ts` — Update `libroCompras()` to use new fields

### Frontend (Next.js)
- **Rewrite:** `apps/web/src/app/(dashboard)/purchases/new/page.tsx` — New purchase bill form with 4-column grid header, discount table, fiscal totals footer
- **Rewrite:** `apps/web/src/app/(dashboard)/purchases/page.tsx` — Updated list with new columns and status badges
- **Rewrite:** `apps/web/src/app/(dashboard)/purchases/[id]/page.tsx` — Detail page with tabs (Info, CxP, Notas Cr/Db)
- **Delete:** `apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx` — No longer needed (edit is only for PENDING, handled in detail page or re-create)
- **Modify:** `apps/web/src/components/sidebar.tsx` — Rename "Ordenes de compra" → "Facturas de compra"
- **Modify:** `apps/web/src/app/(dashboard)/fiscal/libro-compras/page.tsx` — Update columns to use new fields

---

## Task 1: Prisma Schema Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

### Step-by-step

- [ ] **Step 1: Update the `PurchaseStatus` enum**

In `packages/database/prisma/schema.prisma`, replace the current enum:

```prisma
enum PurchaseStatus {
  PENDING
  PROCESSED
  CANCELLED
}
```

This replaces `DRAFT`, `SENT`, `PARTIAL`, `RECEIVED`.

- [ ] **Step 2: Add new fields to `PurchaseOrder` model**

Add these fields to the `PurchaseOrder` model (keep all existing fields, add new ones):

```prisma
model PurchaseOrder {
  // --- existing fields that stay ---
  id                    String              @id @default(cuid())
  number                String              @unique
  supplierId            String
  supplier              Supplier            @relation(fields: [supplierId], references: [id])
  status                PurchaseStatus      @default(PENDING)
  invoiceDate           DateTime?
  receivedDate          DateTime?
  currency              String              @default("USD")
  totalUsd              Float               @default(0)
  totalBs               Float               @default(0)
  exchangeRate          Float               @default(1)
  surchargeUsd          Float               @default(0)
  surchargeDistribution String              @default("PROPORTIONAL")
  totalWithSurchargeUsd Float               @default(0)
  isCredit              Boolean             @default(false)
  creditDays            Int                 @default(0)
  supplierControlNumber String?
  islrRetentionPct      Float?
  islrRetentionUsd      Float?
  islrRetentionBs       Float?
  notes                 String?
  receivedAt            DateTime?
  items                 PurchaseOrderItem[]
  payables              Payable[]
  creditDebitNotes      CreditDebitNote[]
  createdById           String
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  // --- NEW fields ---
  purchaseNumber         Int                @default(0)
  supplierSerialNumber   String?
  supplierInvoiceNumber  String?
  discountGlobalPct      Float              @default(0)
  discountGlobalUsd      Float              @default(0)
  discountGlobalBs       Float              @default(0)
  subtotalUsd            Float              @default(0)
  subtotalBs             Float              @default(0)
  exemptAmountUsd        Float              @default(0)
  exemptAmountBs         Float              @default(0)
  taxableBaseUsd         Float              @default(0)
  taxableBaseBs          Float              @default(0)
  totalIvaUsd            Float              @default(0)
  totalIvaBs             Float              @default(0)
  totalSurchargeUsd      Float              @default(0)
  totalSurchargeBs       Float              @default(0)
  retentionVoucherNumber String?
  responsibleId          String?
  responsible            User?              @relation("PurchaseBillResponsible", fields: [responsibleId], references: [id])
  processedAt            DateTime?
  warehouseId            String?
  warehouse              Warehouse?         @relation("PurchaseBillWarehouse", fields: [warehouseId], references: [id])
}
```

- [ ] **Step 3: Add new fields to `PurchaseOrderItem` model**

```prisma
model PurchaseOrderItem {
  // existing fields stay...
  id              String        @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id])
  productId       String
  product         Product       @relation(fields: [productId], references: [id])
  quantity        Float
  costUsd         Float
  costBs          Float         @default(0)
  totalUsd        Float
  totalBs         Float         @default(0)
  receivedQty     Float         @default(0)

  // --- NEW fields ---
  discountPct     Float         @default(0)
  discountUsd     Float         @default(0)
  discountBs      Float         @default(0)
  netCostUsd      Float         @default(0)
  netCostBs       Float         @default(0)
}
```

- [ ] **Step 4: Add the `PurchaseBillResponsible` relation to User model**

In the `User` model, add:
```prisma
  purchaseBills       PurchaseOrder[] @relation("PurchaseBillResponsible")
```

- [ ] **Step 5: Add the `PurchaseBillWarehouse` relation to Warehouse model**

In the `Warehouse` model, add:
```prisma
  purchaseBills  PurchaseOrder[] @relation("PurchaseBillWarehouse")
```

- [ ] **Step 6: Run migration**

```bash
cd packages/database
npx prisma migrate dev --name redesign_purchase_bill_module
```

The migration SQL must handle data conversion:
- Convert existing `DRAFT` and `SENT` records to `PENDING`
- Convert existing `RECEIVED` and `PARTIAL` records to `PROCESSED`
- Set `purchaseNumber` for existing records using ROW_NUMBER() ordered by createdAt
- Set `responsibleId = createdById` for existing records
- Set `subtotalUsd = totalUsd` for existing records
- Set `netCostUsd = costUsd` and `netCostBs = costBs` for existing items

If the migration fails because of enum changes, create a manual migration file at `packages/database/prisma/migrations/20260522200000_redesign_purchase_bill_module/migration.sql` with:

```sql
-- Step 1: Add new enum values first
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PROCESSED';

-- Step 2: Convert existing data
UPDATE "PurchaseOrder" SET status = 'PENDING' WHERE status IN ('DRAFT', 'SENT');
UPDATE "PurchaseOrder" SET status = 'PROCESSED' WHERE status IN ('RECEIVED', 'PARTIAL');

-- Step 3: Add new columns to PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "purchaseNumber" INTEGER DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierSerialNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "supplierInvoiceNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "discountGlobalPct" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "discountGlobalUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "discountGlobalBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "subtotalUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "subtotalBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "exemptAmountUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "exemptAmountBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "taxableBaseUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "taxableBaseBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalIvaUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalIvaBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalSurchargeUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "totalSurchargeBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "retentionVoucherNumber" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "responsibleId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

-- Step 4: Add new columns to PurchaseOrderItem
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "discountPct" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "discountUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "discountBs" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "netCostUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "netCostBs" DOUBLE PRECISION DEFAULT 0;

-- Step 5: Backfill existing data
UPDATE "PurchaseOrder" SET "responsibleId" = "createdById";
UPDATE "PurchaseOrder" SET "subtotalUsd" = "totalUsd", "subtotalBs" = "totalBs";
UPDATE "PurchaseOrderItem" SET "netCostUsd" = "costUsd", "netCostBs" = "costBs";

-- Step 6: Backfill purchaseNumber with sequential numbers per company (single-tenant)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") as rn
  FROM "PurchaseOrder"
)
UPDATE "PurchaseOrder" po SET "purchaseNumber" = n.rn
FROM numbered n WHERE po.id = n.id;

-- Step 7: Add foreign keys
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT IF NOT EXISTS "PurchaseOrder_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT IF NOT EXISTS "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

After migration, also add to `deploy/fix-schema.sql` as safety net.

- [ ] **Step 7: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 8: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add purchase bill schema fields and simplify status enum"
```

---

## Task 2: Backend — Rewrite DTOs

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/dto/create-purchase-order.dto.ts`
- Modify: `apps/api/src/modules/purchase-orders/dto/receive-purchase-order.dto.ts`

- [ ] **Step 1: Rewrite CreatePurchaseOrderDto**

Replace contents of `apps/api/src/modules/purchase-orders/dto/create-purchase-order.dto.ts`:

```typescript
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseOrderItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  costUsd: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPct?: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  supplierSerialNumber?: string;

  @IsOptional()
  @IsString()
  supplierControlNumber?: string;

  @IsOptional()
  @IsString()
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['USD', 'BS'])
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsBoolean()
  isCredit?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountGlobalPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  surchargeUsd?: number;

  @IsOptional()
  @IsString()
  @IsIn(['PROPORTIONAL', 'EQUAL'])
  surchargeDistribution?: string;

  @IsOptional()
  @IsBoolean()
  applyIslr?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  islrRetentionPct?: number;

  @IsOptional()
  @IsString()
  retentionVoucherNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
```

- [ ] **Step 2: Rewrite ReceivePurchaseOrderDto as ProcessPurchaseBillDto**

Replace contents of `apps/api/src/modules/purchase-orders/dto/receive-purchase-order.dto.ts`:

```typescript
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessPriceUpdateItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  gananciaPct: number;

  @IsNumber()
  gananciaMayorPct: number;
}

export class ProcessPurchaseBillDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessPriceUpdateItemDto)
  priceUpdates?: ProcessPriceUpdateItemDto[];
}

// Keep old name as alias for backward compat during transition
export { ProcessPurchaseBillDto as ReceivePurchaseOrderDto };
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/purchase-orders/dto/
git commit -m "feat: update purchase DTOs for bill model with discounts and fiscal fields"
```

---

## Task 3: Backend — Rewrite Service

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`

This is the largest task. The service needs to be substantially rewritten.

- [ ] **Step 1: Rewrite the `generateNumber` method to use `purchaseNumber` correlative**

Replace the `generateNumber` method with a `generatePurchaseNumber` method that uses `SELECT FOR UPDATE`:

```typescript
private async generatePurchaseNumber(tx: any): Promise<{ purchaseNumber: number; number: string }> {
  // Use SELECT FOR UPDATE to prevent race conditions
  const result = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX("purchaseNumber") as max FROM "PurchaseOrder" FOR UPDATE
  `;
  const next = (result[0]?.max || 0) + 1;
  const number = `FC-${next.toString().padStart(5, '0')}`;
  return { purchaseNumber: next, number };
}
```

- [ ] **Step 2: Add helper for item calculations with discounts**

Add a private method to calculate item-level values with discounts:

```typescript
private calculateItemValues(
  costUsd: number,
  quantity: number,
  discountPct: number,
  exchangeRate: number,
) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const discountUsd = round2(costUsd * (discountPct / 100));
  const discountBs = round2(discountUsd * exchangeRate);
  const netCostUsd = round2(costUsd - discountUsd);
  const netCostBs = round2(netCostUsd * exchangeRate);
  const totalUsd = round2(netCostUsd * quantity);
  const totalBs = round2(totalUsd * exchangeRate);
  const costBs = round2(costUsd * exchangeRate);

  return { costBs, discountUsd, discountBs, netCostUsd, netCostBs, totalUsd, totalBs };
}
```

- [ ] **Step 3: Add helper for fiscal totals calculation**

Add a private method to calculate the footer totals (subtotal, exempt, taxable base, IVA, etc.):

```typescript
private async calculateFiscalTotals(
  items: Array<{
    productId: string;
    quantity: number;
    netCostUsd: number;
    totalUsd: number;
  }>,
  discountGlobalPct: number,
  surchargeUsd: number,
  exchangeRate: number,
  prismaClient: any,
) {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Get IVA types for all products
  const productIds = items.map((i) => i.productId);
  const products = await prismaClient.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, ivaType: true },
  });
  const ivaMap = new Map(products.map((p) => [p.id, p.ivaType]));

  const subtotalUsd = round2(items.reduce((sum, i) => sum + i.totalUsd, 0));
  const discountGlobalUsd = round2(subtotalUsd * (discountGlobalPct / 100));
  const subtotalAfterDiscountUsd = round2(subtotalUsd - discountGlobalUsd);

  let exemptAmountUsd = 0;
  let taxableBaseUsd = 0;
  let totalIvaUsd = 0;

  for (const item of items) {
    const ivaType = ivaMap.get(item.productId) || 'GENERAL';
    const ivaRate = IVA_RATES[ivaType] || 0;
    // Apply global discount proportionally to each item
    const proportion = subtotalUsd > 0 ? item.totalUsd / subtotalUsd : 0;
    const itemDiscountedTotal = round2(item.totalUsd - discountGlobalUsd * proportion);

    if (ivaType === 'EXEMPT') {
      exemptAmountUsd += itemDiscountedTotal;
    } else {
      taxableBaseUsd += itemDiscountedTotal;
      totalIvaUsd += round2(itemDiscountedTotal * ivaRate);
    }
  }

  const totalSurchargeUsd = surchargeUsd;
  const totalUsd = round2(subtotalAfterDiscountUsd + totalIvaUsd + totalSurchargeUsd);

  return {
    subtotalUsd: round2(subtotalUsd),
    subtotalBs: round2(subtotalUsd * exchangeRate),
    discountGlobalUsd: round2(discountGlobalUsd),
    discountGlobalBs: round2(discountGlobalUsd * exchangeRate),
    exemptAmountUsd: round2(exemptAmountUsd),
    exemptAmountBs: round2(exemptAmountUsd * exchangeRate),
    taxableBaseUsd: round2(taxableBaseUsd),
    taxableBaseBs: round2(taxableBaseUsd * exchangeRate),
    totalIvaUsd: round2(totalIvaUsd),
    totalIvaBs: round2(totalIvaUsd * exchangeRate),
    totalSurchargeUsd: round2(totalSurchargeUsd),
    totalSurchargeBs: round2(totalSurchargeUsd * exchangeRate),
    totalUsd: round2(totalUsd),
    totalBs: round2(totalUsd * exchangeRate),
  };
}
```

- [ ] **Step 4: Rewrite the `create` method**

The new `create` method:
- Runs inside a transaction
- Generates `purchaseNumber` with SELECT FOR UPDATE
- Calculates per-item discounts
- Distributes surcharge
- Computes fiscal totals (subtotal, exempt, taxable base, IVA)
- Sets `responsibleId = currentUser.id`
- Sets status to `PENDING`

Key logic flow:
1. Get exchange rate (from dto or today's rate)
2. Build items with discount calculations using `calculateItemValues()`
3. Distribute surcharge across non-service items
4. Compute fiscal totals using `calculateFiscalTotals()`
5. Calculate ISLR if applicable
6. Create PurchaseOrder with all fields
7. Return with supplier and items included

- [ ] **Step 5: Rewrite the `process` method (replaces `receive`)**

New method `process(id, dto, userId)`:
1. Verify status === PENDING
2. Get company config for bregaGlobalPct
3. In transaction:
   - For each non-service item:
     - Upsert Stock (increment quantity)
     - Calculate stockAfter
     - Update product.costUsd = item.netCostUsd
     - Recalculate priceDetal and priceMayor
     - Create StockMovement (type PURCHASE, costUsd = item.netCostUsd, stockAfter)
   - If dto.priceUpdates provided: apply custom ganancia% per product
   - If isCredit: create Payable with IVA retention and ISLR retention
   - Update order: status = PROCESSED, processedAt = now(), responsibleId = userId
4. Return updated order

- [ ] **Step 6: Rewrite the `cancel` method (replaces `changeStatus`)**

New method `cancel(id)`:
1. Find order, verify status === PENDING
2. Update status to CANCELLED
3. Return updated order

- [ ] **Step 7: Update `findAll` to filter by new statuses and use invoiceDate for date range**

Update the `findAll` method:
- Filter `where` by new statuses (PENDING, PROCESSED, CANCELLED)
- Use `invoiceDate` (or fallback `createdAt`) for date range filtering
- Include `purchaseNumber`, `supplierInvoiceNumber` in the response
- Include `responsible` user name

- [ ] **Step 8: Update `findOne` to include all new fields and relations**

Include `responsible` (name), `warehouse` (name), and all new fiscal fields.

- [ ] **Step 9: Update the `update` method — only for PENDING status**

Change validation from `DRAFT` to `PENDING`. Keep same logic but add discount fields processing.

- [ ] **Step 10: Keep `getSuggestedPrices` and `updatePrices` — update status check from RECEIVED to PROCESSED**

Change the status check in `updatePrices` from `RECEIVED` to `PROCESSED`.

- [ ] **Step 11: Keep `getReorderSuggestions` unchanged**

No changes needed.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat: rewrite purchase service with bill model, per-item discounts and fiscal totals"
```

---

## Task 4: Backend — Update Controller Routes

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.controller.ts`

- [ ] **Step 1: Change the controller route from `purchase-orders` to `purchases`**

Update the `@Controller` decorator:
```typescript
@Controller('purchases')
```

- [ ] **Step 2: Update endpoints**

Replace the controller content with:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ProcessPurchaseBillDto } from './dto/receive-purchase-order.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PurchaseStatus } from '@prisma/client';

@Controller('purchases')
@UseGuards(AuthGuard('jwt'))
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Post()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.create(dto, user.id);
  }

  @Get('reorder-suggestions')
  getReorderSuggestions() {
    return this.service.getReorderSuggestions();
  }

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: PurchaseStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      supplierId,
      status,
      from,
      to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreatePurchaseOrderDto>) {
    return this.service.update(id, dto);
  }

  @Post(':id/process')
  process(
    @Param('id') id: string,
    @Body() dto: ProcessPurchaseBillDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.process(id, dto, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Get(':id/suggested-prices')
  getSuggestedPrices(@Param('id') id: string) {
    return this.service.getSuggestedPrices(id);
  }

  @Patch(':id/update-prices')
  updatePrices(
    @Param('id') id: string,
    @Body('items') items: { productId: string; gananciaPct: number; gananciaMayorPct: number }[],
  ) {
    return this.service.updatePrices(id, items);
  }
}
```

Key changes:
- Route: `/purchases` instead of `/purchase-orders`
- `POST :id/process` replaces `PATCH :id/receive`
- `PATCH :id/cancel` replaces `PATCH :id/status`
- Removed old `changeStatus` endpoint

- [ ] **Step 3: Update all frontend API calls from `/purchase-orders` to `/purchases`**

Search the entire `apps/web/` for `purchase-orders` and replace with `purchases`. Files likely affected:
- `apps/web/src/app/(dashboard)/purchases/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/new/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/reorder/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/analysis/page.tsx`
- `apps/web/src/app/(dashboard)/fiscal/libro-compras/page.tsx`
- Any other files referencing the old API path

Also update any references from other modules (credit-debit-notes, payables, etc.) that reference purchase-order endpoints.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.controller.ts
git commit -m "feat: change purchase controller route to /purchases and add process/cancel endpoints"
```

---

## Task 5: Backend — Update Fiscal Libro de Compras

**Files:**
- Modify: `apps/api/src/modules/fiscal/fiscal.service.ts`

- [ ] **Step 1: Rewrite the `libroCompras` method**

Update to use the new fields stored on the PurchaseOrder model instead of computing from items:

```typescript
async libroCompras(from: string, to: string) {
  const fromDate = new Date(from);
  fromDate.setUTCHours(0, 0, 0, 0);
  const toDate = new Date(to);
  toDate.setUTCHours(23, 59, 59, 999);

  const orders = await this.prisma.purchaseOrder.findMany({
    where: {
      status: 'PROCESSED',
      invoiceDate: { gte: fromDate, lte: toDate },
    },
    include: {
      supplier: { select: { id: true, name: true, rif: true, isRetentionAgent: true } },
      payables: { select: { retentionUsd: true } },
    },
    orderBy: { invoiceDate: 'asc' },
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;

  let totalExento = 0;
  let totalBaseImponible = 0;
  let totalCreditoFiscal = 0;
  let totalRetentionIva = 0;
  let totalCompras = 0;

  const rows = orders.map((order, index) => {
    const retentionIva = order.payables.reduce((sum, p) => sum + p.retentionUsd, 0);

    totalExento += order.exemptAmountUsd;
    totalBaseImponible += order.taxableBaseUsd;
    totalCreditoFiscal += order.totalIvaUsd;
    totalRetentionIva += retentionIva;
    totalCompras += order.totalUsd;

    return {
      numero: order.purchaseNumber,
      fecha: order.invoiceDate || order.createdAt,
      numeroControl: order.supplierControlNumber || '',
      numeroFactura: order.supplierInvoiceNumber || '',
      nombreProveedor: order.supplier.name,
      rifProveedor: order.supplier.rif || 'S/R',
      comprasExentas: round2(order.exemptAmountUsd),
      baseImponible: round2(order.taxableBaseUsd),
      creditoFiscal: round2(order.totalIvaUsd),
      comprobanteRetencion: order.retentionVoucherNumber || '',
      retencionIva: round2(retentionIva),
      total: round2(order.totalUsd),
    };
  });

  return {
    periodo: { from: fromDate, to: toDate },
    rows,
    totales: {
      totalOrdenes: orders.length,
      comprasExentas: round2(totalExento),
      baseImponible: round2(totalBaseImponible),
      creditoFiscal: round2(totalCreditoFiscal),
      retencionIva: round2(totalRetentionIva),
      totalCompras: round2(totalCompras),
    },
  };
}
```

Key differences from old version:
- Filters by `status: 'PROCESSED'` (was `'RECEIVED'`)
- Uses `invoiceDate` for date range (was `receivedAt`)
- Reads fiscal totals directly from PurchaseOrder fields (was computing from items)
- Uses `purchaseNumber` for the N° column (was index+1)
- Returns new field names: `supplierControlNumber`, `supplierInvoiceNumber`, `retentionVoucherNumber`

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/fiscal/fiscal.service.ts
git commit -m "feat: update libro compras to use new purchase bill fiscal fields"
```

---

## Task 6: Frontend — Sidebar and Label Renaming

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Rename sidebar labels**

In the sidebar purchases section, change:
```typescript
{ label: 'Facturas de compra', href: '/purchases', icon: <ShoppingCart size={18} /> },
```

Replace `'Ordenes de compra'` with `'Facturas de compra'`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/sidebar.tsx
git commit -m "feat: rename sidebar label from Ordenes de compra to Facturas de compra"
```

---

## Task 7: Frontend — Purchase Bill List Page

**Files:**
- Rewrite: `apps/web/src/app/(dashboard)/purchases/page.tsx`

- [ ] **Step 1: Rewrite the purchases list page**

The page should show:
- Title: "Facturas de Compra"
- `document.title = 'Facturas de Compra | Trinity ERP'`
- Filters: supplier dropdown, status dropdown (PENDIENTE/PROCESADA/CANCELADA)
- Table columns:
  - N° Doc (purchaseNumber formatted as FC-00001)
  - N° Factura proveedor (supplierInvoiceNumber)
  - Proveedor (supplier.name)
  - Fecha (invoiceDate formatted)
  - Total USD (totalUsd)
  - Retención (from payables or IVA retention)
  - Estado (badge: yellow PENDIENTE, green PROCESADA, red CANCELADA)
  - Acciones (ver, cancelar for PENDING)
- Click on row → navigate to `/purchases/${id}`
- Button "Nueva factura de compra" → navigate to `/purchases/new`
- Pagination (20 per page)
- API calls use `/purchases` (new route)

Status badge mapping:
```typescript
const statusLabels = {
  PENDING: 'Pendiente',
  PROCESSED: 'Procesada',
  CANCELLED: 'Cancelada',
};
const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/(dashboard)/purchases/page.tsx
git commit -m "feat: rewrite purchase list page as Facturas de Compra with new statuses"
```

---

## Task 8: Frontend — New Purchase Bill Form

**Files:**
- Rewrite: `apps/web/src/app/(dashboard)/purchases/new/page.tsx`

This is the most complex frontend page. Follow the frontend-design skill before implementing.

- [ ] **Step 1: Build the form header (3 rows × 4 columns grid)**

**Row 1:**
- N° Documento (auto, read-only — shows "Automático" placeholder)
- Proveedor (searchable select from /suppliers?isActive=true)
- Divisa (toggle USD / BS)
- Factor cambiario (number input, auto-loaded from today's rate, editable)

**Row 2:**
- N° Serie proveedor (text input for supplierSerialNumber)
- Almacén (select from /warehouses?isActive=true)
- Fecha factura (date picker, defaults to today)
- Fecha recepción (date picker, defaults to today)

**Row 3:**
- N° Control fiscal (text input for supplierControlNumber)
- N° Factura proveedor (text input for supplierInvoiceNumber)
- Forma de pago: checkbox "Crédito" + number input "Días" (if credit)
- Responsable (auto, read-only — shows current user name)

- [ ] **Step 2: Build the items table**

Columns:
- Ref. Art. (product code — auto-filled on selection)
- Artículo (searchable input — searches /products/search?q=)
- Almacén (shows default warehouse, can override per line — or use header warehouse)
- Cantidad (number input)
- Precio USD (number input — pre-filled with product.costUsd)
- % Dto. (number input — discount percentage per line)
- Importe USD (calculated: (precio × cantidad) × (1 - descuento%))
- % IVA (auto from product.ivaType — display only: 0%, 8%, 16%, 31%)
- Importe Bs (calculated: importe USD × tasa)

Additional features:
- Badge "SERVICIO" for products where product.isService === true
- "+" button to add a new empty row
- "×" button to remove a row
- Product search shows code + name, auto-fills code and costUsd on selection

- [ ] **Step 3: Build the fiscal totals footer (horizontal layout)**

Display horizontally across the bottom:
```
Subtotal $: XX.XX
% Dto. global: [ ]% → -$XX.XX
Sub-Total c/Dto $: XX.XX
Monto Exento $: XX.XX
Total Recargo $: XX.XX
Base IVA $: XX.XX
Total IVA $: XX.XX
Total $: XX.XX
Total Bs: XX.XX
```

If supplier is IVA retention agent (supplier.isRetentionAgent === true):
```
Retención IVA (75%): -$XX.XX
N° Comprobante retención: [text input]
Neto a pagar: $XX.XX
```

Recargo section (surcharge):
- Monto recargo (number input)
- Distribución (select: Proporcional / Equitativo)

All calculations must happen in real-time as the user types.

- [ ] **Step 4: Build the action buttons**

Three buttons at the bottom:
- "Guardar" (primary outline) — saves with status PENDING, calls POST /purchases
- "Procesar factura" (primary solid) — saves and immediately processes:
  1. POST /purchases → get ID
  2. POST /purchases/:id/process
  3. Show price update modal between steps (see Step 5)
- "Cancelar" (secondary) — navigate back to /purchases

- [ ] **Step 5: Build the price update modal**

When "Procesar factura" is clicked:
1. First save the bill (POST /purchases)
2. Fetch suggested prices (GET /purchases/:id/suggested-prices)
3. Show modal with table:
   - Product code
   - Product name
   - Costo anterior (currentCostUsd)
   - Costo nuevo (newCostUsd)
   - Ganancia% (editable input, pre-filled with currentGananciaPct)
   - Precio venta (calculated live: newCost × (1+brega%) × (1+ganancia%) × ivaMultiplier)
4. Two buttons:
   - "Procesar con estos precios" → POST /purchases/:id/process with priceUpdates
   - "Procesar sin cambiar precios" → POST /purchases/:id/process without priceUpdates
5. After processing, navigate to /purchases/:id

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(dashboard)/purchases/new/page.tsx
git commit -m "feat: new purchase bill form with fiscal header, item discounts and totals"
```

---

## Task 9: Frontend — Purchase Bill Detail Page with Tabs

**Files:**
- Rewrite: `apps/web/src/app/(dashboard)/purchases/[id]/page.tsx`
- Delete: `apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx`

- [ ] **Step 1: Build the detail page with tabs**

`document.title` should be dynamic: `FC-${purchaseNumber} - ${supplier.name} | Trinity ERP`

**Tab "Información General":**
- Display all header fields in the same 3×4 grid layout as the form (read-only)
- Table of items with all columns including discounts
- Fiscal totals footer (read-only)
- Action buttons based on status:
  - If PENDING: "Procesar" button (opens price modal then calls POST /purchases/:id/process) + "Cancelar" button (PATCH /purchases/:id/cancel)
  - If PROCESSED: "Ver en libro de compras" link

**Tab "Cuenta por pagar"** (lazy loaded):
- If isCredit and PROCESSED: show linked Payable data from /payables?purchaseOrderId=:id
- Show: amount, retention, net payable, due date, status, payments made

**Tab "Notas Cr/Db"** (lazy loaded):
- Show linked credit/debit notes from /credit-debit-notes?purchaseOrderId=:id
- Table with: number, type (NCC/NDC), date, amount, status

- [ ] **Step 2: Delete the edit page**

Delete `apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx` — editing is no longer needed as a separate page. PENDING bills can be cancelled and recreated.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/purchases/[id]/page.tsx
git rm apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx
git commit -m "feat: purchase bill detail page with Info, CxP and Notas tabs"
```

---

## Task 10: Frontend — Update Libro de Compras Page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/fiscal/libro-compras/page.tsx`

- [ ] **Step 1: Update table columns to match new backend response**

New columns (matching the spec exactly):
| N° | Fecha | N° Control | N° Factura | Proveedor | RIF | Exento | Base Imponible | Crédito Fiscal | N° Comprobante Ret. | Retención IVA | Total |

Map from API response:
- N° → `row.numero` (purchaseNumber)
- Fecha → `row.fecha` (invoiceDate)
- N° Control → `row.numeroControl`
- N° Factura → `row.numeroFactura`
- Proveedor → `row.nombreProveedor`
- RIF → `row.rifProveedor`
- Exento → `row.comprasExentas`
- Base Imponible → `row.baseImponible`
- Crédito Fiscal → `row.creditoFiscal`
- N° Comprobante Ret. → `row.comprobanteRetencion`
- Retención IVA → `row.retencionIva`
- Total → `row.total`

Totals row at the bottom for all numeric columns.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/(dashboard)/fiscal/libro-compras/page.tsx
git commit -m "feat: update libro de compras with new purchase bill fiscal fields"
```

---

## Task 11: Update All API Path References

**Files:**
- Modify: Multiple frontend files that reference `/purchase-orders`

- [ ] **Step 1: Search and replace all `/purchase-orders` references to `/purchases`**

Files to check and update:
- `apps/web/src/app/(dashboard)/purchases/reorder/page.tsx`
- `apps/web/src/app/(dashboard)/purchases/analysis/page.tsx`
- `apps/web/src/app/(dashboard)/credit-debit-notes/new/page.tsx`
- `apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/credit-debit-notes/page.tsx`
- `apps/web/src/app/(dashboard)/payables/page.tsx`
- `apps/web/src/app/(dashboard)/payables/[id]/page.tsx`
- Any other file that calls the old purchase-orders API

Also update label references: "Orden de compra" → "Factura de compra", "orden" → "factura de compra", "Recibir orden" → "Procesar factura".

- [ ] **Step 2: Commit**

```bash
git add apps/web/
git commit -m "feat: update all API paths from /purchase-orders to /purchases and rename labels"
```

---

## Task 12: Build, Test, and Verify

- [ ] **Step 1: Build API**

```bash
cd apps/api && npx pnpm build
```

Fix any TypeScript errors.

- [ ] **Step 2: Build Web**

```bash
cd apps/web && npx pnpm build
```

Fix any TypeScript/Next.js build errors.

- [ ] **Step 3: Start API and test endpoints**

```bash
npx kill-port 4000 3000
cd apps/api && npx pnpm start:dev &
```

Test with curl:
1. Create a purchase bill with 2 products and 1 service (flete):
```bash
curl -X POST http://localhost:4000/purchases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

2. Process the bill:
```bash
curl -X POST http://localhost:4000/purchases/:id/process \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

3. Check fiscal libro de compras:
```bash
curl http://localhost:4000/fiscal/libro-compras?from=2026-05-01&to=2026-05-31 \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 4: Start Web and test frontend**

```bash
cd apps/web && npx pnpm dev &
```

Manual verification:
1. Navigate to /purchases — verify "Facturas de compra" title and new status badges
2. Click "Nueva factura de compra" → verify form with 4-column grid header
3. Create a bill with 2 products + 1 service (flete), apply line discount + global discount
4. Verify fiscal totals calculate correctly in real-time
5. Process the bill → verify price update modal appears
6. Verify inventory updated (check /inventory/stock)
7. Verify bill appears in /fiscal/libro-compras with all fiscal fields

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: redesign purchase module as purchase bill with simplified flow and fiscal book"
git push origin main
```

---

## Task 13: Update Documentation

**Files:**
- Modify: `PROGRESS.md`
- Modify: `PROJECT.md`

- [ ] **Step 1: Add session entry to PROGRESS.md**

Add at the top of PROGRESS.md:

```markdown
## Sesion 40 — Rediseño módulo de compras como Factura de Compra

### Migración de base de datos
- `20260522200000_redesign_purchase_bill_module`: Simplifica PurchaseStatus (PENDING/PROCESSED/CANCELLED), agrega campos fiscales a PurchaseOrder (purchaseNumber, supplierSerialNumber, supplierInvoiceNumber, discountGlobalPct/Usd/Bs, subtotalUsd/Bs, exemptAmountUsd/Bs, taxableBaseUsd/Bs, totalIvaUsd/Bs, totalSurchargeUsd/Bs, retentionVoucherNumber, responsibleId, processedAt, warehouseId), agrega campos de descuento a PurchaseOrderItem (discountPct/Usd/Bs, netCostUsd/Bs)

### Schema
- PurchaseStatus: simplificado de DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED a PENDING/PROCESSED/CANCELLED
- PurchaseOrder: 18 nuevos campos fiscales y de control
- PurchaseOrderItem: 5 nuevos campos de descuento por línea

### Backend (NestJS)
- **Ruta cambiada**: `/purchase-orders` → `/purchases`
- **POST /purchases**: Crear factura de compra con purchaseNumber automático (SELECT FOR UPDATE), descuentos por línea, descuento global, cálculo de totales fiscales (subtotal, exento, base imponible, IVA, recargo)
- **POST /purchases/:id/process**: Procesar factura — actualiza inventario (solo items no-servicio), crea StockMovement, actualiza costos y precios de venta, crea CxP si es crédito con retenciones IVA/ISLR
- **PATCH /purchases/:id/cancel**: Cancelar solo si PENDING
- **GET /fiscal/libro-compras**: Usa campos precalculados del modelo, filtra por invoiceDate y status PROCESSED, usa purchaseNumber como N°
- Eliminados estados intermedios DRAFT/SENT/PARTIAL

### Frontend (Next.js)
- **Sidebar**: "Órdenes de compra" → "Facturas de compra"
- **Lista /purchases**: Columnas N° Doc, N° Factura proveedor, Proveedor, Fecha, Total USD, Retención, Estado (Pendiente/Procesada/Cancelada)
- **Nueva /purchases/new**: Formulario con grid 3×4 (datos fiscales, proveedor, fechas, forma de pago), tabla de items con descuentos por línea, pie de totales fiscal (subtotal, dto global, exento, base IVA, total IVA, recargo, total USD/Bs, retención IVA)
- **Detalle /purchases/[id]**: Tabs Información General, Cuenta por pagar, Notas Cr/Db
- **Libro de compras**: Columnas actualizadas (N°, Fecha, N° Control, N° Factura, Proveedor, RIF, Exento, Base Imponible, Crédito Fiscal, N° Comprobante Retención, Retención IVA, Total)
```

- [ ] **Step 2: Update PROJECT.md**

Update the purchase module description in the relevant session section.

- [ ] **Step 3: Commit and push**

```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: update PROGRESS.md and PROJECT.md for purchase bill redesign"
git push origin main
```

---

## Deployment

After all tasks are complete and pushed:

```bash
ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```
