# Factura de Compra: Pago Contado, Notas Cr/Db, Devoluciones y Libro de Compras

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las facturas de compra de contado requieran pago inmediato al procesar (como ventas), que las de crédito soporten NCC/NDC y devoluciones, y verificar el libro de compras fiscal.

**Architecture:** Extender el endpoint `POST /purchases/:id/process` para aceptar métodos de pago cuando es contado. Crear Payable + PayablePayment inmediatamente marcando como PAID. En el frontend, mostrar un modal de pagos integrado en el modal de procesar. Las NCC/NDC ya existen en backend — solo falta agregar botones de acción en el frontend de detalle de compra. Verificar que el PurchaseBookEntry se cree correctamente con los montos fiscales.

**Tech Stack:** NestJS (backend), Next.js (frontend), Prisma ORM, PostgreSQL

---

### Task 1: Backend — Extender DTO de procesar compra para aceptar pagos

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/dto/receive-purchase-order.dto.ts`

- [ ] **Step 1: Agregar DTOs de pago al archivo**

En `apps/api/src/modules/purchase-orders/dto/receive-purchase-order.dto.ts`, reemplazar el contenido completo:

```typescript
import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessPriceUpdateItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  gananciaPct: number;

  @IsNumber()
  gananciaMayorPct: number;
}

export class ProcessPaymentLineDto {
  @IsString()
  methodId: string;

  @IsNumber()
  @Min(0.01)
  amountUsd: number;

  @IsNumber()
  @Min(0)
  amountBs: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class ProcessPurchaseBillDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessPriceUpdateItemDto)
  priceUpdates?: ProcessPriceUpdateItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessPaymentLineDto)
  payments?: ProcessPaymentLineDto[];
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: Sin errores relacionados a este DTO

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/purchase-orders/dto/receive-purchase-order.dto.ts
git commit -m "feat: Session 32 - agregar DTOs de pago al procesar compra"
```

---

### Task 2: Backend — Modificar servicio de compras para registrar pago al contado

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` (method `process`, lines 585-838)

- [ ] **Step 1: Agregar validación de pagos para compras de contado**

En `purchase-orders.service.ts`, dentro del método `process()`, DESPUÉS de la línea `const processedAt = new Date();` (línea 599) y ANTES de `return this.prisma.$transaction(async (tx) => {` (línea 601), agregar validación:

```typescript
    // Validate payments for cash purchases
    if (!order.isCredit) {
      if (!dto.payments || dto.payments.length === 0) {
        throw new BadRequestException(
          'Las compras de contado requieren al menos un método de pago',
        );
      }

      // Validate payment methods exist
      const methodIds = dto.payments.map((p) => p.methodId);
      const methods = await this.prisma.paymentMethod.findMany({
        where: { id: { in: methodIds } },
      });
      if (methods.length !== methodIds.length) {
        const found = new Set(methods.map((m) => m.id));
        const missing = methodIds.find((id) => !found.has(id));
        throw new BadRequestException(
          `Método de pago "${missing}" no encontrado`,
        );
      }

      // Validate total paid >= invoice total
      const totalPaidUsd = dto.payments.reduce((s, p) => s + p.amountUsd, 0);
      if (totalPaidUsd < order.totalUsd - 0.01) {
        throw new BadRequestException(
          `El monto pagado ($${totalPaidUsd.toFixed(2)}) es menor al total de la factura ($${order.totalUsd.toFixed(2)})`,
        );
      }
    }
```

- [ ] **Step 2: Modificar la sección de creación de Payable para manejar contado Y crédito**

Reemplazar el bloque completo que empieza en `// Create Payable if credit` (líneas 670-711) con:

```typescript
      // Create Payable — always create for accounting trail
      {
        const exchangeRate = order.exchangeRate;
        const amountUsd = order.totalUsd;
        const amountBs = round2(amountUsd * exchangeRate);

        const retentionUsd = 0;
        const retentionBs = 0;

        let islrRetUsd = 0;
        if (order.islrRetentionPct && order.islrRetentionPct > 0) {
          islrRetUsd = round2(amountUsd * (order.islrRetentionPct / 100));
          const islrRetBs = round2(islrRetUsd * exchangeRate);
          await tx.purchaseOrder.update({
            where: { id },
            data: { islrRetentionUsd: islrRetUsd, islrRetentionBs: islrRetBs },
          });
        }

        const netPayableUsd = round2(amountUsd - islrRetUsd);
        const netPayableBs = round2(netPayableUsd * exchangeRate);

        const dueDate = new Date();
        if (order.isCredit && order.creditDays > 0) {
          dueDate.setDate(dueDate.getDate() + order.creditDays);
        }

        const payable = await tx.payable.create({
          data: {
            supplierId: order.supplierId,
            purchaseOrderId: order.id,
            amountUsd,
            amountBs,
            exchangeRate,
            retentionUsd,
            retentionBs,
            netPayableUsd,
            netPayableBs,
            dueDate: order.isCredit && order.creditDays > 0 ? dueDate : null,
            status: order.isCredit ? 'PENDING' : 'PAID',
            paidAmountUsd: order.isCredit ? 0 : netPayableUsd,
            paidAmountBs: order.isCredit ? 0 : netPayableBs,
            paidAt: order.isCredit ? null : processedAt,
            notes: `CxP generada de factura ${order.number}`,
          },
        });

        // Record immediate payments for cash purchases
        if (!order.isCredit && dto.payments && dto.payments.length > 0) {
          for (const payment of dto.payments) {
            await tx.payablePayment.create({
              data: {
                payableId: payable.id,
                amountUsd: payment.amountUsd,
                amountBs: payment.amountBs,
                exchangeRate,
                methodId: payment.methodId,
                reference: payment.reference || null,
                createdById: userId,
              },
            });
          }
        }
      }
```

- [ ] **Step 3: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat: Session 32 - registrar pago inmediato al procesar compra de contado"
```

---

### Task 3: Backend — Incluir payables en findOne de compra para contado

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` (property `includeDetail`)

- [ ] **Step 1: Agregar payables al includeDetail**

En `purchase-orders.service.ts`, buscar el bloque `private readonly includeDetail` (línea 185) y agregar después del campo `retentionVoucherLines`:

```typescript
    payables: {
      select: {
        id: true,
        amountUsd: true,
        amountBs: true,
        exchangeRate: true,
        retentionUsd: true,
        retentionBs: true,
        netPayableUsd: true,
        netPayableBs: true,
        paidAmountUsd: true,
        paidAmountBs: true,
        dueDate: true,
        status: true,
        notes: true,
        payments: {
          select: {
            id: true,
            amountUsd: true,
            amountBs: true,
            method: { select: { id: true, name: true } },
            reference: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    },
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: Sin errores

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat: Session 32 - incluir payables en detalle de compra"
```

---

### Task 4: Frontend — Agregar modal de pago al procesar compras de contado (detalle)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/purchases/[id]/page.tsx`

Este es el cambio más grande. El modal de procesar existente solo muestra precios sugeridos. Necesitamos:
1. Cargar métodos de pago cuando la compra es de contado
2. Agregar sección de pagos al modal
3. Validar que el total pagado cubra el monto antes de procesar

- [ ] **Step 1: Agregar interfaces y estado para pagos**

Después de la interfaz `CreditDebitNote` (línea ~170), agregar:

```typescript
interface PaymentMethod {
  id: string;
  name: string;
  isDivisa: boolean;
  children?: PaymentMethod[];
}

interface PaymentLine {
  methodId: string;
  methodName: string;
  amountUsd: number;
  amountBs: number;
  reference: string;
}
```

Dentro del componente principal `PurchaseBillDetailPage`, después de los estados de retention modal (~línea 291), agregar:

```typescript
  // Cash payment state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
```

- [ ] **Step 2: Cargar métodos de pago al abrir modal de procesar (contado)**

Modificar la función `handleOpenProcess()` (línea ~407). Después de las líneas que cargan suggestedPrices y ANTES de `setProcessModal(true)`, agregar carga de métodos de pago:

```typescript
      // Load payment methods if cash purchase
      if (bill && !bill.isCredit) {
        try {
          const pmRes = await fetch('/api/proxy/payment-methods');
          if (pmRes.ok) {
            const pmData = await pmRes.json();
            const methods = (Array.isArray(pmData) ? pmData : pmData.data || [])
              .filter((m: PaymentMethod) => m.id !== 'pm_saldo_favor' && !m.children?.length);
            setPaymentMethods(methods);
          }
        } catch { /* ignore */ }
        // Initialize with one empty payment line
        setPaymentLines([{ methodId: '', methodName: '', amountUsd: 0, amountBs: 0, reference: '' }]);
      }
```

- [ ] **Step 3: Agregar funciones helper para manejar líneas de pago**

Después de la función `handlePriceChange` (~línea 503), agregar:

```typescript
  function handlePaymentLineChange(
    index: number,
    field: keyof PaymentLine,
    value: string | number,
  ) {
    setPaymentLines((prev) => {
      const next = [...prev];
      const line = { ...next[index] };
      if (field === 'methodId') {
        line.methodId = value as string;
        line.methodName = paymentMethods.find((m) => m.id === value)?.name || '';
      } else if (field === 'amountUsd') {
        line.amountUsd = value as number;
        line.amountBs = Math.round((value as number) * (bill?.exchangeRate || 1) * 100) / 100;
      } else if (field === 'amountBs') {
        line.amountBs = value as number;
        line.amountUsd = Math.round((value as number) / (bill?.exchangeRate || 1) * 100) / 100;
      } else if (field === 'reference') {
        line.reference = value as string;
      }
      next[index] = line;
      return next;
    });
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [
      ...prev,
      { methodId: '', methodName: '', amountUsd: 0, amountBs: 0, reference: '' },
    ]);
  }

  function removePaymentLine(index: number) {
    setPaymentLines((prev) => prev.filter((_, i) => i !== index));
  }

  function autoFillFirstPaymentLine() {
    if (!bill || paymentLines.length === 0) return;
    const totalUsd = bill.totalUsd;
    const otherLinesTotal = paymentLines.slice(1).reduce((s, l) => s + l.amountUsd, 0);
    const remaining = Math.round((totalUsd - otherLinesTotal) * 100) / 100;
    setPaymentLines((prev) => {
      const next = [...prev];
      next[0] = {
        ...next[0],
        amountUsd: remaining > 0 ? remaining : 0,
        amountBs: Math.round((remaining > 0 ? remaining : 0) * (bill.exchangeRate || 1) * 100) / 100,
      };
      return next;
    });
  }
```

- [ ] **Step 4: Modificar `handleProcessWithPrices` y `handleProcessWithoutPrices` para incluir pagos**

Reemplazar `handleProcessWithPrices` (~línea 505):

```typescript
  async function handleProcessWithPrices() {
    // Validate payments for cash purchases
    if (bill && !bill.isCredit) {
      const validPayments = paymentLines.filter((l) => l.methodId && l.amountUsd > 0);
      if (validPayments.length === 0) {
        setMessage({ type: 'error', text: 'Agrega al menos un método de pago' });
        return;
      }
      const totalPaid = validPayments.reduce((s, l) => s + l.amountUsd, 0);
      if (totalPaid < bill.totalUsd - 0.01) {
        setMessage({
          type: 'error',
          text: `Monto pagado ($${totalPaid.toFixed(2)}) es menor al total ($${bill.totalUsd.toFixed(2)})`,
        });
        return;
      }
    }

    setProcessing(true);
    setMessage(null);
    try {
      const priceUpdates = Object.entries(priceEdits).map(([productId, data]) => ({
        productId,
        gananciaPct: data.gananciaPct,
        gananciaMayorPct: data.gananciaMayorPct,
      }));
      const body: any = { priceUpdates };
      if (bill && !bill.isCredit) {
        body.payments = paymentLines
          .filter((l) => l.methodId && l.amountUsd > 0)
          .map((l) => ({
            methodId: l.methodId,
            amountUsd: l.amountUsd,
            amountBs: l.amountBs,
            reference: l.reference || undefined,
          }));
      }
      const res = await fetch(`/api/proxy/purchases/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al procesar');
      }
      setProcessModal(false);
      setMessage({ type: 'success', text: 'Factura procesada exitosamente' });
      setPayablesFetched(false);
      setNotesFetched(false);
      fetchBill();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessing(false);
    }
  }
```

Reemplazar `handleProcessWithoutPrices` (~línea 536):

```typescript
  async function handleProcessWithoutPrices() {
    // Validate payments for cash purchases
    if (bill && !bill.isCredit) {
      const validPayments = paymentLines.filter((l) => l.methodId && l.amountUsd > 0);
      if (validPayments.length === 0) {
        setMessage({ type: 'error', text: 'Agrega al menos un método de pago' });
        return;
      }
      const totalPaid = validPayments.reduce((s, l) => s + l.amountUsd, 0);
      if (totalPaid < bill.totalUsd - 0.01) {
        setMessage({
          type: 'error',
          text: `Monto pagado ($${totalPaid.toFixed(2)}) es menor al total ($${bill.totalUsd.toFixed(2)})`,
        });
        return;
      }
    }

    setProcessing(true);
    setMessage(null);
    try {
      const body: any = {};
      if (bill && !bill.isCredit) {
        body.payments = paymentLines
          .filter((l) => l.methodId && l.amountUsd > 0)
          .map((l) => ({
            methodId: l.methodId,
            amountUsd: l.amountUsd,
            amountBs: l.amountBs,
            reference: l.reference || undefined,
          }));
      }
      const res = await fetch(`/api/proxy/purchases/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al procesar');
      }
      setProcessModal(false);
      setMessage({ type: 'success', text: 'Factura procesada exitosamente' });
      setPayablesFetched(false);
      setNotesFetched(false);
      fetchBill();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessing(false);
    }
  }
```

- [ ] **Step 5: Agregar sección de pagos al modal de procesar**

En el Process Modal (dentro del `{/* Modal Body */}` div, ~línea 1108), DESPUÉS de la tabla de precios sugeridos y ANTES de `{/* Modal Actions */}`, agregar la sección de pagos para contado:

```tsx
              {/* Cash payment section */}
              {bill && !bill.isCredit && (
                <div className="mt-6 pt-6 border-t border-slate-700/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                      Pago de Contado
                    </h3>
                    <div className="text-sm">
                      <span className="text-slate-400">Total a pagar: </span>
                      <span className="text-green-400 font-mono font-bold">
                        ${fmt(bill.totalUsd)}
                      </span>
                      <span className="text-slate-500 ml-2 font-mono text-xs">
                        Bs {fmt(bill.totalBs)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {paymentLines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_120px_120px_140px_32px] gap-2 items-end">
                        <div>
                          {idx === 0 && (
                            <label className="block text-[10px] text-slate-400 mb-0.5">Método</label>
                          )}
                          <select
                            value={line.methodId}
                            onChange={(e) => {
                              handlePaymentLineChange(idx, 'methodId', e.target.value);
                              if (idx === 0 && paymentLines.length === 1) {
                                setTimeout(autoFillFirstPaymentLine, 0);
                              }
                            }}
                            className="input-field !py-1.5 text-sm"
                          >
                            <option value="">Seleccionar...</option>
                            {paymentMethods.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          {idx === 0 && (
                            <label className="block text-[10px] text-slate-400 mb-0.5">Monto $</label>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            value={line.amountUsd || ''}
                            onChange={(e) => handlePaymentLineChange(idx, 'amountUsd', Number(e.target.value))}
                            className="input-field !py-1.5 text-sm text-right font-mono"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          {idx === 0 && (
                            <label className="block text-[10px] text-slate-400 mb-0.5">Monto Bs</label>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            value={line.amountBs || ''}
                            onChange={(e) => handlePaymentLineChange(idx, 'amountBs', Number(e.target.value))}
                            className="input-field !py-1.5 text-sm text-right font-mono"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          {idx === 0 && (
                            <label className="block text-[10px] text-slate-400 mb-0.5">Referencia</label>
                          )}
                          <input
                            type="text"
                            value={line.reference}
                            onChange={(e) => handlePaymentLineChange(idx, 'reference', e.target.value)}
                            className="input-field !py-1.5 text-sm"
                            placeholder="Ref..."
                          />
                        </div>
                        <div>
                          {idx > 0 ? (
                            <button
                              type="button"
                              onClick={() => removePaymentLine(idx)}
                              className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                            >
                              <X size={14} />
                            </button>
                          ) : (
                            <div className="w-8" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <button
                      type="button"
                      onClick={addPaymentLine}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      + Agregar método
                    </button>
                    <div className="text-sm">
                      <span className="text-slate-400">Pagado: </span>
                      <span
                        className={`font-mono font-bold ${
                          paymentLines.reduce((s, l) => s + l.amountUsd, 0) >= bill.totalUsd - 0.01
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        ${fmt(paymentLines.reduce((s, l) => s + l.amountUsd, 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
```

- [ ] **Step 6: Actualizar el PayableTab para mostrar datos de contado**

Modificar la condición inicial del `PayableTab` (línea ~1319) que bloquea para contado. Reemplazar:

```typescript
  if (!bill.isCredit || bill.status !== 'PROCESSED') {
```

con:

```typescript
  if (bill.status !== 'PROCESSED') {
```

Y ajustar los mensajes:

```typescript
  if (bill.status !== 'PROCESSED') {
    return (
      <div className="card p-12 text-center text-slate-500">
        {bill.status === 'PENDING'
          ? 'La cuenta por pagar se generará al procesar la factura'
          : 'Factura cancelada -- no hay cuenta por pagar'}
      </div>
    );
  }
```

- [ ] **Step 7: Actualizar lazy-load de payables para incluir contado**

Buscar el `useEffect` que carga payables cuando cambia el tab a "cxp" (debería estar alrededor de línea 335-365). Actualmente solo carga si `bill.isCredit`. Cambiar la condición para que siempre cargue cuando `bill.status === 'PROCESSED'`:

Buscar la condición `if (activeTab === 'cxp' && bill && !payablesFetched)` y asegurar que NO filtre por `isCredit`. El fetch debería ejecutarse para todas las compras procesadas.

Si hay una condición `bill.isCredit` dentro del useEffect de payables, removerla para que cargue siempre.

- [ ] **Step 8: Verificar que compila el frontend**

Run: `cd apps/web && npx next build 2>&1 | tail -30`
Si hay errores de tipo, corregirlos.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/purchases/\[id\]/page.tsx
git commit -m "feat: Session 32 - modal de pago contado al procesar compra y mostrar CxP contado"
```

---

### Task 5: Frontend — Agregar pago de contado al flujo de nueva compra

**Files:**
- Modify: `apps/web/src/app/(dashboard)/purchases/new/page.tsx`

Cuando el usuario hace "Guardar y Procesar" en una compra de contado, después del modal de precios debe aparecer la sección de pagos.

- [ ] **Step 1: Agregar interfaces y estado de pagos**

Después de las interfaces existentes (~línea 78), agregar:

```typescript
interface PaymentMethod {
  id: string;
  name: string;
  isDivisa: boolean;
  children?: PaymentMethod[];
}

interface PaymentLine {
  methodId: string;
  methodName: string;
  amountUsd: number;
  amountBs: number;
  reference: string;
}
```

Dentro del componente, después del estado de `processingPrices` (~línea 177), agregar:

```typescript
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
```

- [ ] **Step 2: Cargar métodos de pago al montar si aplica**

Dentro del `loadBootstrap` callback, agregar fetch de payment methods:

```typescript
      // Load payment methods
      try {
        const pmRes = await fetch('/api/proxy/payment-methods');
        if (pmRes.ok) {
          const pmData = await pmRes.json();
          const methods = (Array.isArray(pmData) ? pmData : pmData.data || [])
            .filter((m: PaymentMethod) => m.id !== 'pm_saldo_favor' && !m.children?.length);
          setPaymentMethods(methods);
        }
      } catch { /* ignore */ }
```

- [ ] **Step 3: Agregar funciones helper de pago**

Después de `handleGananciaChange` (~línea 634), agregar las mismas funciones de la Task 4 (adaptadas):

```typescript
  function handlePaymentLineChange(
    index: number,
    field: keyof PaymentLine,
    value: string | number,
  ) {
    setPaymentLines((prev) => {
      const next = [...prev];
      const line = { ...next[index] };
      if (field === 'methodId') {
        line.methodId = value as string;
        line.methodName = paymentMethods.find((m) => m.id === value)?.name || '';
      } else if (field === 'amountUsd') {
        line.amountUsd = value as number;
        line.amountBs = Math.round((value as number) * exchangeRate * 100) / 100;
      } else if (field === 'amountBs') {
        line.amountBs = value as number;
        line.amountUsd = Math.round((value as number) / exchangeRate * 100) / 100;
      } else if (field === 'reference') {
        line.reference = value as string;
      }
      next[index] = line;
      return next;
    });
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [
      ...prev,
      { methodId: '', methodName: '', amountUsd: 0, amountBs: 0, reference: '' },
    ]);
  }

  function removePaymentLine(index: number) {
    setPaymentLines((prev) => prev.filter((_, i) => i !== index));
  }
```

- [ ] **Step 4: Modificar handleProcess para incluir pagos**

En `handleProcess` (~línea 530), cuando la compra es de contado, inicializar las líneas de pago antes de mostrar el priceModal. Después de `setPriceModal(true)` (~línea 568), agregar:

```typescript
        // Initialize payment lines for cash
        if (!isCredit) {
          setPaymentLines([{
            methodId: '',
            methodName: '',
            amountUsd: 0,
            amountBs: 0,
            reference: '',
          }]);
        }
```

- [ ] **Step 5: Modificar handleProcessWithPrices para enviar pagos**

Reemplazar la función `handleProcessWithPrices` (~línea 596):

```typescript
  async function handleProcessWithPrices() {
    if (!createdId) return;

    // Validate payments for cash
    if (!isCredit) {
      const validPayments = paymentLines.filter((l) => l.methodId && l.amountUsd > 0);
      if (validPayments.length === 0) {
        setMessage({ type: 'error', text: 'Agrega al menos un método de pago' });
        return;
      }
      const totalPaid = validPayments.reduce((s, l) => s + l.amountUsd, 0);
      const totalInvoice = totals.totalUsd;
      if (totalPaid < totalInvoice - 0.01) {
        setMessage({
          type: 'error',
          text: `Monto pagado ($${totalPaid.toFixed(2)}) es menor al total ($${totalInvoice.toFixed(2)})`,
        });
        return;
      }
    }

    setProcessingPrices(true);
    try {
      const priceUpdates = Object.entries(priceEdits).map(([productId, data]) => ({
        productId,
        gananciaPct: data.gananciaPct,
        gananciaMayorPct: data.gananciaMayorPct,
      }));
      const body: any = { priceUpdates };
      if (!isCredit) {
        body.payments = paymentLines
          .filter((l) => l.methodId && l.amountUsd > 0)
          .map((l) => ({
            methodId: l.methodId,
            amountUsd: l.amountUsd,
            amountBs: l.amountBs,
            reference: l.reference || undefined,
          }));
      }
      const res = await fetch(`/api/proxy/purchases/${createdId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al procesar');
      }
      router.push(`/purchases/${createdId}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessingPrices(false);
    }
  }
```

- [ ] **Step 6: Modificar handleProcessWithoutPriceChanges igual**

Reemplazar `handleProcessWithoutPriceChanges`:

```typescript
  async function handleProcessWithoutPriceChanges() {
    if (!createdId) return;

    // Validate payments for cash
    if (!isCredit) {
      const validPayments = paymentLines.filter((l) => l.methodId && l.amountUsd > 0);
      if (validPayments.length === 0) {
        setMessage({ type: 'error', text: 'Agrega al menos un método de pago' });
        return;
      }
      const totalPaid = validPayments.reduce((s, l) => s + l.amountUsd, 0);
      const totalInvoice = totals.totalUsd;
      if (totalPaid < totalInvoice - 0.01) {
        setMessage({
          type: 'error',
          text: `Monto pagado ($${totalPaid.toFixed(2)}) es menor al total ($${totalInvoice.toFixed(2)})`,
        });
        return;
      }
    }

    setProcessingPrices(true);
    try {
      const body: any = {};
      if (!isCredit) {
        body.payments = paymentLines
          .filter((l) => l.methodId && l.amountUsd > 0)
          .map((l) => ({
            methodId: l.methodId,
            amountUsd: l.amountUsd,
            amountBs: l.amountBs,
            reference: l.reference || undefined,
          }));
      }
      const res = await fetch(`/api/proxy/purchases/${createdId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al procesar');
      }
      router.push(`/purchases/${createdId}`);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setProcessingPrices(false);
    }
  }
```

- [ ] **Step 7: Agregar sección de pago al price modal**

En el price modal existente (buscar `{priceModal &&`), agregar la misma sección de pagos de contado que en Task 4, Step 5 — colocándola ANTES de los botones del modal. Usar `totals.totalUsd` y `totals.totalBs` en lugar de `bill.totalUsd` y `bill.totalBs`, y `exchangeRate` en lugar de `bill.exchangeRate`.

- [ ] **Step 8: Verificar que compila**

Run: `cd apps/web && npx next build 2>&1 | tail -30`

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/purchases/new/page.tsx
git commit -m "feat: Session 32 - pago contado en flujo de nueva compra"
```

---

### Task 6: Frontend — Agregar botones de NCC/NDC y devoluciones en detalle de compra

**Files:**
- Modify: `apps/web/src/app/(dashboard)/purchases/[id]/page.tsx`

Los endpoints de NCC/NDC ya existen (`POST /credit-debit-notes` con `type: NCC|NDC` y `purchaseOrderId`). Falta agregar botones de acción en la página de detalle para compras procesadas a crédito.

- [ ] **Step 1: Agregar botones de acción en el header para compras PROCESSED de crédito**

En el bloque de botones del header (~línea 628), después de la condición `{bill.status === 'PROCESSED' && (` y el botón de "Ver en libro de compras", agregar:

```tsx
          {bill.status === 'PROCESSED' && bill.isCredit && (
            <>
              <button
                onClick={() => router.push(`/credit-debit-notes/new?type=NCC&origin=MERCHANDISE&purchaseOrderId=${bill.id}`)}
                className="text-sm px-3 py-1.5 rounded-lg border border-orange-500/20 text-orange-400 hover:bg-orange-500/10 transition-colors flex items-center gap-1.5"
              >
                Devolver mercancía
              </button>
              <button
                onClick={() => router.push(`/credit-debit-notes/new?type=NCC&origin=MANUAL&purchaseOrderId=${bill.id}`)}
                className="text-sm px-3 py-1.5 rounded-lg border border-blue-500/20 text-blue-400 hover:bg-blue-500/10 transition-colors flex items-center gap-1.5"
              >
                NC Compra
              </button>
              <button
                onClick={() => router.push(`/credit-debit-notes/new?type=NDC&origin=MANUAL&purchaseOrderId=${bill.id}`)}
                className="text-sm px-3 py-1.5 rounded-lg border border-purple-500/20 text-purple-400 hover:bg-purple-500/10 transition-colors flex items-center gap-1.5"
              >
                ND Compra
              </button>
            </>
          )}
```

- [ ] **Step 2: Verificar que la página de crear nota acepta parámetros de query**

Verificar que `apps/web/src/app/(dashboard)/credit-debit-notes/new/page.tsx` lee `type`, `origin`, y `purchaseOrderId` de los query params. Si no lo hace, modificar para pre-llenar los campos.

Buscar el archivo y verificar:
```
apps/web/src/app/(dashboard)/credit-debit-notes/new/page.tsx
```

Si no existe la ruta `new`, buscar alternativas como un modal o formulario inline.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/purchases/\[id\]/page.tsx
git commit -m "feat: Session 32 - botones NCC/NDC y devolucion en detalle de compra"
```

---

### Task 7: Verificar libro de compras y corregir si es necesario

**Files:**
- Read: `apps/api/src/modules/purchase-book/purchase-book.service.ts`
- Read: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` (líneas 803-822)

- [ ] **Step 1: Verificar que PurchaseBookEntry se crea correctamente**

Revisar que la creación del PurchaseBookEntry en el método `process()` incluye todos los campos fiscales relevantes. Actualmente crea:

```
- entryDate: order.invoiceDate || processedAt
- supplierControlNumber
- supplierInvoiceNumber
- supplierName, supplierRif
- exemptAmountBs
- taxableBaseBs
- ivaAmountBs
- totalBs
```

Verificar que:
1. `exemptAmountBs` corresponde a los items EXEMPT
2. `taxableBaseBs` es la base imponible (sin IVA)
3. `ivaAmountBs` es el crédito fiscal correcto
4. `totalBs` = exempt + taxableBase + IVA

Los cálculos se hacen en `calculateFiscalTotals` y se guardan en el PurchaseOrder. El PurchaseBookEntry copia estos valores del PurchaseOrder ya calculado, lo cual es correcto.

- [ ] **Step 2: Verificar que el supplierSerialNumber se guarda en el entry si aplica**

El PurchaseBookEntry no incluye `supplierSerialNumber`. Si el libro de compras lo requiere, agregar al crear la entry. Revisar el modelo para ver si tiene ese campo.

El modelo `PurchaseBookEntry` no tiene un campo `supplierSerialNumber` directo — usa `supplierControlNumber` y `supplierInvoiceNumber`. El número de serie del proveedor está disponible en el PurchaseOrder relacionado vía `purchaseOrderId`.

Si es necesario para reportes, se puede obtener del JOIN. No es necesario duplicar el campo.

- [ ] **Step 3: Verificar que NCC/NDC no generan entries duplicadas en el libro**

Actualmente la creación de NCC/NDC en `credit-debit-notes.service.ts` NO crea PurchaseBookEntry automáticamente. Las notas se aplican a través de Recibos de Pago que sí afectan el saldo de la CxP. Esto es correcto para el flujo venezolano — las notas afectan al saldo pero el asiento del libro de compras es solo el de la factura original.

- [ ] **Step 4: Probar manualmente creando una compra fiscal y verificar en libro**

1. Crear una compra fiscal de contado con items variados (EXEMPT + GENERAL IVA)
2. Procesar con métodos de pago
3. Ir a `/fiscal/libro-compras` y verificar que el asiento aparece con montos correctos
4. Verificar totales: exempt + taxableBase + IVA = total

- [ ] **Step 5: Commit si hay correcciones**

```bash
git add -A
git commit -m "fix: Session 32 - correcciones libro de compras si aplica"
```

---

### Task 8: Testing integral y deploy

- [ ] **Step 1: Build completo**

```bash
cd /c/Users/Intel\ Core\ I5/Desktop/Trinity
cd apps/api && npx tsc --noEmit && cd ../web && npx next build
```

- [ ] **Step 2: Probar flujo de contado**

1. Ir a `/purchases/new`
2. Crear compra de CONTADO (isCredit = false)
3. Agregar items, click "Guardar y Procesar"
4. Verificar que aparece sección de pagos en el modal
5. Seleccionar método de pago, ingresar monto
6. Procesar — verificar que se redirige al detalle
7. En detalle, ir a pestaña CxP — verificar que aparece Payable con status PAID y los pagos registrados

- [ ] **Step 3: Probar flujo de crédito**

1. Crear compra a CRÉDITO con 30 días
2. Procesar (sin pagos — debe funcionar como antes)
3. Verificar que CxP aparece como PENDING
4. Verificar botones de NCC/NDC en el header
5. Crear una NCC MERCHANDISE (devolución parcial)
6. Verificar que aparece en tab de Notas

- [ ] **Step 4: Verificar libro de compras**

1. Ir a `/fiscal/libro-compras`
2. Filtrar por rango de fechas que incluya las compras creadas
3. Verificar que ambas compras (contado y crédito) aparecen con montos correctos

- [ ] **Step 5: Commit final y push**

```bash
git add -A
git commit -m "feat: Session 32 - pago contado compras, NCC/NDC, libro compras verificado"
git push origin main
```

- [ ] **Step 6: Deploy**

```bash
ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```
