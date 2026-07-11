# Plan: Libro mayor único de caja (CashLedger) + arreglo de gastos

**Fecha:** 2026-07-11
**Estado:** análisis + plan (NO implementado). Producción activa → cambios delicados, se hace por fases.
**Objetivo:** que el arqueo de caja siempre dé el efectivo real, con una sola fuente de verdad
(un libro mayor, como `StockMovement` es para el inventario), y arreglar el bug de gastos que
los registra siempre en USD sin importar el método de pago.

---

## 1. Diagnóstico del estado actual

### 1.1 Tablas de caja
- `CashRegister` — la caja física.
- `CashSession` — turno abierto/cerrado. Al cerrar guarda snapshot `expectedUsd/Bs`, `differenceUsd/Bs`.
- `CashMovement` — movimiento de gaveta (`type` INCOME/EXPENSE, `currency` USD/BS, `cashSessionId`, `isManual`). **No** tiene `methodId` ni `isCash`.
- `Payment` — pago de factura de venta (multi-método). Sin `cashSessionId`.
- `Receipt` + `ReceiptPayment` — recibo de cobro/pago y sus líneas por método.
- `ReceivablePayment` / `PayablePayment` — aplicación de un recibo (o compra) a una CxC/CxP.

### 1.2 El arqueo (fuente de fragilidad): 3 fuentes, 2 mecanismos de atribución
`cash-registers.service.ts → getSessionSalesData()` mezcla:
- **Ventas:** `Invoice` WHERE `cashRegisterId` + `paidAt ∈ [openedAt, closedAt]` (líneas 368-382). **Atribución por caja + ventana de tiempo, NO por sesión.** Incluye `RETURNED`.
  Efectivo por método: `method.isCash` → USD si `isDivisa`, Bs si no (líneas 406-408).
- **Movimientos:** `CashMovement` WHERE `cashSessionId` (líneas 448-475). Segrega **solo por `currency`**; NO mira si el método fue efectivo.
- **Recibos:** `Receipt` POSTED WHERE `cashSessionId`, lee `ReceiptPayment.method.isCash` (líneas ~502-535). Cobros suman, pagos restan.

Fórmula (líneas 544-545):
```
Esperado USD = apertura + ventasEfectivoUSD + movIN_USD − movOUT_USD + cobrosCxC_USD − pagosCxP_USD
Esperado Bs  = apertura + ventasEfectivoBs  − vueltosEfectivoBs + movIN_Bs − movOUT_Bs + cobrosCxC_Bs − pagosCxP_Bs
```
Cierre: snapshot inmutable (líneas 175-188). Sesiones cerradas usan snapshot, abiertas recalculan (221-230).

### 1.3 Qué crea cada documento (hoy)
| Documento | Tabla(s) | ¿Afecta arqueo? |
|---|---|---|
| Venta contado | `Payment` (sin sesión) | Sí, vía `cashRegisterId`+`paidAt` (solo efectivo) |
| Venta crédito | `Payment` + `Receivable` | No (se cobra con recibo) |
| Vuelto | `Payment.changeAmountBs` + `changeMethodId` | Resta gaveta **solo si método efectivo y solo Bs** |
| Compra crédito | `Payable` | No (se paga con recibo) |
| **Compra contado** | `Payable` + `PayablePayment` (**sin sesión, sin CashMovement**) | ❌ **NO entra al arqueo** |
| Recibo cobro (CxC) | `ReceivablePayment` (con sesión) + `ReceiptPayment` | Suma si efectivo |
| Recibo cobro negativo | `CashMovement` EXPENSE | Resta |
| Recibo pago (CxP) | `PayablePayment` + `ReceiptPayment` | Resta si efectivo |
| Gasto contado | `Expense` + `CashMovement` EXPENSE | Resta (con bug de moneda, ver §2) |
| Gasto crédito | `Payable` | No |
| Anticipo cliente | `CustomerAdvance` + `CashMovement` INCOME | Suma |
| Anticipo proveedor | `SupplierAdvance` + `CashMovement` EXPENSE | Resta |
| Movimiento manual | `CashMovement` | Suma/resta |

---

## 2. Bugs concretos encontrados (causan descuadre hoy)

1. **🔴 Gasto: moneda siempre USD.** `expenses.service.ts:297` → `currency: dto.amountUsd ? 'USD' : 'BS'`.
   La moneda se decide por **cuál campo de monto se llenó**, no por el **método**. Además el front
   (`expenses/page.tsx:285,293`) autocompleta el otro monto al escribir uno, así que **siempre** se
   manda `amountUsd` → `currency` sale `'USD'` siempre. Debe salir de `method.isDivisa` (como los
   anticipos). Mismo patrón en la rama crédito (`:253`, moneda del `Payable`).
   **Impacto:** un gasto pagado en Bs resta del esperado USD (y no del Bs) → descuadre en ambas monedas.

2. **🔴 Gasto/movimiento electrónico igual sale de la gaveta.** El arqueo (`:464-474`) cuenta **todo**
   `CashMovement` como efectivo (solo mira `currency`), porque `CashMovement` no tiene `isCash`/`methodId`.
   Un gasto pagado por transferencia/PdV resta del efectivo físico → descuadre.

3. **🔴 Compra al contado no entra al arqueo.** `purchase-orders.service` crea `PayablePayment` sin
   `cashSessionId` y sin `CashMovement`. El dinero sale de la gaveta pero el arqueo no lo sabe → faltante.
   (El propio código lo admite: *"NO incluye compras al contado — Fase 2"*.)

4. **🟠 Ventas por ventana de tiempo, no por sesión.** Reabrir caja, dos turnos, o `paidAt` (UTC) fuera de
   `[openedAt, closedAt]` → la venta cae en el turno equivocado.

5. **🟠 Vuelto solo en Bs.** Solo existe `changeAmountBs`; un vuelto en efectivo USD no se descuenta.

6. **🟡 Snapshot inmutable.** Turnos cerrados con lógica vieja quedan mal para siempre (no se recalculan).

**Causa raíz común:** no hay un libro mayor único; el arqueo lee de 3 sitios con 2 mecanismos, y
`CashMovement` no lleva el método ni si es efectivo.

---

## 3. Diseño objetivo: un libro mayor único (`CashLedgerEntry`)

Como `StockMovement` para el inventario: **cada evento que toca caja escribe UNA fila** en una tabla
madre, y el arqueo es simplemente *"sumá las filas de esta sesión"*.

```prisma
model CashLedgerEntry {
  id            String   @id @default(cuid())
  cashSessionId String                   // ÚNICA atribución (adiós ventana de tiempo)
  cashSession   CashSession @relation(...)
  direction     CashDir                  // IN | OUT
  amountUsd     Float
  amountBs      Float
  currency      String                   // 'USD' | 'BS' (moneda física del movimiento)
  exchangeRate  Float
  methodId      String?                  // método de pago (null = manual/sin método)
  method        PaymentMethod? @relation(...)
  isCash        Boolean                  // snapshot: ¿afecta la gaveta física?
  sourceType    String                   // SALE_PAYMENT | PURCHASE_PAYMENT | RECEIPT_COLLECTION |
                                         // RECEIPT_PAYMENT | EXPENSE | CUSTOMER_ADVANCE |
                                         // SUPPLIER_ADVANCE | CHANGE | MANUAL
  sourceId      String?                  // id del documento origen (auditable)
  reason        String?
  reference     String?
  createdById   String
  createdAt     DateTime @default(now())
  @@index([cashSessionId])
  @@index([sourceType, sourceId])
}
enum CashDir { IN OUT }
```

### 3.1 ¿Por qué tabla NUEVA y no evolucionar `CashMovement`?
Elegimos **dual-write** (Fase 0). Como el arqueo actual **ya lee `CashMovement`**, escribir en esa misma
tabla las nuevas filas (ventas/recibos) rompería el arqueo en vivo (doble conteo). Una tabla nueva corre
**en paralelo** sin tocar nada, y así podemos comparar. `CashMovement` queda como "la tabla del movimiento
manual" (un feeder más del ledger), tal como los demás documentos tienen su tabla y desembocan en la madre.

### 3.2 Modelo de "cada doc su tabla → madre"
- **Multi-método** (venta `Payment`, recibo `ReceiptPayment`, compra `PayablePayment`): 1 fila de ledger por línea de pago.
- **Un solo pago** (gasto, anticipo, manual): escriben **directo** al ledger (no necesitan tabla de pagos aparte). El movimiento manual seguirá viviendo en `CashMovement` como su "tabla de negocio" y además escribe su fila.

### 3.3 El arqueo nuevo (Fase 1) — una sola consulta
```
Esperado gaveta (moneda M) = apertura(M) + Σ CashLedgerEntry
                              WHERE cashSessionId=S AND isCash AND currency=M  (signo por direction)
Desglose por método        = GROUP BY methodId
Esperado electrónico canal = Σ WHERE NOT isCash, GROUP BY methodId
```
Sin ventana de tiempo (la venta estampa su sesión al cobrar), con compras al contado incluidas y vuelto USD contado.

---

## 4. Puntos de escritura por documento (Fase 0 — dual-write)

Cada service, **además** de lo que ya hace, escribe filas en `CashLedgerEntry`. La sesión se resuelve
por la caja al momento (venta: sesión abierta de la caja al cobrar; recibo/gasto/anticipo: la que ya traen).

| Documento | Service | Fila(s) de ledger |
|---|---|---|
| Venta contado | `invoices.service.pay()` | 1 por `Payment` (IN, `methodId`, `isCash`, `currency=isDivisa?USD:BS`, `sourceType=SALE_PAYMENT`, `sourceId=invoiceId`) |
| Vuelto | idem | 1 OUT `CHANGE` (soportar USD y Bs) |
| Compra contado | `purchase-orders.service.process()` | 1 por `PayablePayment` (OUT). **Decisión:** ¿a qué sesión? → sesión abierta del usuario al procesar |
| Recibo cobro | `receipts.service.post()` | 1 por `ReceiptPayment` (IN si COLLECTION) |
| Recibo pago | idem | 1 por `ReceiptPayment` (OUT si PAYMENT) |
| Gasto contado | `expenses.service.create/update()` | 1 OUT, `currency` **del método** (arregla bug §2.1), `isCash` del método |
| Anticipo cliente/proveedor | `*-advances.service` | 1 IN / OUT (moneda ya correcta) |
| Manual | `cash-movements.service` | 1 IN/OUT (`isCash=true`, `methodId=null`) |

**Nota Fase 0:** los que hoy ya escriben `CashMovement` (gasto/anticipo/manual/reintegro) siguen igual
en `CashMovement` (para no tocar el arqueo actual) y **además** escriben en `CashLedgerEntry`. No hay doble
conteo porque el arqueo actual solo lee `CashMovement`; la validación lee `CashLedgerEntry` aparte.

---

## 5. Fases de despliegue

### Fase 0 — Dual-write + validación (sin tocar el arqueo)
1. Migración aditiva: crear `CashLedgerEntry` + enum `CashDir` (con `IF NOT EXISTS` + `fix-schema.sql`).
2. Escribir filas de ledger en TODOS los services (§4). El arqueo actual queda intacto.
3. **Pantalla/endpoint de conciliación:** por sesión, comparar `Σ ledger (isCash, por moneda)` vs
   `cashExpected` del arqueo actual, y listar diferencias por `sourceType`. Aquí se ve exactamente qué
   documento descuadra (probablemente compra al contado y gastos).
4. Correr días en paralelo en prod. Cuando el ledger cuadre con la realidad → Fase 1.

### Fase 1 — El arqueo lee del ledger
1. Reescribir `getSessionSalesData`/`getSessionSummary` para calcular desde `CashLedgerEntry`.
2. Turnos cerrados: conservan su snapshot (no se reescribe historia). El ledger manda de ahí en adelante.
3. Opcional: backfill de sesiones abiertas/recientes desde los documentos, para que el histórico reciente
   también reconcilie por ledger.

### Fase 2 — Limpieza
1. Quitar la lectura multi-fuente vieja (Payment/ReceiptPayment/CashMovement) del arqueo.
2. `CashMovement` queda solo como tabla del movimiento manual (o se pliega al ledger).

---

## 6. Backfill / histórico
- **No reescribir** turnos cerrados (snapshots inmutables = auditoría).
- El ledger nace vacío y se llena hacia adelante (Fase 0).
- Si se quiere reconciliar histórico reciente: script que recorra facturas/recibos/gastos/anticipos de las
  sesiones abiertas y genere sus filas de ledger (idempotente, por `sourceType`+`sourceId`).

---

## 7. Riesgos y checklist de validación
- [ ] Migración 100% aditiva (`IF NOT EXISTS`) + en `fix-schema.sql`. Sin `DROP`/`NOT NULL` sobre datos.
- [ ] Fase 0 NO cambia el arqueo actual (cero impacto en el cierre en vivo).
- [ ] Toda escritura de ledger va dentro de la **misma transacción** que el documento (nunca a medias).
- [ ] `isCash`/`currency` se derivan del **método** (no del monto), en TODOS los puntos.
- [ ] Vuelto: soportar USD y Bs.
- [ ] Compra al contado: definir la sesión (sesión abierta del usuario) — validar que exista una abierta.
- [ ] Conciliación Fase 0 muestra 0 diferencia en sesiones limpias antes de pasar a Fase 1.
- [ ] Recibos POSTED que ya movían caja no se cuentan dos veces al migrar.
- [ ] Reintegros (recibo negativo) no se duplican (hoy crean `CashMovement`; en el ledger es una sola fila).

---

## 8. Decisiones abiertas (para confirmar con Diego)
1. **Sesión de una compra al contado:** ¿la sesión abierta del usuario que procesa la compra? (propuesto).
2. **Gasto — arreglo inmediato:** ¿arreglamos ya el `currency` del gasto (derivar del método) como hotfix
   aislado antes del ledger, o esperamos a la Fase 0? (El hotfix es chico pero cambia comportamiento en prod.)
3. **Alcance del backfill:** ¿solo hacia adelante, o también sesiones abiertas al momento del switch?
