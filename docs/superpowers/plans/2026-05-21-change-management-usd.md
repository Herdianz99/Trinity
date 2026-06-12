# Change Management for USD Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a customer pays with USD bills exceeding the invoice total, calculate change (vuelto) in Bs at the day's exchange rate, record it in the invoice, and create a cash outflow (egreso) in the active cash session.

**Architecture:** Add `totalPaidUsd` and `changeBs` fields to Invoice, plus `changeAmountBs` and `changeMethodId` to Payment. Backend calculates change when USD payments exceed the invoice total and creates a negative cash movement entry. Frontend shows a real-time change calculator in the POS payment modal with a required change method selector.

**Tech Stack:** Prisma (PostgreSQL), NestJS, Next.js 14 App Router, Tailwind CSS

---

### Task 1: Prisma Migration — Add change fields to Payment and Invoice

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (lines 657-699 Invoice model, lines 723-736 Payment model)
- Create: migration via `npx prisma migrate dev`

- [ ] **Step 1: Add fields to Payment model in schema.prisma**

In `packages/database/prisma/schema.prisma`, after line 734 (`igtfBs Float @default(0)`), add:

```prisma
  changeAmountBs  Float          @default(0)
  changeMethodId  String?
  changeMethod    PaymentMethod? @relation("ChangeMethod", fields: [changeMethodId], references: [id])
```

- [ ] **Step 2: Add fields to Invoice model in schema.prisma**

In `packages/database/prisma/schema.prisma`, after line 679 (`ivaBs Float @default(0)`), add:

```prisma
  totalPaidUsd   Float         @default(0)
  changeBs       Float         @default(0)
```

- [ ] **Step 3: Add the ChangeMethod relation to PaymentMethod model**

In `packages/database/prisma/schema.prisma`, in the PaymentMethod model (around line 595-612), add a new relation field:

```prisma
  changePayments     Payment[]         @relation("ChangeMethod")
```

- [ ] **Step 4: Run the migration**

```bash
cd packages/database && npx prisma migrate dev --name add_change_management_to_payments
```

- [ ] **Step 5: Verify migration applied cleanly**

```bash
npx prisma generate
```

---

### Task 2: Backend — Update PayInvoiceDto to accept changeMethodId

**Files:**
- Modify: `apps/api/src/modules/invoices/dto/pay-invoice.dto.ts`

- [ ] **Step 1: Add changeMethodId to PayInvoiceDto**

Add after the `creditDays` field (line 54):

```typescript
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  changeMethodId?: string;
```

---

### Task 3: Backend — Update InvoicesService.pay() for change calculation

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts` (lines 368-730)

The key changes to `pay()`:

1. **Allow overpayment in USD** — The current validation (line 386) rejects payments below the total. We now need to also handle overpayments. The validation already allows overpayment (it only checks `<`), so no change needed there.

2. **After IGTF calculation and payment adjustment** — Before the transaction block (line 519), calculate the change:

- [ ] **Step 1: Skip payment adjustment when there's overpayment in USD (divisas)**

Currently lines 506-517 adjust the last payment to match invoice totals exactly. This must NOT adjust when the total paid in divisas exceeds the invoice total. Replace the adjustment block:

Find (around lines 506-517):
```typescript
    // Adjust last payment so USD and Bs sums match invoice totals exactly
    if (dto.payments.length >= 1) {
      const lastIdx = dto.payments.length - 1;
      const prevUsd = dto.payments.slice(0, lastIdx).reduce((s, p) => s + p.amountUsd, 0);
      const prevBs = dto.payments.slice(0, lastIdx).reduce((s, p) => s + p.amountBs, 0);
      const adjustedUsd = Math.round((newTotalUsd - prevUsd) * 100) / 100;
      const adjustedBs = Math.round((newTotalBs - prevBs) * 100) / 100;
      if (adjustedUsd >= 0 && adjustedBs >= 0) {
        dto.payments[lastIdx].amountUsd = adjustedUsd;
        dto.payments[lastIdx].amountBs = adjustedBs;
      }
    }
```

Replace with:
```typescript
    // Calculate total paid in USD from divisa methods
    const totalPaidDivisaUsd = dto.payments
      .filter(p => methodMap.get(p.methodId)?.isDivisa)
      .reduce((s, p) => s + p.amountUsd, 0);
    const hasOverpayment = totalPaidDivisaUsd > newTotalUsd + 0.01;

    // Adjust last payment so USD and Bs sums match invoice totals exactly
    // Skip adjustment when there's an overpayment (change scenario)
    if (dto.payments.length >= 1 && !hasOverpayment) {
      const lastIdx = dto.payments.length - 1;
      const prevUsd = dto.payments.slice(0, lastIdx).reduce((s, p) => s + p.amountUsd, 0);
      const prevBs = dto.payments.slice(0, lastIdx).reduce((s, p) => s + p.amountBs, 0);
      const adjustedUsd = Math.round((newTotalUsd - prevUsd) * 100) / 100;
      const adjustedBs = Math.round((newTotalBs - prevBs) * 100) / 100;
      if (adjustedUsd >= 0 && adjustedBs >= 0) {
        dto.payments[lastIdx].amountUsd = adjustedUsd;
        dto.payments[lastIdx].amountBs = adjustedBs;
      }
    }

    // Change calculation
    const totalPaidUsdAll = dto.payments.reduce((s, p) => s + p.amountUsd, 0);
    let changeUsd = 0;
    let changeBs = 0;
    if (hasOverpayment) {
      changeUsd = Math.round((totalPaidDivisaUsd - newTotalUsd) * 100) / 100;
      changeBs = Math.round(changeUsd * invoice.exchangeRate * 100) / 100;
      // Validate changeMethodId is provided when there's change
      if (!dto.changeMethodId) {
        throw new BadRequestException('Debe seleccionar un metodo de vuelto cuando el pago en USD excede el total');
      }
      // Validate changeMethodId exists and is not divisa
      const changeMethod = await this.prisma.paymentMethod.findUnique({ where: { id: dto.changeMethodId } });
      if (!changeMethod) {
        throw new BadRequestException('Metodo de vuelto no encontrado');
      }
      if (changeMethod.isDivisa) {
        throw new BadRequestException('El metodo de vuelto no puede ser en divisas');
      }
    }
```

- [ ] **Step 2: Store change data in payment records inside the transaction**

Inside the transaction, after creating payments (after the payment loop ending at line 608), add change tracking to the payment record. Modify the payment create (line 534) to include change fields:

Replace the payment create data (lines 534-545):
```typescript
        await tx.payment.create({
          data: {
            invoiceId: id,
            methodId: payment.methodId,
            amountUsd: payment.amountUsd,
            amountBs: payment.amountBs,
            exchangeRate: invoice.exchangeRate,
            reference: payment.reference,
            igtfUsd: paymentIgtfUsd,
            igtfBs: paymentIgtfBs,
          },
        });
```

Replace with:
```typescript
        await tx.payment.create({
          data: {
            invoiceId: id,
            methodId: payment.methodId,
            amountUsd: payment.amountUsd,
            amountBs: payment.amountBs,
            exchangeRate: invoice.exchangeRate,
            reference: payment.reference,
            igtfUsd: paymentIgtfUsd,
            igtfBs: paymentIgtfBs,
            changeAmountBs: 0,
            changeMethodId: null,
          },
        });
```

- [ ] **Step 3: After stock deductions, before updating invoice status — create the change movement**

After the stock movement loop (after line 659) and before the invoice update (line 662), add:

```typescript
      // Record change (vuelto) as a cash outflow in the session
      if (changeBs > 0 && dto.changeMethodId) {
        // Update the first divisa payment with change info
        const firstDivisaPayment = await tx.payment.findFirst({
          where: { invoiceId: id },
          orderBy: { createdAt: 'asc' },
        });
        if (firstDivisaPayment) {
          await tx.payment.update({
            where: { id: firstDivisaPayment.id },
            data: {
              changeAmountBs: changeBs,
              changeMethodId: dto.changeMethodId,
            },
          });
        }
      }
```

- [ ] **Step 4: Update the invoice update data to include change fields**

In the invoice update (lines 662-690), add `totalPaidUsd` and `changeBs` to the data:

Find:
```typescript
          igtfUsd: invoiceIgtfUsd,
          igtfBs: invoiceIgtfBs,
          totalUsd: newTotalUsd,
          totalBs: newTotalBs,
```

Replace with:
```typescript
          igtfUsd: invoiceIgtfUsd,
          igtfBs: invoiceIgtfBs,
          totalUsd: newTotalUsd,
          totalBs: newTotalBs,
          totalPaidUsd: hasOverpayment ? Math.round(totalPaidDivisaUsd * 100) / 100 : 0,
          changeBs: changeBs,
```

- [ ] **Step 5: Update the include in invoice update to include changeMethod relation**

In the payments include (line 683), add the changeMethod relation:

Find:
```typescript
          payments: { include: { method: true } },
```

Replace with:
```typescript
          payments: { include: { method: true, changeMethod: true } },
```

---

### Task 4: Backend — Update GET /invoices/:id to include change data

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts`

- [ ] **Step 1: Find the findOne method and update its include**

Search for the `findOne` or `findUnique` method that fetches a single invoice by ID. The payments include should also include the `changeMethod` relation. Find any occurrence of:

```typescript
payments: { include: { method: true } },
```

in findOne/findById methods and replace with:

```typescript
payments: { include: { method: true, changeMethod: true } },
```

---

### Task 5: Backend — Update cash session summary to include change outflows

**Files:**
- Modify: `apps/api/src/modules/cash-registers/cash-registers.service.ts` (lines 352-397)

- [ ] **Step 1: Add change outflows tracking to getSessionSalesData**

In the `getSessionSalesData` method, after aggregating by payment method (after line 385), add a section to track change outflows:

Find (lines 373-396):
```typescript
    const byMethod: Record<string, { methodName: string; count: number; totalUsd: number; totalBs: number }> = {};

    for (const inv of invoices) {
      for (const p of inv.payments) {
        const methodName = (p as any).method?.name || p.methodId;
        if (!byMethod[methodName]) {
          byMethod[methodName] = { methodName, count: 0, totalUsd: 0, totalBs: 0 };
        }
        byMethod[methodName].count += 1;
        byMethod[methodName].totalUsd += p.amountUsd;
        byMethod[methodName].totalBs += p.amountBs;
      }
    }

    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId } });

    return {
      openingBalanceUsd: session?.openingBalanceUsd || 0,
      openingBalanceBs: session?.openingBalanceBs || 0,
      invoiceCount: invoices.length,
      totalUsd: invoices.reduce((s, i) => s + i.totalUsd, 0),
      totalBs: invoices.reduce((s, i) => s + i.totalBs, 0),
      paymentsByMethod: Object.values(byMethod),
    };
```

Replace with:
```typescript
    const byMethod: Record<string, { methodName: string; count: number; totalUsd: number; totalBs: number }> = {};
    const changeOutflows: Array<{ invoiceNumber: string; changeBs: number; changeMethodName: string }> = [];
    let totalChangeBs = 0;

    for (const inv of invoices) {
      for (const p of inv.payments) {
        const methodName = (p as any).method?.name || p.methodId;
        if (!byMethod[methodName]) {
          byMethod[methodName] = { methodName, count: 0, totalUsd: 0, totalBs: 0 };
        }
        byMethod[methodName].count += 1;
        byMethod[methodName].totalUsd += p.amountUsd;
        byMethod[methodName].totalBs += p.amountBs;

        // Track change outflows
        if ((p as any).changeAmountBs > 0) {
          changeOutflows.push({
            invoiceNumber: inv.number,
            changeBs: (p as any).changeAmountBs,
            changeMethodName: (p as any).changeMethod?.name || 'Efectivo Bs',
          });
          totalChangeBs += (p as any).changeAmountBs;
        }
      }
    }

    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId } });

    return {
      openingBalanceUsd: session?.openingBalanceUsd || 0,
      openingBalanceBs: session?.openingBalanceBs || 0,
      invoiceCount: invoices.length,
      totalUsd: invoices.reduce((s, i) => s + i.totalUsd, 0),
      totalBs: invoices.reduce((s, i) => s + i.totalBs, 0),
      paymentsByMethod: Object.values(byMethod),
      changeOutflows,
      totalChangeBs,
    };
```

- [ ] **Step 2: Update the payment include to load changeMethod**

In `getSessionSalesData`, update the invoice query (line 370):

Find:
```typescript
      include: { payments: { include: { method: true } } },
```

Replace with:
```typescript
      include: { payments: { include: { method: true, changeMethod: true } } },
```

---

### Task 6: Frontend — Update POS payment modal with change calculation

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/pos/page.tsx`

- [ ] **Step 1: Add state variables for change management**

After the `creditBalance` state (line 147), add:

```typescript
  const [changeMethodId, setChangeMethodId] = useState<string | null>(null);
```

- [ ] **Step 2: Calculate change in real-time**

After the `remaining` / `remainingBs` calculations (lines 443-445), add:

```typescript
  // Change (vuelto) calculation: only when USD payments exceed total
  const totalPaidDivisaUsd = payments
    .filter(p => p.isDivisa)
    .reduce((s, p) => s + p.amountUsd, 0);
  const changeUsd = totalPaidDivisaUsd > grandTotalUsd + 0.01
    ? Math.round((totalPaidDivisaUsd - grandTotalUsd) * 100) / 100
    : 0;
  const changeBsCalc = Math.round(changeUsd * exchangeRate * 100) / 100;
  const hasChange = changeUsd > 0.01;
```

- [ ] **Step 3: Update the "Pendiente por cobrar" display and add change section**

Replace the "Pendiente por cobrar" card (lines 1624-1629) and the confirm button section (lines 1631-1641) with the updated version that includes change display and method selector:

Find:
```tsx
              <div className="card p-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">Pendiente por cobrar</span>
                <span className={`text-lg font-bold ${remaining <= 0.01 ? 'text-green-400' : 'text-amber-400'}`}>
                  ${Math.max(0, remaining).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button onClick={() => setPayModalOpen(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={processing || remaining > 0.01}
                  className="btn-primary !py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {processing ? <Loader2 className="animate-spin" size={16} /> : <DollarSign size={16} />}
                  Confirmar cobro
                </button>
              </div>
```

Replace with:
```tsx
              {/* Pendiente / Vuelto */}
              {!hasChange ? (
                <div className="card p-3 flex items-center justify-between">
                  <span className="text-sm text-slate-400">Pendiente por cobrar</span>
                  <span className={`text-lg font-bold ${remaining <= 0.01 ? 'text-green-400' : 'text-amber-400'}`}>
                    ${Math.max(0, remaining).toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-300 uppercase tracking-wider">Vuelto</span>
                    <div className="text-right">
                      <span className="text-lg font-bold text-amber-400">${changeUsd.toFixed(2)}</span>
                      <span className="text-slate-400 mx-2">×</span>
                      <span className="text-sm text-slate-400">{exchangeRate.toFixed(2)} Bs/$</span>
                      <span className="text-slate-400 mx-2">=</span>
                      <span className="text-lg font-bold text-amber-300">Bs {changeBsCalc.toFixed(2)}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Metodo de vuelto</label>
                    <select
                      value={changeMethodId || ''}
                      onChange={e => setChangeMethodId(e.target.value || null)}
                      className="input-field !py-2 text-sm w-full"
                    >
                      <option value="">Seleccionar metodo...</option>
                      {paymentMethods
                        .flatMap(pm => pm.children && pm.children.length > 0 ? pm.children : [pm])
                        .filter(pm => !pm.isDivisa && pm.isActive)
                        .map(pm => (
                          <option key={pm.id} value={pm.id}>{pm.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
                <button onClick={() => setPayModalOpen(false)} className="btn-secondary !py-2.5 text-sm">Cancelar</button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={processing || (!hasChange && remaining > 0.01) || (hasChange && !changeMethodId)}
                  className="btn-primary !py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {processing ? <Loader2 className="animate-spin" size={16} /> : <DollarSign size={16} />}
                  Confirmar cobro
                </button>
              </div>
```

- [ ] **Step 4: Update handleConfirmPayment to send changeMethodId**

In the `handleConfirmPayment` function, when building the pay request body (around line 756), add `changeMethodId`:

Find:
```typescript
        body: JSON.stringify({
          payments: finalPayments,
          isCredit: false,
        }),
```

Replace with:
```typescript
        body: JSON.stringify({
          payments: finalPayments,
          isCredit: false,
          changeMethodId: hasChange ? changeMethodId : undefined,
        }),
```

- [ ] **Step 5: Update the remaining validation in handleConfirmPayment**

The current validation (line 720) checks `if (finalRemaining > 0.01)`. When there's overpayment this is negative, so no change needed — it already passes. But we should also validate that change method is selected:

Find (around line 720):
```typescript
    if (finalRemaining > 0.01) {
      setMessage({ type: 'error', text: 'El monto pagado no cubre el total' });
      return;
    }
```

Replace with:
```typescript
    if (finalRemaining > 0.01 && !hasChange) {
      setMessage({ type: 'error', text: 'El monto pagado no cubre el total' });
      return;
    }
    if (hasChange && !changeMethodId) {
      setMessage({ type: 'error', text: 'Seleccione un metodo de vuelto' });
      return;
    }
```

- [ ] **Step 6: Reset changeMethodId when opening the payment modal**

Find where `setPayModalOpen(true)` is called and add `setChangeMethodId(null)` nearby. Search for `setPayModalOpen(true)` and add after it:

```typescript
setChangeMethodId(null);
```

---

### Task 7: Frontend — Update invoice detail page to show change info

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sales/invoices/[id]/page.tsx`

- [ ] **Step 1: Update the InvoiceDetail interface**

Add the new fields to the `InvoiceDetail` interface (around line 11):

Find:
```typescript
  exchangeRate: number;
  isCredit: boolean;
```

Add after `exchangeRate`:
```typescript
  totalPaidUsd: number;
  changeBs: number;
```

- [ ] **Step 2: Update the Payment interface**

Add change fields to the `Payment` interface (around line 56):

Find:
```typescript
interface Payment {
  id: string;
  method: { name: string } | null;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  reference: string | null;
  igtfUsd: number;
  igtfBs: number;
  createdAt: string;
}
```

Replace with:
```typescript
interface Payment {
  id: string;
  method: { name: string } | null;
  amountUsd: number;
  amountBs: number;
  exchangeRate: number;
  reference: string | null;
  igtfUsd: number;
  igtfBs: number;
  changeAmountBs: number;
  changeMethod: { name: string } | null;
  createdAt: string;
}
```

- [ ] **Step 3: Add change info to the Pagos tab**

After the payments table footer (after line 603, before the closing `</>` of the payments section), add a change summary section:

Find:
```tsx
                  </tfoot>
                </table>
              </>
            )}
          </div>
        </TabsContent>
```

Replace with:
```tsx
                  </tfoot>
                </table>

                {/* Change (vuelto) info */}
                {invoice.changeBs > 0 && (
                  <div className="px-4 py-3 border-t border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-amber-300">Total recibido USD</span>
                        <span className="text-sm font-mono text-white ml-3">${invoice.totalPaidUsd?.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-amber-300">Vuelto dado</span>
                        <span className="text-sm font-mono text-amber-400 ml-3">Bs {invoice.changeBs?.toFixed(2)}</span>
                        {invoice.payments.find(p => p.changeAmountBs > 0)?.changeMethod && (
                          <span className="text-xs text-slate-400 ml-2">
                            ({invoice.payments.find(p => p.changeAmountBs > 0)?.changeMethod?.name})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
```

---

### Task 8: Frontend — Update cash session detail to show change outflows

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cash/[id]/page.tsx`

- [ ] **Step 1: Add change outflows display in the session summary sidebar**

After the "Por metodo" section in the summary sidebar (after line 346, before the closing `</div>` of the card), add:

Find:
```tsx
                    </div>
                  </>
                )}
              </div>
            </div>
```

(The first `</div>` closes the `space-y-1.5`, then `</>` closes the fragment, `)}` closes the conditional, `</div>` closes the card, `</div>` closes the `w-[30%]` wrapper)

Replace the card closing with:
```tsx
                    </div>
                  </>
                )}

                {summary && summary.changeOutflows?.length > 0 && (
                  <>
                    <div className="my-3 border-t border-slate-700/50" />
                    <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Vueltos (egresos)</h3>
                    <div className="space-y-1.5">
                      {summary.changeOutflows.map((c: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-400">{c.invoiceNumber}</span>
                          <span className="text-amber-400">-Bs {c.changeBs.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold border-t border-slate-700/30 pt-1">
                        <span className="text-amber-300">Total vueltos</span>
                        <span className="text-amber-400">-Bs {summary.totalChangeBs.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
```

---

### Task 9: Build, test, commit, and push

- [ ] **Step 1: Build the API**

```bash
cd apps/api && npx nest build
```

- [ ] **Step 2: Build the web app**

```bash
cd apps/web && npx next build
```

- [ ] **Step 3: Manual test — create an invoice and pay with overpayment**

1. Create an invoice for ~$25.56
2. Pay with $30 in Zelle (isDivisa=true)
3. Verify the change section appears showing: $4.44 × tasa = X Bs
4. Select "Efectivo Bs" as change method
5. Confirm payment
6. Verify invoice detail shows "Total recibido: $30.00" and "Vuelto dado: Bs X.XX (Efectivo Bs)"
7. Verify the cash session shows the change outflow in the arqueo sidebar

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/ apps/api/src/modules/invoices/ apps/api/src/modules/cash-registers/cash-registers.service.ts apps/web/src/app/\(dashboard\)/sales/pos/page.tsx apps/web/src/app/\(dashboard\)/sales/invoices/\[id\]/page.tsx apps/web/src/app/\(dashboard\)/cash/\[id\]/page.tsx
git commit -m "feat: change management for USD payments with Bs change calculation"
```

- [ ] **Step 5: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 6: Update PROGRESS.md and PROJECT.md**

Add a new session entry to PROGRESS.md documenting:
- Migration: add_change_management_to_payments
- Backend: change calculation in InvoicesService.pay(), cash session summary includes change outflows
- Frontend: POS change calculator with method selector, invoice detail shows change info, cash session shows change outflows
