# Arqueo de Caja por Moneda y Canal — Implementation Plan

> **For agentic workers:** Implementa este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`) para tracking. **Este proyecto NO tiene infraestructura de tests** (sin jest/vitest, sin `.spec.ts`), así que la verificación de cada tarea es por **build + consultas SQL + prueba manual en UI**, no TDD. No introduzcas un framework de tests (YAGNI).

**Goal:** Que el cierre de caja calcule el esperado solo con el **efectivo físico realmente recibido por moneda** (Efectivo USD / Efectivo Bs), muestre los canales electrónicos (Zelle, punto, pago móvil, transferencia) como **referencia informativa** sin exigir conteo ni generar faltante, no bloquee el cierre por descuadre, y **persista la diferencia por moneda** para auditoría.

**Architecture:**
- **DB (Prisma 5):** flag nuevo `PaymentMethod.isCash`; columnas `expectedUsd/expectedBs/differenceUsd/differenceBs` en `CashSession`. Migración aditiva con `IF NOT EXISTS`; seed y `deploy/fix-schema.sql` actualizados.
- **Backend (NestJS):** reescribir `getSessionSalesData` para devolver `cashExpectedUsd/cashExpectedBs` (solo efectivo) y `electronicByMethod` (informativo). `closeSession` y `getSessionSummary` usan el esperado de efectivo y persisten las diferencias.
- **Frontend (Next.js):** rediseñar el modal de cierre en dos secciones — "Efectivo (gaveta)" con esperado + contado + diferencia por moneda; "Otros canales (referencia)" con el esperado por método. Corregir el cálculo client-side de la diferencia.

**Tech Stack:** NestJS, Prisma 5 (PostgreSQL 15), Next.js 14 (App Router), TypeScript, pnpm monorepo.

---

## Contexto del problema (por qué)

Hoy `getSessionSalesData` calcula (`apps/api/src/modules/cash-registers/cash-registers.service.ts:427-435`):

```ts
salesTotalUsd = invoices.reduce((s, i) => s + i.totalUsd, 0);  // total de la venta EN USD
salesTotalBs  = invoices.reduce((s, i) => s + i.totalBs, 0);   // la MISMA venta EN Bs
```

Y `closeSession` (líneas 185-188):

```ts
expectedUsd = openingBalanceUsd + summary.totalUsd;   // <- incluye USD de TODA venta
differenceUsd = closingBalanceUsd - expectedUsd;
```

Resultado: una venta cobrada 100% en Efectivo Bs genera `expectedUsd > 0` (el valor en dólares de la venta), así que al contar 0 USD aparece un **faltante fantasma**. El método de pago real (`Payment.amountUsd`/`amountBs` por método) se ignora en el esperado.

`PaymentMethod.isDivisa` NO sirve para distinguir efectivo de electrónico (Zelle y Efectivo USD son ambos `isDivisa=true`). Por eso se agrega `isCash`.

## Modelo de cálculo correcto (referencia para todas las tareas)

```
cashExpectedUsd = openingBalanceUsd
                + Σ payment.amountUsd  WHERE method.isCash && method.isDivisa     // Efectivo USD
                + movInUsd - movOutUsd                                            // movimientos manuales en USD
                // el vuelto no puede ser en divisas, no resta USD

cashExpectedBs  = openingBalanceBs
                + Σ payment.amountBs   WHERE method.isCash && !method.isDivisa     // Efectivo Bs
                - Σ payment.changeAmountBs                                         // vuelto entregado en Bs
                + movInBs - movOutBs                                              // movimientos manuales en Bs

differenceUsd = closingBalanceUsd(contado) - cashExpectedUsd
differenceBs  = closingBalanceBs(contado)  - cashExpectedBs
```

Los métodos `!isCash` (Zelle, punto, pago móvil, transferencia, Cashea, Crediagro) NO entran al efectivo de gaveta; se devuelven como `electronicByMethod` informativo (cada uno con su esperado en su moneda).

## File Structure

- **Modificar** `packages/database/prisma/schema.prisma` — `isCash` en `PaymentMethod`; `expectedUsd/expectedBs/differenceUsd/differenceBs` en `CashSession`.
- **Crear** `packages/database/prisma/migrations/<timestamp>_cash_arqueo_by_currency/migration.sql` — ALTER TABLE aditivos con `IF NOT EXISTS` + seed de `isCash`.
- **Modificar** `packages/database/prisma/seed.ts:480-484` — `isCash: true` en Efectivo USD/Bs.
- **Modificar** `deploy/fix-schema.sql` — red de seguridad para las columnas nuevas.
- **Modificar** `apps/api/src/modules/cash-registers/cash-registers.service.ts` — `getSessionSalesData` (351-447), `closeSession` (156-194), `getSessionSummary` (196-232).
- **Modificar** `apps/web/src/app/(dashboard)/cash/[id]/page.tsx` — cálculo de diferencia (295-299), modal de cierre (846-901), detalle de historial (994-1013).

## Fuera de alcance (v1, explícito)

- **No** se captura/persiste el "contado" de los canales electrónicos (solo se muestra el esperado como referencia). Capturar conteo electrónico por método requiere tabla hija; se deja como mejora futura.
- **No** se hace bloqueo del cierre por descuadre (sigue siendo no-bloqueante, solo se persiste y se muestra).
- El reporte cross-sesión de descuadres por cajero es la Tarea 6 (opcional).

---

### Task 1: Migración DB — `isCash` + columnas de diferencia en `CashSession`

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (modelo `PaymentMethod` ~798-815; modelo `CashSession` ~872-890)
- Create: `packages/database/prisma/migrations/<timestamp>_cash_arqueo_by_currency/migration.sql`
- Modify: `packages/database/prisma/seed.ts:480-484`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Agregar `isCash` al modelo `PaymentMethod` en `schema.prisma`**

En el bloque `model PaymentMethod`, debajo de `isDivisa`:

```prisma
  isDivisa           Boolean             @default(false)
  isCash             Boolean             @default(false)
```

- [ ] **Step 2: Agregar columnas de cierre al modelo `CashSession` en `schema.prisma`**

En `model CashSession`, junto a `closingBalanceBs`:

```prisma
  closingBalanceUsd Float?
  closingBalanceBs  Float?
  expectedUsd       Float?
  expectedBs        Float?
  differenceUsd     Float?
  differenceBs      Float?
```

- [ ] **Step 3: Generar la migración localmente**

Run:
```bash
cd packages/database
npx prisma migrate dev --name cash_arqueo_by_currency --create-only
```
Esto crea la carpeta `migrations/<timestamp>_cash_arqueo_by_currency/migration.sql`. `--create-only` la genera sin aplicarla, para poder editarla.

- [ ] **Step 4: Reescribir el `migration.sql` con `IF NOT EXISTS` (requisito CLAUDE.md) + seed de `isCash`**

Reemplaza el contenido del `migration.sql` generado por:

```sql
-- Flag para distinguir efectivo físico (gaveta) de pagos electrónicos
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "isCash" BOOLEAN NOT NULL DEFAULT false;

-- Snapshot del esperado y diferencia al cerrar la sesión (auditoría de descuadres)
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "expectedUsd"   DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "expectedBs"    DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "differenceUsd" DOUBLE PRECISION;
ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "differenceBs"  DOUBLE PRECISION;

-- Marcar como efectivo los métodos de gaveta (por id de seed y por nombre, por robustez)
UPDATE "PaymentMethod"
   SET "isCash" = true
 WHERE id IN ('pm_cash_usd', 'pm_cash_bs')
    OR name IN ('Efectivo USD', 'Efectivo Bs');
```

- [ ] **Step 5: Sembrar `isCash` en `seed.ts` (para entornos nuevos)**

En `packages/database/prisma/seed.ts:480-484`, cambia:

```ts
  const pmCashUsd = await prisma.paymentMethod.create({
    data: { id: 'pm_cash_usd', name: 'Efectivo USD', isDivisa: true, isCash: true, sortOrder: 1 },
  });
  const pmCashBs = await prisma.paymentMethod.create({
    data: { id: 'pm_cash_bs', name: 'Efectivo Bs', isDivisa: false, isCash: true, sortOrder: 2 },
  });
```

- [ ] **Step 6: Agregar las columnas a `deploy/fix-schema.sql` (red de seguridad)**

Añade al final de `deploy/fix-schema.sql` el mismo SQL del Step 4 (los `ALTER TABLE ... IF NOT EXISTS` y el `UPDATE` de `isCash`). Esto garantiza que un deploy con migración fallida igual quede con el esquema correcto.

- [ ] **Step 7: Aplicar la migración en local y regenerar el cliente**

Run:
```bash
cd packages/database
npx prisma migrate dev
npx prisma generate
```
Expected: la migración aplica sin error y el cliente Prisma se regenera con `isCash`, `expectedUsd`, etc.

- [ ] **Step 8: Verificar columnas y seed en local (SQL)**

Run (ajusta a tu conexión local):
```bash
psql "$LOCAL_DATABASE_URL" -c "SELECT name, \"isCash\", \"isDivisa\" FROM \"PaymentMethod\" WHERE \"isCash\" = true;"
```
Expected: solo `Efectivo USD` (isDivisa=t) y `Efectivo Bs` (isDivisa=f) con `isCash=t`.

- [ ] **Step 9: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations packages/database/prisma/seed.ts deploy/fix-schema.sql
git commit -m "feat: Session 60 - flag isCash y columnas de descuadre en CashSession"
```

---

### Task 2: Backend — `getSessionSalesData` calcula efectivo esperado por moneda + canales electrónicos

**Files:**
- Modify: `apps/api/src/modules/cash-registers/cash-registers.service.ts:351-447`

- [ ] **Step 1: Reescribir el cuerpo de `getSessionSalesData` (a partir del loop de pagos)**

Reemplaza desde la declaración `const byMethod` (línea ~374) hasta el `return` (línea ~446) por:

```ts
    const byMethod: Record<string, { methodName: string; count: number; totalUsd: number; totalBs: number }> = {};
    const electronicByMethod: Record<string, { methodName: string; isDivisa: boolean; count: number; expectedUsd: number; expectedBs: number }> = {};
    const changeOutflows: Array<{ invoiceNumber: string; changeBs: number; changeMethodName: string }> = [];
    let totalChangeBs = 0;
    let cashSalesUsd = 0; // Efectivo USD recibido (método isCash && isDivisa)
    let cashSalesBs = 0;  // Efectivo Bs recibido  (método isCash && !isDivisa)

    for (const inv of invoices) {
      for (const p of inv.payments) {
        const method = (p as any).method;
        const methodName = method?.name || p.methodId;

        // Desglose total por método (display)
        if (!byMethod[methodName]) {
          byMethod[methodName] = { methodName, count: 0, totalUsd: 0, totalBs: 0 };
        }
        byMethod[methodName].count += 1;
        byMethod[methodName].totalUsd += p.amountUsd;
        byMethod[methodName].totalBs += p.amountBs;

        // Segregar efectivo de gaveta vs canales electrónicos
        if (method?.isCash) {
          if (method.isDivisa) cashSalesUsd += p.amountUsd;
          else cashSalesBs += p.amountBs;
        } else {
          if (!electronicByMethod[methodName]) {
            electronicByMethod[methodName] = { methodName, isDivisa: !!method?.isDivisa, count: 0, expectedUsd: 0, expectedBs: 0 };
          }
          electronicByMethod[methodName].count += 1;
          electronicByMethod[methodName].expectedUsd += p.amountUsd;
          electronicByMethod[methodName].expectedBs += p.amountBs;
        }

        // Vuelto (sale de la gaveta en Bs)
        if ((p as any).changeAmountBs > 0) {
          changeOutflows.push({
            invoiceNumber: inv.number || 'S/N',
            changeBs: (p as any).changeAmountBs,
            changeMethodName: (p as any).changeMethod?.name || 'Efectivo Bs',
          });
          totalChangeBs += (p as any).changeAmountBs;
        }
      }
    }

    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId } });

    // Movimientos de caja (efectivo manual: gastos/ingresos)
    const cashMovements = await this.prisma.cashMovement.findMany({
      where: { cashSessionId: sessionId },
      include: {
        createdBy: { select: { id: true, name: true } },
        expense: { select: { id: true, description: true, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let movementsIncomeUsd = 0;
    let movementsIncomeBs = 0;
    let movementsExpenseUsd = 0;
    let movementsExpenseBs = 0;
    // Segregados por moneda real del movimiento (para el efectivo esperado)
    let movInCashUsd = 0, movInCashBs = 0, movOutCashUsd = 0, movOutCashBs = 0;

    for (const mov of cashMovements) {
      const isUsd = mov.currency === 'USD';
      if (mov.type === 'INCOME') {
        movementsIncomeUsd += mov.amountUsd;
        movementsIncomeBs += mov.amountBs;
        if (isUsd) movInCashUsd += mov.amountUsd; else movInCashBs += mov.amountBs;
      } else {
        movementsExpenseUsd += mov.amountUsd;
        movementsExpenseBs += mov.amountBs;
        if (isUsd) movOutCashUsd += mov.amountUsd; else movOutCashBs += mov.amountBs;
      }
    }

    const salesTotalUsd = invoices.reduce((s, i) => s + i.totalUsd, 0);
    const salesTotalBs = invoices.reduce((s, i) => s + i.totalBs, 0);

    const openingUsd = session?.openingBalanceUsd || 0;
    const openingBs = session?.openingBalanceBs || 0;

    // Efectivo físico esperado en gaveta (lo que de verdad se arquea)
    const cashExpectedUsd = Math.round((openingUsd + cashSalesUsd + movInCashUsd - movOutCashUsd) * 100) / 100;
    const cashExpectedBs = Math.round((openingBs + cashSalesBs - totalChangeBs + movInCashBs - movOutCashBs) * 100) / 100;

    return {
      openingBalanceUsd: openingUsd,
      openingBalanceBs: openingBs,
      invoiceCount: invoices.length,
      totalUsd: salesTotalUsd + movementsIncomeUsd - movementsExpenseUsd,
      totalBs: salesTotalBs + movementsIncomeBs - movementsExpenseBs,
      salesTotalUsd,
      salesTotalBs,
      paymentsByMethod: Object.values(byMethod),
      // NUEVO: efectivo de gaveta y canales electrónicos
      cashSalesUsd: Math.round(cashSalesUsd * 100) / 100,
      cashSalesBs: Math.round(cashSalesBs * 100) / 100,
      cashExpectedUsd,
      cashExpectedBs,
      electronicByMethod: Object.values(electronicByMethod),
      changeOutflows,
      totalChangeBs,
      cashMovements,
      movementsIncomeUsd: Math.round(movementsIncomeUsd * 100) / 100,
      movementsIncomeBs: Math.round(movementsIncomeBs * 100) / 100,
      movementsExpenseUsd: Math.round(movementsExpenseUsd * 100) / 100,
      movementsExpenseBs: Math.round(movementsExpenseBs * 100) / 100,
    };
```

- [ ] **Step 2: Verificar que compila**

Run:
```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: sin errores de tipo (el `include: { payments: { include: { method: true ... } } }` de la línea 371 ya trae `method.isCash`/`isDivisa` tras `prisma generate` de la Task 1).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/cash-registers/cash-registers.service.ts
git commit -m "feat: Session 60 - efectivo esperado por moneda y canales electronicos en summary"
```

---

### Task 3: Backend — `closeSession` y `getSessionSummary` usan efectivo esperado y persisten diferencias

**Files:**
- Modify: `apps/api/src/modules/cash-registers/cash-registers.service.ts:156-232`

- [ ] **Step 1: Reescribir `closeSession` (156-194) para usar el efectivo esperado y persistir el snapshot**

Reemplaza el cuerpo de `closeSession` por:

```ts
  async closeSession(sessionId: string, dto: CloseSessionDto, userId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: { cashRegister: true },
    });
    if (!session) throw new NotFoundException('Sesion no encontrada');
    if (session.status === 'CLOSED') throw new BadRequestException('Esta sesion ya esta cerrada');

    const summary = await this.getSessionSalesData(session.id, session.cashRegisterId, session.openedAt);

    // El esperado del arqueo es SOLO el efectivo físico (gaveta), por moneda.
    const expectedUsd = summary.cashExpectedUsd;
    const expectedBs = summary.cashExpectedBs;
    const differenceUsd = Math.round((dto.closingBalanceUsd - expectedUsd) * 100) / 100;
    const differenceBs = Math.round((dto.closingBalanceBs - expectedBs) * 100) / 100;

    const updatedSession = await this.prisma.cashSession.update({
      where: { id: sessionId },
      data: {
        closingBalanceUsd: dto.closingBalanceUsd,
        closingBalanceBs: dto.closingBalanceBs,
        expectedUsd,
        expectedBs,
        differenceUsd,
        differenceBs,
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: userId,
        notes: dto.notes,
      },
      include: {
        cashRegister: true,
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    return {
      session: updatedSession,
      summary: { ...summary, expectedUsd, expectedBs, differenceUsd, differenceBs },
    };
  }
```

- [ ] **Step 2: Reescribir el cálculo de esperado en `getSessionSummary` (215-231)**

Reemplaza desde `const expectedUsd = ...` hasta el `return` por:

```ts
    // Para sesiones cerradas, preferir el snapshot persistido al cierre (auditoría inmutable).
    // Para sesiones abiertas, calcular el efectivo esperado en vivo.
    const expectedUsd = session.expectedUsd ?? salesData.cashExpectedUsd;
    const expectedBs = session.expectedBs ?? salesData.cashExpectedBs;
    const differenceUsd = session.differenceUsd ?? (
      session.closingBalanceUsd != null ? Math.round((session.closingBalanceUsd - expectedUsd) * 100) / 100 : null
    );
    const differenceBs = session.differenceBs ?? (
      session.closingBalanceBs != null ? Math.round((session.closingBalanceBs - expectedBs) * 100) / 100 : null
    );

    return {
      session,
      ...salesData,
      expectedUsd,
      expectedBs,
      differenceUsd,
      differenceBs,
    };
```

- [ ] **Step 3: Verificar que compila**

Run:
```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: sin errores (los campos `expectedUsd`, `differenceUsd`, etc. existen en `CashSession` tras Task 1).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cash-registers/cash-registers.service.ts
git commit -m "feat: Session 60 - cierre usa efectivo esperado y persiste descuadre por moneda"
```

---

### Task 4: Frontend — corregir cálculo de diferencia y rediseñar el modal de cierre

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cash/[id]/page.tsx:295-299` (cálculo) y `:846-901` (modal)

- [ ] **Step 1: Corregir el cálculo client-side de la diferencia (295-299)**

Reemplaza:

```ts
  const closeDiffUsd = closeSummary
    ? (parseFloat(closingUsd) || 0) - (closeSummary.openingBalanceUsd + closeSummary.totalUsd)
    : null;
  const closeDiffBs = closeSummary
    ? (parseFloat(closingBs) || 0) - (closeSummary.openingBalanceBs + closeSummary.totalBs)
    : null;
```

por (usa el efectivo esperado del backend):

```ts
  const closeDiffUsd = closeSummary
    ? (parseFloat(closingUsd) || 0) - (closeSummary.cashExpectedUsd ?? 0)
    : null;
  const closeDiffBs = closeSummary
    ? (parseFloat(closingBs) || 0) - (closeSummary.cashExpectedBs ?? 0)
    : null;
```

- [ ] **Step 2: Rediseñar el bloque de resumen del modal (846-862) en dos secciones**

Reemplaza el bloque `{closeSummary && ( ... )}` (846-862, el que hoy muestra "Ventas por método" con `${m.totalUsd}`) por:

```tsx
            {closeSummary && (
              <div className="mb-4 space-y-3">
                {/* Efectivo de gaveta: lo que SÍ se arquea */}
                <div className="p-3 rounded-lg bg-slate-700/30">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Efectivo esperado en gaveta</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-300">Efectivo USD</span>
                    <span className="text-white">${(closeSummary.cashExpectedUsd ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-300">Efectivo Bs</span>
                    <span className="text-white">Bs {(closeSummary.cashExpectedBs ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Otros canales: informativo, NO entra al conteo de gaveta */}
                {closeSummary.electronicByMethod?.length > 0 && (
                  <div className="p-3 rounded-lg bg-slate-700/30">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Otros canales (cuadrar aparte)</h4>
                    {closeSummary.electronicByMethod.map((m: any) => (
                      <div key={m.methodName} className="flex justify-between text-sm mt-1">
                        <span className="text-slate-300">{m.methodName} ({m.count})</span>
                        <span className="text-slate-200">
                          {m.isDivisa ? `$${m.expectedUsd.toFixed(2)}` : `Bs ${m.expectedBs.toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-500 mt-2">Estos pagos no están en la gaveta; se cuadran contra banco/plataforma.</p>
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 3: Aclarar las etiquetas de los inputs de conteo (864-885)**

Cambia los labels para dejar claro que es efectivo:
- `Efectivo USD contado fisicamente` → mantener.
- `Efectivo Bs contado fisicamente` → mantener.

(No cambian; solo confirmar que siguen presentes. El recuadro de "Diferencia USD/Bs" de 887-901 ya queda correcto porque `closeDiffUsd/Bs` ahora usan el efectivo esperado.)

- [ ] **Step 4: Build del frontend**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: sin errores de tipo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(dashboard)/cash/[id]/page.tsx
git commit -m "feat: Session 60 - cierre de caja por moneda con canales electronicos informativos"
```

---

### Task 5: Frontend — detalle de historial muestra esperado/diferencia de efectivo

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cash/[id]/page.tsx:994-1013`

- [ ] **Step 1: Aclarar etiquetas en el detalle de cierre histórico**

En el bloque del detalle (994-1013) cambia las etiquetas `Esperado USD` / `Esperado Bs` por `Esperado efectivo USD` / `Esperado efectivo Bs` para evitar confusión con los canales electrónicos:

```tsx
                      <span className="text-slate-300">Esperado efectivo USD</span>
```
```tsx
                      <span className="text-slate-300">Esperado efectivo Bs</span>
```

(Los valores `historyDetail.expectedUsd/expectedBs/differenceUsd/differenceBs` ya vienen correctos del backend tras Task 3 — para sesiones cerradas son el snapshot persistido.)

- [ ] **Step 2: Build del frontend**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(dashboard)/cash/[id]/page.tsx
git commit -m "feat: Session 60 - detalle de cierre etiqueta esperado de efectivo"
```

---

### Task 6 (opcional / futuro): Reporte de descuadres por cajero y fecha

> Solo si el usuario lo confirma. Aprovecha que `differenceUsd/differenceBs` ya quedan persistidos por sesión.

**Files:**
- Modify: `apps/api/src/modules/cash-registers/cash-registers.service.ts` (extender `findAllSessions` para devolver `differenceUsd/differenceBs`)
- Modify: `apps/web/src/app/(dashboard)/cash/sessions/page.tsx` (columna "Descuadre" con badge rojo/verde y filtro "solo descuadradas")

- [ ] **Step 1:** En `findAllSessions`, asegurar que el `select`/retorno incluya `differenceUsd`, `differenceBs`, `closedBy`.
- [ ] **Step 2:** En `sessions/page.tsx`, agregar columna "Descuadre" (USD/Bs) con color según `Math.abs(diff) < 0.01`, y un toggle de filtro que muestre solo sesiones con descuadre.
- [ ] **Step 3:** Commit `feat: Session 60 - reporte de descuadres por cajero/fecha`.

---

### Task 7: Deploy y verificación en producción

**Files:** ninguno (operativo)

- [ ] **Step 1: Pre-deploy checklist (CLAUDE.md)**

Run:
```bash
git status
```
Expected: limpio, todo commiteado (migración, schema, seed, fix-schema.sql, service, página).

- [ ] **Step 2: Deploy**

```bash
ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```
Expected: migración aplica (`isCash`, columnas de `CashSession`), build API+Web OK, PM2 reinicia, health check verde.

- [ ] **Step 3: Verificar esquema y seed en producción (SQL, solo lectura)**

```bash
ssh root@134.209.220.233 'cd /opt/Trinity && RAW="$(grep "^DATABASE_URL=" packages/database/.env | cut -d= -f2- | sed "s/^\"//; s/\"$//")"; PGURL="${RAW%%\?*}";
psql "$PGURL" -P pager=off -c "SELECT name, \"isCash\", \"isDivisa\" FROM \"PaymentMethod\" WHERE \"isCash\"=true;"
psql "$PGURL" -P pager=off -c "SELECT column_name FROM information_schema.columns WHERE table_name='"'"'CashSession'"'"' AND column_name LIKE '"'"'%xpected%'"'"' OR column_name LIKE '"'"'%ifference%'"'"';"'
```
Expected: `Efectivo USD` y `Efectivo Bs` con `isCash=t`; columnas `expectedUsd/expectedBs/differenceUsd/differenceBs` presentes.

- [ ] **Step 4: Verificación funcional del caso real (el faltante fantasma)**

Reproducir el caso del usuario en producción con SQL (solo lectura), calculando el efectivo esperado de una sesión abierta donde todo se cobró en Bs, y confirmar que `cashExpectedUsd = 0`:

```bash
ssh root@134.209.220.233 'cd /opt/Trinity && RAW="$(grep "^DATABASE_URL=" packages/database/.env | cut -d= -f2- | sed "s/^\"//; s/\"$//")"; PGURL="${RAW%%\?*}";
psql "$PGURL" -P pager=off -c "
SELECT
  COALESCE(SUM(CASE WHEN pm.\"isCash\" AND pm.\"isDivisa\"     THEN p.\"amountUsd\" END),0) AS efectivo_usd,
  COALESCE(SUM(CASE WHEN pm.\"isCash\" AND NOT pm.\"isDivisa\" THEN p.\"amountBs\"  END),0) AS efectivo_bs,
  COALESCE(SUM(CASE WHEN NOT pm.\"isCash\"                     THEN p.\"amountUsd\" END),0) AS electronico_usd
FROM \"Payment\" p
JOIN \"PaymentMethod\" pm ON pm.id = p.\"methodId\"
JOIN \"Invoice\" i ON i.id = p.\"invoiceId\"
WHERE i.\"paidAt\" >= now() - interval '"'"'1 day'"'"';"'
```
Expected: si el día fue 100% Efectivo Bs, `efectivo_usd = 0` → al contar 0 USD, diferencia USD = 0 (sin faltante fantasma).

- [ ] **Step 5: Prueba manual en UI**

Abrir una caja de prueba, cobrar una factura en Efectivo Bs, ir a "Cerrar caja":
- El "Efectivo esperado en gaveta" debe mostrar USD = $0.00 y Bs = el monto cobrado.
- Si el pago fue por Zelle/punto, debe aparecer en "Otros canales" y NO en el efectivo esperado.
- Contar 0 USD + el Bs real → diferencia en verde (cuadra).
- Confirmar cierre y reabrir el detalle en historial: el descuadre persistido debe coincidir.

- [ ] **Step 6: Actualizar PROGRESS.md y PROJECT.md (CLAUDE.md)**

Documentar Session 60: arqueo por moneda, flag `isCash`, descuadre persistido. Commit y push.

---

## Self-Review

**Spec coverage:**
- Esperado solo con efectivo físico por moneda → Task 2 (`cashExpectedUsd/Bs`) + Task 3 (closeSession lo usa). ✓
- Distinguir efectivo de electrónico (no `isDivisa`) → Task 1 (`isCash`) + Task 2 (segregación). ✓
- Canales electrónicos informativos → Task 2 (`electronicByMethod`) + Task 4 (UI "Otros canales"). ✓
- No bloqueante → no se añade validación de bloqueo; el cierre procede igual. ✓
- Persistir descuadre → Task 1 (columnas) + Task 3 (persistencia en `closeSession`). ✓
- Corregir el cálculo duplicado en frontend → Task 4 Step 1. ✓
- Reporte de descuadres → Task 6 (opcional). ✓

**Consistencia de nombres:** `cashExpectedUsd`, `cashExpectedBs`, `electronicByMethod`, `cashSalesUsd`, `cashSalesBs`, `isCash`, `expectedUsd/expectedBs/differenceUsd/differenceBs` se usan idénticos en backend (Task 2/3) y frontend (Task 4/5). ✓

**Placeholders:** sin TODO/TBD; todo el código está explícito. ✓

**Riesgo conocido:** el cálculo del esperado vive en backend y frontend (modal en vivo). Ambos se actualizan (Task 3 y Task 4 Step 1) para no divergir.
