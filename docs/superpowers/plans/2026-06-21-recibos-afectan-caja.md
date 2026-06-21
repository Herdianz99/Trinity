# Recibos CxC/CxP afectan la caja (arqueo) — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los cobros de Cuentas por Cobrar (CxC) y los pagos de Cuentas por Pagar (CxP) hechos vía **recibos** entren al arqueo/cierre de caja y a la vista global de movimientos, respetando el método de pago (efectivo de gaveta vs canal electrónico).

**Architecture:** Enfoque de **solo lectura sobre datos existentes, sin migración**. El `Receipt` ya guarda `cashSessionId` al postearse y crea `ReceiptPayment[]` con su `methodId`. Un recibo `POSTED` es **inmutable** (`cancel()` solo permite anular `DRAFT`), así que filtrar por `status: 'POSTED'` en el arqueo basta — no hace falta lógica de reversa. Se extiende `getSessionSalesData` para leer esos pagos y ajustar el efectivo esperado en gaveta; `closeSession`/`getSessionSummary` ya consumen ese helper, así que el snapshot persistido al cierre los incluye automáticamente. Se replica la lectura en `getGlobalMovementsData` (vista global) y se añaden secciones de display en el modal de cierre, las páginas de sesión, el PDF de cierre y la vista global.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js + Tailwind (apps/web), PDFKit. Verificación E2E con scripts Node `fetch` contra la copia local de la BD de producción (no hay suite de tests unitarios en el repo; se sigue el patrón de las sesiones 60/63: typecheck + E2E manual).

**Fuera de alcance (Fase 2, no tocar aquí):** compras al contado (`PurchaseOrder`/`PayablePayment` no tienen `cashSessionId`; requieren migración + UI). Reintegros (recibo COLLECTION con total negativo) — ya generan su propio `CashMovement` en `receipts.post()`; se **excluyen** de la lectura nueva para no duplicar.

---

## Contrato de datos (nombres compartidos por todas las tareas)

`getSessionSalesData` (apps/api) agrega al objeto de retorno:

- `collectionsCashUsd: number`, `collectionsCashBs: number` — cobros CxC en **efectivo** por moneda (entran a la gaveta).
- `cxpCashUsd: number`, `cxpCashBs: number` — pagos CxP en **efectivo** por moneda (salen de la gaveta).
- `receiptCollectionsByMethod: Array<{ methodName: string; isDivisa: boolean; isCash: boolean; count: number; totalUsd: number; totalBs: number }>` — desglose de cobros por método (display).
- `receiptPaymentsByMethod: Array<{ ...mismo shape }>` — desglose de pagos CxP por método (display).

Fórmula del efectivo esperado (modificada):
```
cashExpectedUsd = openingUsd + cashSalesUsd + movInCashUsd - movOutCashUsd + collectionsCashUsd - cxpCashUsd
cashExpectedBs  = openingBs  + cashSalesBs  - cashChangeBs + movInCashBs - movOutCashBs + collectionsCashBs - cxpCashBs
```

`getGlobalMovementsData` (vista global) agrega filas de `kind: 'RECEIPT'`:
```ts
{
  kind: 'RECEIPT',
  receiptType: 'COLLECTION' | 'PAYMENT',
  date: Date,                 // receiptPayment.createdAt
  sessionId, cashRegisterId, cashRegisterName, cashierName,
  methodId, methodName, isDivisa, isCash,
  partyName: string,          // customer (COLLECTION) o supplier (PAYMENT)
  receiptNumber: string,
  reference: string | null,
  amountUsd: number, amountBs: number,
}
```
Y al `summary` de la vista global:
- `collectionCount/collectionUsd/collectionBs`, `cxpCount/cxpUsd/cxpBs`.
- `byMethod` incluye **ingresos** (sale payments + CxC collections) — para cotejo "todos los Zelle" sin importar el documento. Los CxP (salidas) NO entran a `byMethod`.

---

## Task 1: Arqueo — leer recibos CxC/CxP en `getSessionSalesData`

**Files:**
- Modify: `apps/api/src/modules/cash-registers/cash-registers.service.ts` (método `getSessionSalesData`, hoy líneas ~358-508)
- Test: `apps/api/tmp-test-receipts-arqueo.js` (script E2E temporal, se borra al final)

- [ ] **Step 1: Insertar la lectura de recibos antes del cálculo de `cashExpected`**

En `getSessionSalesData`, justo **después** del bucle `for (const mov of cashMovements)` (que termina calculando `movInCashUsd/Bs`, `movOutCashUsd/Bs`) y **antes** de la línea `const salesTotalUsd = invoices.reduce(...)`, insertar:

```ts
    // ── Recibos de cobro/pago posteados a esta sesion (CxC / CxP) ───────────
    // Un recibo POSTED es inmutable (cancel() solo permite anular DRAFT), asi
    // que filtrar por estado basta — sin logica de reversa. Se excluyen los
    // reintegros (COLLECTION con total negativo) que ya crean su propio
    // CashMovement en receipts.post() (evita doble conteo).
    const receipts = await this.prisma.receipt.findMany({
      where: {
        cashSessionId: sessionId,
        status: 'POSTED',
        NOT: { type: 'COLLECTION', totalUsd: { lt: -0.01 } },
      },
      include: { payments: { include: { method: true } } },
    });

    const collectionsByMethod: Record<string, { methodName: string; isDivisa: boolean; isCash: boolean; count: number; totalUsd: number; totalBs: number }> = {};
    const cxpByMethod: Record<string, { methodName: string; isDivisa: boolean; isCash: boolean; count: number; totalUsd: number; totalBs: number }> = {};
    let collectionsCashUsd = 0, collectionsCashBs = 0, cxpCashUsd = 0, cxpCashBs = 0;

    for (const rc of receipts) {
      const isCollection = rc.type === 'COLLECTION';
      const target = isCollection ? collectionsByMethod : cxpByMethod;
      for (const rp of rc.payments) {
        const method = (rp as any).method;
        const name = method?.name || rp.methodId;
        if (!target[name]) {
          target[name] = { methodName: name, isDivisa: !!method?.isDivisa, isCash: !!method?.isCash, count: 0, totalUsd: 0, totalBs: 0 };
        }
        target[name].count += 1;
        target[name].totalUsd += rp.amountUsd;
        target[name].totalBs += rp.amountBs;
        if (method?.isCash) {
          if (method.isDivisa) {
            if (isCollection) collectionsCashUsd += rp.amountUsd; else cxpCashUsd += rp.amountUsd;
          } else {
            if (isCollection) collectionsCashBs += rp.amountBs; else cxpCashBs += rp.amountBs;
          }
        }
      }
    }
```

- [ ] **Step 2: Modificar la fórmula de `cashExpected`**

Reemplazar las dos líneas existentes:
```ts
    const cashExpectedUsd = Math.round((openingUsd + cashSalesUsd + movInCashUsd - movOutCashUsd) * 100) / 100;
    const cashExpectedBs = Math.round((openingBs + cashSalesBs - cashChangeBs + movInCashBs - movOutCashBs) * 100) / 100;
```
por:
```ts
    const cashExpectedUsd = Math.round((openingUsd + cashSalesUsd + movInCashUsd - movOutCashUsd + collectionsCashUsd - cxpCashUsd) * 100) / 100;
    const cashExpectedBs = Math.round((openingBs + cashSalesBs - cashChangeBs + movInCashBs - movOutCashBs + collectionsCashBs - cxpCashBs) * 100) / 100;
```

- [ ] **Step 3: Exponer los nuevos agregados en el `return`**

Dentro del objeto que retorna `getSessionSalesData`, justo después de `cashMovements,` agregar:
```ts
      receiptCollectionsByMethod: Object.values(collectionsByMethod),
      receiptPaymentsByMethod: Object.values(cxpByMethod),
      collectionsCashUsd: Math.round(collectionsCashUsd * 100) / 100,
      collectionsCashBs: Math.round(collectionsCashBs * 100) / 100,
      cxpCashUsd: Math.round(cxpCashUsd * 100) / 100,
      cxpCashBs: Math.round(cxpCashBs * 100) / 100,
```

- [ ] **Step 4: Typecheck del API**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores (exit 0).

- [ ] **Step 5: Escribir el script de verificación E2E**

Crear `apps/api/tmp-test-receipts-arqueo.js`:
```js
const BASE = 'http://localhost:4000';
(async () => {
  const lj = await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@trinity.com', password: 'Test1234!' }) })).json();
  const H = { Authorization: 'Bearer ' + lj.accessToken };
  const get = async u => (await (await fetch(BASE + u, { headers: H })).json());

  // Buscar sesiones que tengan recibos POSTED con cashSessionId
  const sessions = await get('/cash-sessions');
  let found = null;
  for (const s of sessions) {
    const sum = await get('/cash-sessions/' + s.id + '/summary');
    const cols = sum.receiptCollectionsByMethod || [];
    const pays = sum.receiptPaymentsByMethod || [];
    if (cols.length || pays.length) { found = { s, sum }; break; }
  }
  if (!found) { console.log('NO HAY SESIONES CON RECIBOS POSTED EN LA COPIA LOCAL — ver Step 6'); return; }
  const { s, sum } = found;
  console.log('sesion', s.id, 'caja', s.cashRegister?.name);
  console.log('cobros CxC por metodo:', (sum.receiptCollectionsByMethod || []).map(m => `${m.methodName}(${m.count})=$${m.totalUsd}`).join(', ') || '(ninguno)');
  console.log('pagos CxP por metodo:', (sum.receiptPaymentsByMethod || []).map(m => `${m.methodName}(${m.count})=$${m.totalUsd}`).join(', ') || '(ninguno)');
  console.log('collectionsCash USD/Bs:', sum.collectionsCashUsd, sum.collectionsCashBs, '| cxpCash USD/Bs:', sum.cxpCashUsd, sum.cxpCashBs);

  // Verificar que la gaveta refleja los cobros/pagos en efectivo
  const cashCols = (sum.receiptCollectionsByMethod || []).filter(m => m.isCash);
  const cashCxp = (sum.receiptPaymentsByMethod || []).filter(m => m.isCash);
  const expCu = cashCols.filter(m => m.isDivisa).reduce((a, b) => a + b.totalUsd, 0) - cashCxp.filter(m => m.isDivisa).reduce((a, b) => a + b.totalUsd, 0);
  console.log('aporte neto de recibos al efectivo USD (calc manual):', Math.round(expCu * 100) / 100, '== collectionsCashUsd - cxpCashUsd:', Math.round((sum.collectionsCashUsd - sum.cxpCashUsd) * 100) / 100);
  console.log('cashExpectedUsd:', sum.cashExpectedUsd, '| cashExpectedBs:', sum.cashExpectedBs);
})().catch(e => console.log('THROW', e.message));
```

- [ ] **Step 6: Levantar API con el código nuevo y correr la verificación**

Run:
```bash
cd apps/api && npx nest build && cd ../.. && npx kill-port 4000 && (cd apps/api && node dist/main.js > /tmp/api.log 2>&1 &) && sleep 6 && cd apps/api && node tmp-test-receipts-arqueo.js
```
Expected: imprime los cobros/pagos por método y confirma que `collectionsCashUsd - cxpCashUsd` coincide con el cálculo manual. (Login usa la clave local `Test1234!` reseteada en la sesión 63; si falla el login, resetear de nuevo con un script bcrypt como en sesión 63.)
Si imprime "NO HAY SESIONES CON RECIBOS POSTED": ir a Step 7 para crear uno de prueba.

- [ ] **Step 7 (solo si Step 6 no encontró recibos): crear un recibo de cobro de prueba**

Crear y postear un recibo COLLECTION en efectivo vía API contra una CxC pendiente y una sesión abierta, luego re-correr Step 6. Script `apps/api/tmp-create-receipt.js`:
```js
const BASE = 'http://localhost:4000';
(async () => {
  const lj = await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@trinity.com', password: 'Test1234!' }) })).json();
  const H = { Authorization: 'Bearer ' + lj.accessToken, 'Content-Type': 'application/json' };
  const get = async u => (await (await fetch(BASE + u, { headers: H })).json());
  const sessions = (await get('/cash-sessions')).filter(s => s.status === 'OPEN');
  const efectivoBs = (await get('/payment-methods/flat')).find(m => m.name === 'Efectivo Bs');
  console.log('sesion abierta:', sessions[0]?.id, 'metodo:', efectivoBs?.name);
  // NOTA: inspeccionar primero el DTO real de creacion/posteo de recibos en
  // apps/api/src/modules/receipts/receipts.controller.ts y crear una CxC de
  // prueba si no hay. Postear con { cashSessionId: <sesion abierta>, payments:[{ methodId: efectivoBs.id, amountUsd, amountBs }] }.
})().catch(e => console.log('THROW', e.message));
```
Expected: tras postear y re-correr Step 6, la gaveta del summary aumenta en el monto del cobro.

- [ ] **Step 8: Borrar scripts temporales**

Run: `rm -f apps/api/tmp-test-receipts-arqueo.js apps/api/tmp-create-receipt.js`

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/cash-registers/cash-registers.service.ts
git commit -m "feat: Session 64 - recibos CxC/CxP entran al arqueo de caja (getSessionSalesData)"
```

---

## Task 2: Verificar persistencia al cierre (`closeSession` / `getSessionSummary`)

`closeSession` ya usa `summary.cashExpectedUsd/Bs` (líneas 169-170) para persistir `expectedUsd/expectedBs/differenceUsd/differenceBs`, y `getSessionSummary` ya hace spread de `getSessionSalesData`. **No requieren cambios de código** — solo verificación de que el efectivo esperado persistido ahora incluye los recibos.

**Files:**
- Test: `apps/api/tmp-test-close.js` (temporal)

- [ ] **Step 1: Script que cierra una sesión de prueba y verifica el `expectedUsd` persistido**

Crear `apps/api/tmp-test-close.js` que: (a) loguea, (b) abre una caja de prueba, (c) postea un recibo de cobro en efectivo Bs a esa sesión, (d) cierra la sesión con `closingBalanceBs` = lo esperado, (e) hace GET al summary de la sesión cerrada y verifica que `session.expectedBs` (snapshot) incluye el cobro y `differenceBs == 0`.
```js
const BASE = 'http://localhost:4000';
(async () => {
  const lj = await (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@trinity.com', password: 'Test1234!' }) })).json();
  const H = { Authorization: 'Bearer ' + lj.accessToken, 'Content-Type': 'application/json' };
  // (reusar la sesion creada/posteada en Task 1 Step 7, o abrir una caja libre)
  // GET summary cerrado y assert:
  //   sum.session.expectedBs incluye collectionsCashBs
  //   sum.session.differenceBs == 0 cuando closingBalanceBs == cashExpectedBs previo
  console.log('VER MANUAL: comparar expectedBs persistido vs cashExpectedBs del summary en vivo antes de cerrar');
})().catch(e => console.log('THROW', e.message));
```

- [ ] **Step 2: Correr la verificación**

Run: `cd apps/api && node tmp-test-close.js`
Expected: `expectedBs` persistido = efectivo esperado (con el cobro incluido); `differenceBs` = 0 si el conteo coincide.

- [ ] **Step 3: Borrar el script y (si se abrió/cerró una caja de prueba) anotar que fue dato de prueba en la copia local**

Run: `rm -f apps/api/tmp-test-close.js`

- [ ] **Step 4: (sin commit — no hubo cambios de código en esta tarea)**

---

## Task 3: Display en el modal de cierre y páginas de sesión

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cash/[id]/page.tsx` (modal de cierre, ~líneas 886-902; panel "Sesión actual")
- Modify: `apps/web/src/app/(dashboard)/cash/sessions/[id]/page.tsx` (vista read-only de sesión)

- [ ] **Step 1: Agregar bloque "Cobros CxC" y "Pagos CxP" en el modal de cierre**

En `cash/[id]/page.tsx`, dentro del bloque `{closeSummary && (...)}`, **después** del bloque "Otros canales" (cierra en línea ~902) y antes de cerrar el `</div>` del contenedor, insertar:
```tsx
                {/* Cobros de CxC posteados a esta sesion (entran a la gaveta si son efectivo) */}
                {closeSummary.receiptCollectionsByMethod?.length > 0 && (
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <h4 className="text-xs font-semibold text-emerald-400 uppercase mb-2">Cobros CxC (recibos)</h4>
                    {closeSummary.receiptCollectionsByMethod.map((m: any) => (
                      <div key={m.methodName} className="flex justify-between text-sm mt-1">
                        <span className="text-slate-300">{m.methodName} ({m.count}){m.isCash && <span className="text-emerald-500/70"> · gaveta</span>}</span>
                        <span className="text-slate-200">{m.isDivisa ? `$${m.totalUsd.toFixed(2)}` : `Bs ${m.totalBs.toFixed(2)}`}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-500 mt-2">Los cobros en efectivo ya estan sumados al efectivo esperado en gaveta.</p>
                  </div>
                )}

                {/* Pagos de CxP posteados a esta sesion (salen de la gaveta si son efectivo) */}
                {closeSummary.receiptPaymentsByMethod?.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <h4 className="text-xs font-semibold text-red-400 uppercase mb-2">Pagos CxP (recibos)</h4>
                    {closeSummary.receiptPaymentsByMethod.map((m: any) => (
                      <div key={m.methodName} className="flex justify-between text-sm mt-1">
                        <span className="text-slate-300">{m.methodName} ({m.count}){m.isCash && <span className="text-red-500/70"> · gaveta</span>}</span>
                        <span className="text-red-300">-{m.isDivisa ? `$${m.totalUsd.toFixed(2)}` : `Bs ${m.totalBs.toFixed(2)}`}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-500 mt-2">Los pagos en efectivo ya estan restados del efectivo esperado en gaveta.</p>
                  </div>
                )}
```

- [ ] **Step 2: Replicar los dos bloques en el panel "Sesión actual"**

En el mismo archivo, el panel "Sesión actual" usa `summary` (no `closeSummary`) y muestra "Efectivo esperado en gaveta" en ~línea 421-433. Insertar los **mismos dos bloques** justo después del bloque de "Otros canales" de ese panel, cambiando `closeSummary` por `summary`. (Buscar el segundo uso de `electronicByMethod` en el panel en vivo; si ese panel no lo renderiza, colocarlos tras el bloque de efectivo esperado.)

- [ ] **Step 3: Replicar en la página read-only `cash/sessions/[id]/page.tsx`**

Esa página consume el mismo `summary` (`receiptCollectionsByMethod`/`receiptPaymentsByMethod` vienen incluidos). Agregar los dos bloques (idénticos a Step 1 pero usando la variable `summary` de esa página) en la columna izquierda, después de "Otros canales".

- [ ] **Step 4: Typecheck Web**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 5: Verificación visual**

Run: con la API y Web levantadas, abrir `http://localhost:3000/cash/sessions/<id de la sesión con recibos>` y confirmar que se ven los bloques "Cobros CxC" / "Pagos CxP" y que el efectivo esperado coincide.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(dashboard)/cash/[id]/page.tsx apps/web/src/app/(dashboard)/cash/sessions/[id]/page.tsx
git commit -m "feat: Session 64 - cobros CxC / pagos CxP visibles en cierre y detalle de sesion"
```

---

## Task 4: Recibos en el PDF de cierre (`cash-session-pdf.service.ts`)

**Files:**
- Modify: `apps/api/src/modules/cash-registers/cash-session-pdf.service.ts` (método `generate`, después de la sección "VUELTOS" y antes de "MOVIMIENTOS DE CAJA", ~línea 246)

- [ ] **Step 1: Consultar los recibos posteados de la sesión dentro de `generate`**

En `generate`, después de obtener `movements` (línea ~160) y antes del render, agregar:
```ts
    const sessionReceipts = await this.prisma.receipt.findMany({
      where: { cashSessionId: sessionId, status: 'POSTED', NOT: { type: 'COLLECTION', totalUsd: { lt: -0.01 } } },
      include: { payments: { include: { method: { select: { name: true } } } }, customer: { select: { name: true } }, supplier: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const collections = sessionReceipts.filter((r) => r.type === 'COLLECTION');
    const cxpPayments = sessionReceipts.filter((r) => r.type === 'PAYMENT');
```

- [ ] **Step 2: Añadir una sección de recibos al PDF**

Después del bloque de "VUELTOS / CAMBIOS ENTREGADOS" (línea ~246) y antes de "MOVIMIENTOS DE CAJA", insertar el render usando las columnas existentes `MOV_COLS` (Hora/Tipo/Concepto/Usuario/USD/Bs) para no crear constantes nuevas:
```ts
    // Recibos de cobro/pago (CxC/CxP) posteados a esta sesion
    const renderReceiptGroup = (title: string, list: any[], color: string) => {
      if (list.length === 0) return;
      y = this.checkPage(doc, y, 60);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text(title, 40, y);
      y += 18;
      y = this.drawTableHeader(doc, y, MOV_COLS);
      let tu = 0, tb = 0;
      for (const r of list) {
        for (const p of r.payments) {
          y = this.checkPage(doc, y, 30);
          if (y === 40) y = this.drawTableHeader(doc, y, MOV_COLS);
          tu += p.amountUsd; tb += p.amountBs;
          y = this.drawRow(doc, y, MOV_COLS, [
            this.time(r.createdAt),
            r.number || '—',
            (r.customer?.name || r.supplier?.name || '—'),
            p.method?.name || '',
            `$${this.fmt(p.amountUsd)}`,
            this.fmt(p.amountBs),
          ]);
        }
      }
      doc.moveTo(40, y).lineTo(555, y).stroke('#cbd5e1');
      y += 3;
      y = this.drawRow(doc, y, MOV_COLS, ['', '', '', 'Total', `$${this.fmt(tu)}`, this.fmt(tb)], true);
      y += 10;
    };
    renderReceiptGroup('COBROS CxC (recibos)', collections, '#059669');
    renderReceiptGroup('PAGOS CxP (recibos)', cxpPayments, '#dc2626');
```
(El parámetro `color` queda disponible por si luego se desea colorear; no es obligatorio usarlo en este paso.)

- [ ] **Step 3: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Verificar el PDF**

Run (con API levantada): script Node que hace GET a `/cash-sessions/<id con recibos>/movements-report` con el token y confirma `%PDF-` + bytes > 0. (Reusar el patrón de la prueba de PDF de la sesión 63.)
Expected: status 200, content-type application/pdf, header `%PDF-`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cash-registers/cash-session-pdf.service.ts
git commit -m "feat: Session 64 - PDF de cierre incluye cobros CxC y pagos CxP por recibo"
```

---

## Task 5: Recibos en la vista global de movimientos

**Files:**
- Modify: `apps/api/src/modules/cash-registers/cash-registers.service.ts` (método `getGlobalMovementsData`, agregado en sesión 63)
- Modify: `apps/api/src/modules/cash-registers/cash-session-pdf.service.ts` (método `generateGlobalReport`)
- Modify: `apps/web/src/app/(dashboard)/cash/movements/page.tsx`

- [ ] **Step 1: Leer recibos en `getGlobalMovementsData`**

En `getGlobalMovementsData`, después del bloque que arma las filas de pagos de facturas y **antes** del bloque de `cashMovements`, agregar la lectura de recibos por sesión seleccionada:
```ts
    // Recibos CxC/CxP posteados a las sesiones seleccionadas
    const sessionReceipts = await this.prisma.receipt.findMany({
      where: { cashSessionId: { in: sessionIds }, status: 'POSTED', NOT: { type: 'COLLECTION', totalUsd: { lt: -0.01 } } },
      include: {
        payments: { include: { method: { select: { id: true, name: true, isDivisa: true, isCash: true } } } },
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    for (const rc of sessionReceipts) {
      const session = sessionById.get(rc.cashSessionId);
      if (!session) continue;
      for (const rp of rc.payments) {
        if (methodSet && !methodSet.has(rp.methodId)) continue;
        const when = rp.createdAt;
        if (fromDate && when < fromDate) continue;
        if (toDate && when > toDate) continue;
        rows.push({
          kind: 'RECEIPT',
          receiptType: rc.type, // COLLECTION | PAYMENT
          date: when,
          sessionId: session.id,
          cashRegisterId: session.cashRegisterId,
          cashRegisterName: session.cashRegister?.name || '',
          cashierName: session.openedBy?.name || '',
          methodId: rp.methodId,
          methodName: rp.method?.name || rp.methodId,
          isDivisa: !!rp.method?.isDivisa,
          isCash: !!rp.method?.isCash,
          partyName: rc.customer?.name || rc.supplier?.name || '—',
          receiptNumber: rc.number,
          reference: rp.reference || null,
          amountUsd: rp.amountUsd,
          amountBs: rp.amountBs,
        });
      }
    }
```
Nota: el filtro por método ya NO debe cortar globalmente los movimientos manuales por el `if (!methodSet)` existente — mantener ese `if` solo alrededor del bloque de `cashMovements`; las filas de recibos se agregan siempre (respetando `methodSet` por fila, como arriba).

- [ ] **Step 2: Sumar recibos al `summary` y a `byMethod`**

En el bucle de resumen (`for (const r of rows)`), extender la lógica:
```ts
    let collectionUsd = 0, collectionBs = 0, cxpUsd = 0, cxpBs = 0, collectionCount = 0, cxpCount = 0;
    // dentro del for:
      } else if (r.kind === 'RECEIPT') {
        if (r.receiptType === 'COLLECTION') {
          collectionCount += 1; collectionUsd += r.amountUsd; collectionBs += r.amountBs;
          // entra a byMethod (ingreso) para cotejo "todos los Zelle"
          if (!byMethod[r.methodName]) byMethod[r.methodName] = { methodName: r.methodName, count: 0, totalUsd: 0, totalBs: 0 };
          byMethod[r.methodName].count += 1;
          byMethod[r.methodName].totalUsd += r.amountUsd;
          byMethod[r.methodName].totalBs += r.amountBs;
        } else {
          cxpCount += 1; cxpUsd += r.amountUsd; cxpBs += r.amountBs;
        }
      }
```
Y agregar al objeto `summary` retornado:
```ts
    summary.collectionCount = collectionCount;
    summary.collectionUsd = round(collectionUsd);
    summary.collectionBs = round(collectionBs);
    summary.cxpCount = cxpCount;
    summary.cxpUsd = round(cxpUsd);
    summary.cxpBs = round(cxpBs);
```
(Inicializar estos campos en `emptySummary` también: `collectionCount:0, collectionUsd:0, collectionBs:0, cxpCount:0, cxpUsd:0, cxpBs:0`.)

- [ ] **Step 3: Renderizar filas RECEIPT en la tabla del frontend**

En `apps/web/.../cash/movements/page.tsx`, en el `.map` de filas, manejar el nuevo `kind`:
```tsx
                const isReceipt = r.kind === 'RECEIPT';
                const isCxp = isReceipt && r.receiptType === 'PAYMENT';
                const isOutflow = isExpense || isCxp; // egreso manual o pago CxP
                const sign = isOutflow ? '-' : '';
```
Y en la celda "Tipo / Metodo", agregar una rama para recibos (badge distintivo) antes de la de pago:
```tsx
                      {isReceipt ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isCxp ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                          {isCxp ? 'Pago CxP' : 'Cobro CxC'} · {r.methodName}
                        </span>
                      ) : isMov ? ( /* ...badge ingreso/egreso existente... */ ) : ( /* ...badge metodo existente... */ )}
```
Y en la celda "Detalle": `isReceipt ? (<span><span className="text-white">{r.receiptNumber}</span> · {r.partyName}</span>) : ...`. En "Referencia": `isReceipt ? (r.reference || '—') : ...`. Actualizar las clases de monto USD/Bs para usar `isOutflow` en vez de solo `isExpense`.

- [ ] **Step 4: Mostrar cobros/pagos en las tarjetas de resumen**

Agregar dos tarjetas (o ampliar las existentes) usando `summary.collectionUsd/collectionCount` y `summary.cxpUsd/cxpCount`, con el mismo estilo de las tarjetas actuales.

- [ ] **Step 5: Incluir recibos en `generateGlobalReport` (PDF)**

En `generateGlobalReport`, las filas RECEIPT de tipo COLLECTION ya entran por método (Step 1-2 las metió en `byMethod`/rows). Para el PDF: las filas `kind === 'RECEIPT'` con `receiptType === 'COLLECTION'` deben agruparse junto a los pagos por método (cambiar `rows.filter(r => r.kind === 'PAYMENT')` por `rows.filter(r => r.kind === 'PAYMENT' || (r.kind === 'RECEIPT' && r.receiptType === 'COLLECTION'))`, y al construir la fila usar `p.invoiceNumber || p.receiptNumber` y `p.customerName || p.partyName`). Las filas CxP (`receiptType === 'PAYMENT'`) van en una sección aparte "PAGOS CxP (recibos)" análoga a la de movimientos manuales.

- [ ] **Step 6: Typecheck API + Web**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && cd ../web && npx tsc --noEmit -p tsconfig.json`
Expected: ambos exit 0.

- [ ] **Step 7: Verificación E2E de la vista global**

Run (API levantada): script Node que llama `/cash/movements` sin filtro y confirma que aparecen filas `kind: 'RECEIPT'` y que `summary.collectionUsd`/`cxpUsd` son coherentes; y que al filtrar por un método (`methodIds=<id de Zelle>`) salen tanto pagos de venta como cobros CxC de ese método.
Expected: filas RECEIPT presentes; el filtro por método incluye ventas + cobros del mismo método.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/cash-registers/cash-registers.service.ts apps/api/src/modules/cash-registers/cash-session-pdf.service.ts apps/web/src/app/(dashboard)/cash/movements/page.tsx
git commit -m "feat: Session 64 - vista global de movimientos incluye cobros CxC y pagos CxP"
```

---

## Task 6: Cierre — actualizar PROGRESS.md y marcar el pendiente

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Marcar el pendiente de recibos como parcialmente hecho**

En la lista `🔨 PENDIENTE`, editar el ítem "Cobros CxC / pagos CxP / compras al contado deben afectar la CAJA" para reflejar que **recibos CxC/CxP ya afectan la caja (Fase 1 hecha)** y que **solo queda compras al contado (Fase 2)**.

- [ ] **Step 2: Agregar entrada de la sesión en `🚀 Pendiente de DEPLOY`**

Describir: recibos CxC/CxP entran al arqueo/cierre/PDF y a la vista global; sin migración; enfoque solo-lectura sobre `Receipt` POSTED; fórmula de gaveta ajustada; probado E2E.

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: Session 64 - PROGRESS recibos afectan caja (Fase 1)"
```

---

## Notas de verificación y riesgos

- **Riesgo principal:** tocar la matemática del arqueo (`cashExpected`). Mitigación: el cambio es **aditivo y simétrico** (cobros suman, pagos restan, solo el efectivo), y los recibos POSTED son inmutables. Verificar siempre con un caso **efectivo** y un caso **electrónico** (el electrónico NO debe mover la gaveta, solo aparecer en el desglose).
- **Doble conteo:** los reintegros (COLLECTION con total < 0) se **excluyen** de la lectura nueva porque ya crean su `CashMovement` en `post()`. El filtro `NOT: { type: 'COLLECTION', totalUsd: { lt: -0.01 } }` lo garantiza en los 3 puntos (arqueo, PDF, vista global).
- **Sesiones ya cerradas:** usan el snapshot persistido (`session.expectedUsd/Bs`), así que **no cambian retroactivamente** — esta mejora aplica a sesiones que se cierren a partir del deploy.
- **Login de pruebas:** la clave local de `admin@trinity.com` se reseteó a `Test1234!` en la sesión 63 (solo afecta la copia local, nunca prod). Si expira/cambia, resetear con bcrypt como entonces.
- **Sin cambios de schema** en toda la Fase 1.

## Self-Review (cobertura del spec)

- ✅ CxC entra a la gaveta si es efectivo → Task 1 (`collectionsCashUsd/Bs`).
- ✅ CxP sale de la gaveta si es efectivo → Task 1 (`cxpCashUsd/Bs`).
- ✅ Respeta método (efectivo vs electrónico) → se usa `method.isCash`/`isDivisa` por pago.
- ✅ Persistido al cierre → Task 2 (automático vía `getSessionSalesData`).
- ✅ Visible para el cajero → Task 3 (modal + paneles), Task 4 (PDF).
- ✅ Visible en la vista global + cotejo por método → Task 5.
- ✅ Sin doble conteo de reintegros → filtro `NOT` en Tasks 1/4/5.
- ✅ Sin migración, reversa automática por estado POSTED inmutable.
- ⏸️ Compras al contado → explícitamente Fase 2, fuera de alcance.
