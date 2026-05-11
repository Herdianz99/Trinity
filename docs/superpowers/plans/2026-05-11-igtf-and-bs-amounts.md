# IGTF Tax & Standardize Bs Amounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement IGTF (Impuesto a las Grandes Transacciones Financieras) tax on foreign-currency payments and standardize Bs amount storage across all invoice-related tables.

**Architecture:** Add IGTF config fields to CompanyConfig, Bs-amount fields to Invoice/InvoiceItem/Payment, and IGTF amount fields to Invoice/Payment. Backend calculates IGTF at payment time when the payment method is CASH_USD or ZELLE. Frontend shows IGTF in the POS payment modal, invoice detail, PDF, and libro de ventas.

**Tech Stack:** Prisma (migration), NestJS (backend logic), Next.js (frontend UI), PDFKit (PDF generation)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/database/prisma/schema.prisma` | Add IGTF + Bs fields to models |
| Modify | `apps/api/src/modules/company-config/dto/update-company-config.dto.ts` | Add IGTF DTO fields |
| Modify | `apps/api/src/modules/invoices/invoices.service.ts` | IGTF calculation + Bs amounts on create & pay |
| Modify | `apps/api/src/modules/invoices/invoice-pdf.service.ts` | IGTF line in PDF |
| Modify | `apps/api/src/modules/fiscal/fiscal.service.ts` | IGTF column in libro de ventas |
| Modify | `apps/web/src/app/(dashboard)/sales/pos/page.tsx` | IGTF in payment modal + totals |
| Modify | `apps/web/src/app/(dashboard)/sales/invoices/page.tsx` | IGTF in invoice detail modal |
| Modify | `apps/web/src/app/(dashboard)/config/page.tsx` | IGTF settings toggle + percentage |
| Modify | `apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx` | IGTF column in sales book |

---

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:120-138` (CompanyConfig)
- Modify: `packages/database/prisma/schema.prisma:489-520` (Invoice)
- Modify: `packages/database/prisma/schema.prisma:522-533` (InvoiceItem)
- Modify: `packages/database/prisma/schema.prisma:535-545` (Payment)

- [ ] **Step 1: Add IGTF fields to CompanyConfig**

In `packages/database/prisma/schema.prisma`, add these two fields to the `CompanyConfig` model after line 136 (`islrRetentionPct`):

```prisma
model CompanyConfig {
  id                      String   @id @default("singleton")
  companyName             String   @default("Trinity")
  rif                     String?
  address                 String?
  phone                   String?
  email                   String?
  bregaGlobalPct          Float    @default(0)
  defaultGananciaPct      Float    @default(0)
  defaultGananciaMayorPct Float    @default(0)
  defaultWarehouseId      String?
  invoicePrefix           String   @default("FAC")
  creditAuthPassword      String?
  quotationValidityDays   Int      @default(30)
  overdueWarningDays      Int      @default(3)
  ivaRetentionPct         Float    @default(75)
  islrRetentionPct        Float    @default(0)
  isIGTFContributor       Boolean  @default(false)
  igtfPct                 Float    @default(3)
  updatedAt               DateTime @updatedAt
}
```

- [ ] **Step 2: Add IGTF + Bs fields to Invoice**

Add these fields to the `Invoice` model after `totalBs` (line 503):

```prisma
model Invoice {
  id             String        @id @default(cuid())
  number         String        @unique
  fiscalNumber   String?
  controlNumber  String?
  cashRegisterId String
  cashRegister   CashRegister  @relation(fields: [cashRegisterId], references: [id])
  customerId     String?
  customer       Customer?     @relation(fields: [customerId], references: [id])
  status         InvoiceStatus @default(DRAFT)
  type           InvoiceType   @default(SALE)
  subtotalUsd    Float         @default(0)
  ivaUsd         Float         @default(0)
  totalUsd       Float         @default(0)
  totalBs        Float         @default(0)
  exchangeRate   Float         @default(0)
  igtfUsd        Float         @default(0)
  igtfBs         Float         @default(0)
  subtotalBs     Float         @default(0)
  ivaBs          Float         @default(0)
  isCredit       Boolean       @default(false)
  creditDays     Int           @default(0)
  dueDate        DateTime?
  paidAt         DateTime?
  notes          String?
  items          InvoiceItem[]
  payments       Payment[]
  receivables    Receivable[]
  printJobs      PrintJob[]
  createdById    String
  sellerId       String?
  lockedById     String?
  lockedAt       DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}
```

- [ ] **Step 3: Add Bs fields to InvoiceItem**

```prisma
model InvoiceItem {
  id           String  @id @default(cuid())
  invoiceId    String
  invoice      Invoice @relation(fields: [invoiceId], references: [id])
  productId    String
  productName  String
  quantity     Float
  unitPrice    Float
  ivaType      IvaType
  ivaAmount    Float
  totalUsd     Float
  unitPriceBs  Float   @default(0)
  ivaAmountBs  Float   @default(0)
  totalBs      Float   @default(0)
}
```

- [ ] **Step 4: Add IGTF fields to Payment**

```prisma
model Payment {
  id           String        @id @default(cuid())
  invoiceId    String
  invoice      Invoice       @relation(fields: [invoiceId], references: [id])
  method       PaymentMethod
  amountUsd    Float
  amountBs     Float
  exchangeRate Float
  reference    String?
  igtfUsd      Float         @default(0)
  igtfBs       Float         @default(0)
  createdAt    DateTime      @default(now())
}
```

- [ ] **Step 5: Run the migration**

```bash
cd packages/database && npx prisma migrate dev --name add_igtf_and_bs_amounts
```

Expected: Migration creates successfully, Prisma client regenerated.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add IGTF and Bs amount fields to schema"
```

---

### Task 2: Backend — CompanyConfig DTO Update

**Files:**
- Modify: `apps/api/src/modules/company-config/dto/update-company-config.dto.ts`

- [ ] **Step 1: Add IGTF fields to the DTO**

Add these two fields to `UpdateCompanyConfigDto` after `islrRetentionPct`:

```typescript
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isIGTFContributor?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  igtfPct?: number;
```

Also add `IsBoolean` to the import from `class-validator`:

```typescript
import { IsString, IsNumber, IsOptional, IsEmail, IsBoolean } from 'class-validator';
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/company-config/dto/update-company-config.dto.ts
git commit -m "feat: add IGTF fields to CompanyConfig DTO"
```

---

### Task 3: Backend — Invoice Creation with Bs Amounts

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts:145-270` (create method)
- Modify: `apps/api/src/modules/invoices/invoices.service.ts:522-608` (updateItems method)

- [ ] **Step 1: Update `create()` to save Bs amounts on InvoiceItems**

In `invoices.service.ts`, in the `create()` method, update the item building loop (around lines 191-213) to include Bs fields. Replace the items loop and invoice creation:

```typescript
    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Producto ${item.productId} no encontrado`);

      const priceWithIva = item.unitPrice ?? product.priceDetal;
      const ivaRate = IVA_RATES[product.ivaType] || 0;
      const baseUnitPrice = priceWithIva / (1 + ivaRate);
      const lineSubtotal = baseUnitPrice * item.quantity;
      const ivaAmount = lineSubtotal * ivaRate;

      subtotalUsd += lineSubtotal;
      ivaBreakdown[product.ivaType] = (ivaBreakdown[product.ivaType] || 0) + ivaAmount;

      itemsData.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: baseUnitPrice,
        ivaType: product.ivaType,
        ivaAmount,
        totalUsd: lineSubtotal + ivaAmount,
        unitPriceBs: Math.round(baseUnitPrice * rate.rate * 100) / 100,
        ivaAmountBs: Math.round(ivaAmount * rate.rate * 100) / 100,
        totalBs: Math.round((lineSubtotal + ivaAmount) * rate.rate * 100) / 100,
      });
    }
```

Then in the `tx.invoice.create` data block (around line 246), add the Bs fields:

```typescript
      return tx.invoice.create({
        data: {
          number: invoiceNumber,
          cashRegisterId,
          customerId: dto.customerId || null,
          status,
          subtotalUsd: Math.round(subtotalUsd * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          totalBs: Math.round(totalBs * 100) / 100,
          subtotalBs: Math.round(subtotalUsd * rate.rate * 100) / 100,
          ivaBs: Math.round(totalIva * rate.rate * 100) / 100,
          exchangeRate: rate.rate,
          notes: dto.notes,
          createdById: user.id,
          sellerId: isSeller ? user.id : null,
          items: { create: itemsData },
        },
        include: {
          items: true,
          customer: true,
          cashRegister: { select: { id: true, code: true, name: true } },
        },
      });
```

- [ ] **Step 2: Update `updateItems()` the same way**

Apply the same changes to the `updateItems()` method (lines 522-608). Add Bs fields to itemsData and to the invoice update data, same pattern as Step 1.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts
git commit -m "feat: save Bs amounts on invoice creation and update"
```

---

### Task 4: Backend — IGTF Calculation on Payment

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts:272-487` (pay method)

- [ ] **Step 1: Add IGTF logic to the `pay()` method**

The IGTF constant and logic should be added inside the `pay()` method. Right after getting the config and warehouse (around line 330), add IGTF calculation before the transaction block.

First, define the IGTF methods constant at the top of the file (after the `IVA_RATES` constant, around line 21):

```typescript
const IGTF_METHODS: string[] = ['CASH_USD', 'ZELLE'];
```

Then, inside `pay()`, right before the `// Execute everything in transaction` comment (line 345), fetch config and calculate IGTF:

```typescript
    // IGTF calculation
    const igtfConfig = await this.prisma.companyConfig.findFirst();
    const isIGTFContributor = igtfConfig?.isIGTFContributor || false;
    const igtfPct = igtfConfig?.igtfPct || 3;
    let invoiceIgtfUsd = 0;
    let invoiceIgtfBs = 0;

    if (isIGTFContributor && invoice.igtfUsd === 0) {
      // Sum all foreign-currency payment amounts
      const foreignTotal = dto.payments
        .filter(p => IGTF_METHODS.includes(p.method))
        .reduce((sum, p) => sum + p.amountUsd, 0);

      if (foreignTotal > 0) {
        invoiceIgtfUsd = Math.round(foreignTotal * (igtfPct / 100) * 100) / 100;
        invoiceIgtfBs = Math.round(invoiceIgtfUsd * invoice.exchangeRate * 100) / 100;
      }
    }
```

- [ ] **Step 2: Update payment creation in the transaction to include IGTF per payment**

Inside the transaction, update the payment creation loop (around lines 348-372):

```typescript
      // Create payments
      for (const payment of dto.payments) {
        let paymentIgtfUsd = 0;
        let paymentIgtfBs = 0;

        if (isIGTFContributor && invoice.igtfUsd === 0 && IGTF_METHODS.includes(payment.method)) {
          paymentIgtfUsd = Math.round(payment.amountUsd * (igtfPct / 100) * 100) / 100;
          paymentIgtfBs = Math.round(paymentIgtfUsd * invoice.exchangeRate * 100) / 100;
        }

        await tx.payment.create({
          data: {
            invoiceId: id,
            method: payment.method,
            amountUsd: payment.amountUsd,
            amountBs: payment.amountBs,
            exchangeRate: invoice.exchangeRate,
            reference: payment.reference,
            igtfUsd: paymentIgtfUsd,
            igtfBs: paymentIgtfBs,
          },
        });

        // Create Receivable for Cashea/Crediagro
        if (payment.method === 'CASHEA' || payment.method === 'CREDIAGRO') {
          await tx.receivable.create({
            data: {
              type: 'FINANCING_PLATFORM',
              platformName: payment.method === 'CASHEA' ? 'Cashea' : 'Crediagro',
              invoiceId: id,
              amountUsd: payment.amountUsd,
              amountBs: payment.amountBs,
              exchangeRate: invoice.exchangeRate,
            },
          });
        }
      }
```

- [ ] **Step 3: Update the invoice status update to include IGTF totals**

In the invoice update block (around lines 428-447), add IGTF fields and recalculate totalUsd/totalBs:

```typescript
      // Update invoice status and release lock
      const newStatus = dto.isCredit ? 'CREDIT' : 'PAID';
      const newTotalUsd = invoiceIgtfUsd > 0
        ? Math.round((invoice.totalUsd + invoiceIgtfUsd) * 100) / 100
        : invoice.totalUsd;
      const newTotalBs = invoiceIgtfUsd > 0
        ? Math.round((invoice.totalBs + invoiceIgtfBs) * 100) / 100
        : invoice.totalBs;

      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status: newStatus,
          isCredit: dto.isCredit || false,
          creditDays: dto.creditDays || 0,
          dueDate: dto.isCredit
            ? new Date(Date.now() + (dto.creditDays || 30) * 86400000)
            : null,
          paidAt: new Date(),
          lockedById: null,
          lockedAt: null,
          igtfUsd: invoiceIgtfUsd,
          igtfBs: invoiceIgtfBs,
          totalUsd: newTotalUsd,
          totalBs: newTotalBs,
        },
        include: {
          items: true,
          payments: true,
          customer: true,
          receivables: true,
        },
      });
```

- [ ] **Step 4: Update credit receivable to use updated total**

In the credit receivable creation (around lines 376-392), use the potentially updated totals:

```typescript
      // Create credit receivable
      if (dto.isCredit && invoice.customerId) {
        const creditDays = dto.creditDays || invoice.customer?.creditDays || 30;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + creditDays);

        await tx.receivable.create({
          data: {
            type: 'CUSTOMER_CREDIT',
            customerId: invoice.customerId,
            invoiceId: id,
            amountUsd: newTotalUsd,
            amountBs: newTotalBs,
            exchangeRate: invoice.exchangeRate,
            dueDate,
          },
        });
      }
```

Note: `newTotalUsd` and `newTotalBs` must be calculated BEFORE the credit receivable block. Move the IGTF total calculation up, before the credit receivable section.

- [ ] **Step 5: Update payment validation to account for IGTF**

Update the payment total validation (around line 290) to NOT include IGTF in the required amount — IGTF is an extra charge ON TOP of the invoice total that the customer pays additionally. The validation should stay as is, comparing against `invoice.totalUsd` (pre-IGTF):

```typescript
    // Validate payment total (against pre-IGTF total)
    const totalPaidUsd = dto.payments.reduce((s, p) => s + p.amountUsd, 0);

    if (!dto.isCredit && totalPaidUsd < invoice.totalUsd - 0.01) {
      throw new BadRequestException(
        `El monto pagado ($${totalPaidUsd.toFixed(2)}) es menor al total ($${invoice.totalUsd.toFixed(2)})`,
      );
    }
```

This stays the same. The IGTF is calculated after and added to the total automatically.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts
git commit -m "feat: IGTF calculation on payment processing"
```

---

### Task 5: Backend — Invoice PDF with IGTF

**Files:**
- Modify: `apps/api/src/modules/invoices/invoice-pdf.service.ts:128-162`

- [ ] **Step 1: Add IGTF line between IVA and Total in PDF**

After the IVA breakdown loop (around line 142), add the IGTF line if applicable. Insert this block between the IVA entries and the total separator line:

```typescript
      // IGTF line (if applicable)
      if (invoice.igtfUsd > 0) {
        doc.text(`IGTF (3%):`, totalsX, y);
        doc.text(`$${invoice.igtfUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' });
        y += 14;
      }
```

- [ ] **Step 2: Update Total Bs line to also show IGTF Bs**

After the TOTAL USD line (around line 150), update the Total Bs line and add IGTF Bs if applicable:

```typescript
      doc.fontSize(9).font('Helvetica');
      doc.text('TOTAL Bs:', totalsX, y); doc.text(`Bs ${invoice.totalBs.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;
      if (invoice.igtfUsd > 0) {
        doc.text(`IGTF Bs:`, totalsX, y); doc.text(`Bs ${invoice.igtfBs.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;
      }
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/invoices/invoice-pdf.service.ts
git commit -m "feat: show IGTF in invoice PDF"
```

---

### Task 6: Backend — Libro de Ventas with IGTF Column

**Files:**
- Modify: `apps/api/src/modules/fiscal/fiscal.service.ts:16-119`

- [ ] **Step 1: Add IGTF tracking to libroVentas**

In the `libroVentas()` method, add IGTF accumulator and include it in each row and totals.

Add a total IGTF accumulator after line 41:

```typescript
    let totalIgtf = 0;
```

Inside the `invoices.map()` callback, add the IGTF amount from the invoice (after line 82):

```typescript
      totalIgtf += inv.igtfUsd;
```

Add `igtf` to each row return object (after `ivaEspecial`, around line 99):

```typescript
        igtf: inv.igtfUsd,
```

Add `igtf` to the totales return object (after `ivaEspecial`, around line 115):

```typescript
        igtf: round2(totalIgtf),
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/fiscal/fiscal.service.ts
git commit -m "feat: add IGTF column to libro de ventas"
```

---

### Task 7: Frontend — Settings Page IGTF Configuration

**Files:**
- Modify: `apps/web/src/app/(dashboard)/config/page.tsx`

- [ ] **Step 1: Add IGTF fields to the CompanyConfig interface**

Add to the `CompanyConfig` interface (around line 6):

```typescript
interface CompanyConfig {
  companyName: string;
  rif: string;
  address: string;
  phone: string;
  email: string;
  bregaGlobalPct: number;
  defaultGananciaPct: number;
  defaultGananciaMayorPct: number;
  defaultWarehouseId: string;
  invoicePrefix: string;
  quotationValidityDays: number;
  overdueWarningDays: number;
  ivaRetentionPct: number;
  islrRetentionPct: number;
  isIGTFContributor: boolean;
  igtfPct: number;
}
```

- [ ] **Step 2: Update default state**

Update the `useState` initial state (around line 24) to include the new fields:

```typescript
  const [config, setConfig] = useState<CompanyConfig>({
    companyName: '',
    rif: '',
    address: '',
    phone: '',
    email: '',
    bregaGlobalPct: 0,
    defaultGananciaPct: 0,
    defaultGananciaMayorPct: 0,
    defaultWarehouseId: '',
    invoicePrefix: 'FAC',
    quotationValidityDays: 30,
    overdueWarningDays: 3,
    ivaRetentionPct: 75,
    islrRetentionPct: 0,
    isIGTFContributor: false,
    igtfPct: 3,
  });
```

- [ ] **Step 3: Update fetchConfig to include IGTF fields**

In `fetchConfig()` (around line 87), add the new fields:

```typescript
          isIGTFContributor: data.isIGTFContributor || false,
          igtfPct: data.igtfPct ?? 3,
```

- [ ] **Step 4: Update handleSave to send IGTF fields**

In `handleSave()` (around line 136), add the new fields to the body:

```typescript
          isIGTFContributor: config.isIGTFContributor,
          igtfPct: Number(config.igtfPct),
```

- [ ] **Step 5: Add IGTF section to the UI**

Add a new card section after the "Parametros Financieros" card (after the closing `</div>` of that card, around line 451). Insert before the "Precios por defecto" card:

```tsx
          {/* IGTF Tax Configuration */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Impuestos - IGTF</h2>
            <p className="text-sm text-slate-400 mb-4">
              Impuesto a las Grandes Transacciones Financieras. Aplica 3% a pagos en divisas (Efectivo USD, Zelle).
            </p>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.isIGTFContributor}
                  onChange={(e) => handleChange('isIGTFContributor', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500/40"
                />
                <div>
                  <span className="text-sm text-white">Contribuyente IGTF</span>
                  <p className="text-xs text-slate-500">Aplica IGTF a pagos en divisas (Efectivo USD y Zelle)</p>
                </div>
              </label>
              {config.isIGTFContributor && (
                <div className="w-48">
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Porcentaje IGTF (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={config.igtfPct}
                    onChange={(e) => handleChange('igtfPct', e.target.value)}
                    className="input-field"
                  />
                  <p className="text-xs text-slate-500 mt-1">Actualmente 3% por ley venezolana</p>
                </div>
              )}
            </div>
          </div>
```

- [ ] **Step 6: Update handleChange to support boolean values**

The existing `handleChange` function (line 208) accepts `string | number`. Update it to also accept `boolean`:

```typescript
  function handleChange(field: keyof CompanyConfig, value: string | number | boolean) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/config/page.tsx
git commit -m "feat: add IGTF settings toggle in config page"
```

---

### Task 8: Frontend — POS Payment Modal with IGTF

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx`

- [ ] **Step 1: Add IGTF state and config fetch**

Add new state variables after the existing state declarations (around line 98):

```typescript
  const [companyConfig, setCompanyConfig] = useState<{ isIGTFContributor: boolean; igtfPct: number } | null>(null);
```

Fetch company config on mount. Add to the existing `useEffect` that fetches exchange rate (around line 132):

```typescript
  useEffect(() => {
    fetch('/api/proxy/exchange-rate/today')
      .then(r => r.json())
      .then(data => {
        if (data?.rate) setExchangeRate(data.rate);
      });
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data?.id) setUserId(data.id);
        if (data?.role) setUserRole(data.role);
        if (data?.permissions) setUserPermissions(data.permissions || []);
      });
    fetch('/api/proxy/config')
      .then(r => r.json())
      .then(data => {
        if (data) setCompanyConfig({
          isIGTFContributor: data.isIGTFContributor || false,
          igtfPct: data.igtfPct ?? 3,
        });
      });
  }, []);
```

- [ ] **Step 2: Calculate IGTF in real-time based on payment methods**

Add IGTF calculation right after the `remaining` calculation (around line 336):

```typescript
  // IGTF calculation
  const igtfMethods = ['CASH_USD', 'ZELLE'];
  const foreignPaymentsTotal = payments
    .filter(p => igtfMethods.includes(p.method))
    .reduce((sum, p) => sum + p.amountUsd, 0);
  const isIGTFApplicable = companyConfig?.isIGTFContributor && foreignPaymentsTotal > 0;
  const igtfUsd = isIGTFApplicable
    ? Math.round(foreignPaymentsTotal * ((companyConfig?.igtfPct || 3) / 100) * 100) / 100
    : 0;
  const igtfBs = Math.round(igtfUsd * exchangeRate * 100) / 100;
  const grandTotalUsd = totalUsd + igtfUsd;
  const grandTotalBs = totalBs + igtfBs;
```

- [ ] **Step 3: Update the payment modal header to show IGTF**

Update the payment modal header (around lines 1082-1086) to show grand total with IGTF:

```tsx
                <div>
                  <h2 className="text-lg font-bold text-white">Cobrar Factura</h2>
                  <div className="flex gap-4 mt-1">
                    <span className="text-sm text-green-400 font-medium">${grandTotalUsd.toFixed(2)} USD</span>
                    <span className="text-sm text-slate-400">Bs {grandTotalBs.toFixed(2)}</span>
                    <span className="text-xs text-slate-500">Tasa: {exchangeRate.toFixed(2)}</span>
                  </div>
                </div>
```

- [ ] **Step 4: Add IGTF summary between the payment lines and the "Pendiente" display**

After the payments list (around line 1157) and before the "Pendiente por cobrar" card (line 1159), add an invoice summary section:

```tsx
              {/* Invoice Summary */}
              <div className="card p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Subtotal</span>
                  <div className="text-right">
                    <span className="text-white">${subtotalUsd.toFixed(2)}</span>
                    <span className="text-slate-500 text-xs ml-2">Bs {(subtotalUsd * exchangeRate).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">IVA</span>
                  <div className="text-right">
                    <span className="text-white">${totalIva.toFixed(2)}</span>
                    <span className="text-slate-500 text-xs ml-2">Bs {(totalIva * exchangeRate).toFixed(2)}</span>
                  </div>
                </div>
                {igtfUsd > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-400">IGTF ({companyConfig?.igtfPct || 3}%)</span>
                    <div className="text-right">
                      <span className="text-amber-400">${igtfUsd.toFixed(2)}</span>
                      <span className="text-amber-400/60 text-xs ml-2">Bs {igtfBs.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-slate-700/50 pt-1">
                  <span className="text-slate-300">Total</span>
                  <div className="text-right">
                    <span className="text-green-400">${grandTotalUsd.toFixed(2)}</span>
                    <span className="text-slate-400 text-xs ml-2">Bs {grandTotalBs.toFixed(2)}</span>
                  </div>
                </div>
              </div>
```

- [ ] **Step 5: Update "Pendiente por cobrar" to use grandTotal**

Update the remaining calculation and display to use grandTotal (the `remaining` variable around line 336 and the display around line 1159):

Update the `remaining` calculation:

```typescript
  const remaining = grandTotalUsd - totalPaidUsd;
```

The display already uses `remaining` so it will automatically update.

- [ ] **Step 6: Update payment validation in handleConfirmPayment**

The payment validation in `handleConfirmPayment` (around line 456) should check against `grandTotalUsd`:

```typescript
    if (!isCredit && remaining > 0.01) {
```

This already uses `remaining` which now includes IGTF, so no change needed here. But the `addPayment` function (line 338) needs to use `remaining` which now accounts for IGTF — this already works because `remaining` is recalculated reactively.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/sales/pos/page.tsx
git commit -m "feat: show IGTF in POS payment modal"
```

---

### Task 9: Frontend — Invoice Detail Modal with IGTF

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/invoices/page.tsx:229-306`

- [ ] **Step 1: Update the totals section in the detail modal**

Update the totals card (around lines 277-284) to include IGTF:

```tsx
              {/* Totals */}
              <div className="card p-4">
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">Subtotal</span><span className="text-white">${detail.subtotalUsd?.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm mb-1"><span className="text-slate-400">IVA</span><span className="text-white">${detail.ivaUsd?.toFixed(2)}</span></div>
                {detail.igtfUsd > 0 && (
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-amber-400">IGTF (3%)</span>
                    <span className="text-amber-400">${detail.igtfUsd?.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-slate-700/50 pt-2 mt-2">
                  <span className="text-slate-300">Total USD</span><span className="text-green-400">${detail.totalUsd?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm"><span className="text-slate-400">Total Bs</span><span className="text-slate-300">Bs {detail.totalBs?.toFixed(2)}</span></div>
              </div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/sales/invoices/page.tsx
git commit -m "feat: show IGTF in invoice detail modal"
```

---

### Task 10: Frontend — Libro de Ventas with IGTF Column

**Files:**
- Modify: `apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx`

- [ ] **Step 1: Add IGTF to VentaRow and Totales interfaces**

Add `igtf` field to both interfaces (around lines 6-33):

```typescript
interface VentaRow {
  numero: number;
  fecha: string;
  numeroFactura: string;
  numeroControl: string;
  rifCliente: string;
  nombreCliente: string;
  baseImponibleExenta: number;
  baseImponibleReducida: number;
  baseImponibleGeneral: number;
  baseImponibleEspecial: number;
  ivaReducido: number;
  ivaGeneral: number;
  ivaEspecial: number;
  igtf: number;
  totalFactura: number;
}

interface Totales {
  totalFacturas: number;
  baseImponibleExenta: number;
  baseImponibleReducida: number;
  baseImponibleGeneral: number;
  baseImponibleEspecial: number;
  ivaReducido: number;
  ivaGeneral: number;
  ivaEspecial: number;
  igtf: number;
  totalVentas: number;
}
```

- [ ] **Step 2: Add IGTF column to the HTML table**

Add an IGTF header column between IVA 31% and Total (around line 247):

```tsx
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">IGTF</th>
```

Add the data cell in each row (after `ivaEspecial`, around line 269):

```tsx
                        <td className="px-3 py-2 text-right text-amber-400/80 tabular-nums">{formatVe(r.igtf)}</td>
```

Add the totals cell (after `ivaEspecial` total, around line 283):

```tsx
                        <td className="px-3 py-2.5 text-right text-amber-400 font-bold tabular-nums">{formatVe(totales.igtf)}</td>
```

Update all `colSpan` values from `14` to `15` for the empty row and totals row.

- [ ] **Step 3: Add IGTF column to the print/export PDF**

In the `exportPdf()` function, add IGTF to the table:

In the header row (around line 159), add after IVA 31%:

```html
            <th>IGTF</th>
```

In the data rows (around line 107), add:

```html
        <td class="num">${formatVe(r.igtf)}</td>
```

In the totals row (around line 121), add:

```html
        <td class="num"><strong>${formatVe(totales.igtf)}</strong></td>
```

Update `colspan` from `6` to `6` (stays same, it's the label columns).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/fiscal/libro-ventas/page.tsx
git commit -m "feat: add IGTF column to libro de ventas"
```

---

### Task 11: Build, Test & Final Commit

- [ ] **Step 1: Build and verify**

```bash
cd apps/api && npx nest build
cd apps/web && npx next build
```

Expected: Both build without errors.

- [ ] **Step 2: Start services and test**

```bash
cd /c/Users/Intel\ Core\ I5/Desktop/Trinity
docker compose up -d
cd apps/api && npm run start:dev &
cd apps/web && npm run dev &
```

- [ ] **Step 3: Test scenario 1 — Enable IGTF in settings**

1. Login as admin@trinity.com
2. Go to /config
3. Enable "Contribuyente IGTF" toggle
4. Verify percentage shows 3%
5. Save configuration

- [ ] **Step 4: Test scenario 2 — Invoice with mixed payments**

1. Go to POS
2. Create a cart with items totaling ~$100
3. Click "Cobrar"
4. Add $60 Zelle + $40 Pago Movil
5. Verify: IGTF shows $1.80 (3% of $60 Zelle only)
6. Verify: Total updates to $101.80
7. Confirm payment
8. Verify invoice detail shows IGTF
9. Verify PDF shows IGTF line

- [ ] **Step 5: Test scenario 3 — Invoice with only Bs payments**

1. Create another cart ~$50
2. Pay with Pago Movil $50
3. Verify: NO IGTF shown (Pago Movil is not a foreign currency method)
4. Confirm payment

- [ ] **Step 6: Test scenario 4 — Multiple foreign currency payments**

1. Create cart ~$100
2. Pay with $50 Zelle + $50 Efectivo USD
3. Verify: IGTF = $3.00 (3% of $100 total foreign payments)
4. Verify: Total = $103.00

- [ ] **Step 7: Verify libro de ventas**

1. Go to Fiscal > Libro de Ventas
2. Generate for current month
3. Verify IGTF column appears
4. Verify totals include IGTF

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: IGTF tax implementation and standardize Bs amounts in database"
git push origin main
```

- [ ] **Step 9: Update PROGRESS.md and PROJECT.md**

Add a new session entry to PROGRESS.md documenting:
- IGTF implementation
- Bs amounts standardization in database
- Settings UI for IGTF
- PDF and libro de ventas IGTF support

Update PROJECT.md:
- Change the "Precios" decision note from "Nunca se guarda Bs en la DB" to reflect that Bs amounts are now stored for historical accuracy
- Add IGTF to the financial features list
