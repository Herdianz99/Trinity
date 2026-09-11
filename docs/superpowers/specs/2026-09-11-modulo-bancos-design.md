# Módulo de Bancos — Diseño

**Fecha:** 2026-09-11
**Estado:** Aprobado (diseño), pendiente plan de implementación
**Autor:** Diego + Claude

## 1. Objetivo

Gestionar el dinero que **no está en caja física**: las cuentas bancarias del negocio, su
**libro banco** (movimientos + saldo por cuenta) y la **conciliación bancaria** contra el
estado de cuenta.

El hueco que llena: hoy los pagos electrónicos (transferencia, pago móvil, Zelle) marcados
`isCash=false` no aterrizan en ninguna cuenta bancaria — el dinero se "pierde" del rastreo
tras registrar el recibo/factura. No existe modelo de cuenta bancaria ni saldo por banco.

## 2. Alcance (decisiones tomadas)

- **Libro banco + conciliación** (no solo catálogo, no tesorería completa).
- **Movimientos: automáticos + manuales.**
  - Automáticos: cobros/pagos electrónicos desde **facturas de venta (POS)** y **recibos de
    cobro/pago (CxC/CxP)**, más gastos electrónicos y anticipos.
  - Manuales: lo que solo conoce el banco — **comisiones, IGTF debitado por el banco,
    intereses, notas de débito/crédito, traspasos entre cuentas propias, ajustes**.
- **Mapeo:** cada método de pago electrónico apunta a **una** cuenta bancaria fija
  (`PaymentMethod.bankAccountId`). Sin elegir cuenta al cobrar.
- **Moneda:** cuentas en **Bs y en divisas (USD/Zelle)**; cada cuenta lleva su saldo en su
  moneda y se guarda el equivalente (regla del proyecto USD↔Bs).
- **Conciliación:** **marcado manual (check-off)**. Importación de estado de cuenta = fuera
  de alcance (posible fase 2).
- **Relación con módulo divisas:** **independientes**. Bancos es autónomo, igual que
  `TreasuryMovement`. No se alimentan entre sí.

### Fuera de alcance (por decisión explícita)
- **Reversas por devolución / nota de crédito.** El negocio normalmente hace **cambio de
  producto**, no reembolso de dinero, así que la devolución **no mueve el banco**. Si algún
  día se devuelve dinero por transferencia, se registra como movimiento **manual** de salida.
- **Importación de estados de cuenta** (formatos por banco). Fase 2 si hace falta.
- **Chequeras/cheques**, presupuesto de pagos, integración con divisas.
- **Recarga histórica**: al encender el módulo, los automáticos aplican de ahí en adelante;
  el histórico no se recarga (se arranca con el saldo inicial a la fecha de corte).

## 3. Modelo de datos

### `BankAccount` (cuenta bancaria)
- `id`, `name` (alias, ej. "Banesco Corriente Principal")
- `bankName` (Banesco, Mercantil, BNC, Zelle…), `accountNumber` (opcional para Zelle)
- `accountType`: `CORRIENTE | AHORRO | CUSTODIA | ZELLE | OTRO`
- `currency`: `VES | USD`
- `openingBalance`, `openingBalanceBs`, `openingBalanceUsd`, `openingDate` (saldo inicial y
  fecha de corte)
- `isActive`, `sortOrder`, `createdAt`, `updatedAt`
- **Saldo actual** (calculado): `openingBalance + Σ movimientos`.

### `BankMovement` (libro banco)
- `id`, `bankAccountId` (FK)
- `date`, `direction`: `IN | OUT`
- `amount` (moneda de la cuenta), `amountBs`, `amountUsd`, `exchangeRate` (ambos equivalentes)
- `type`: `COBRO | PAGO | COMISION | IGTF | INTERES | NOTA_DEBITO | NOTA_CREDITO | TRASPASO | AJUSTE`
  (el saldo inicial **no** es un movimiento: vive en los campos `openingBalance*` de la cuenta
  para evitar doble conteo. El saldo actual = `openingBalance + Σ movimientos`.)
- `reference` (nº referencia bancaria), `description`
- `sourceType`: `SALE_PAYMENT | RECEIPT_COLLECTION | RECEIPT_PAYMENT | EXPENSE | ADVANCE | MANUAL`
- `sourceId` (id del documento origen; null si MANUAL)
- Conciliación: `reconciled` (bool), `reconciledAt`, `reconciledById`, `statementDate`
- `createdById`, `createdAt`, `updatedAt`
- Índices: `[bankAccountId, date]`, `[sourceType, sourceId]`

### `PaymentMethod` — nuevo campo
- `bankAccountId` (FK, **opcional**). Métodos electrónicos (isCash=false) apuntan a una
  cuenta fija. Métodos de efectivo quedan en `null` (siguen a la caja física).

**Autonomía:** las tablas son independientes del módulo divisas y de las sesiones de caja
(una transferencia no pertenece a un arqueo).

## 4. Generación de movimientos automáticos

### Servicio central
`BankLedgerService.record({ bankAccountId, direction, amount, currency, exchangeRate, type,
reference, description, sourceType, sourceId, date, createdById })`

Reglas:
- **Idempotente / anti-duplicado:** antes de crear, verifica si existe un `BankMovement` con
  `(sourceType, sourceId, bankAccountId)`. Si existe, no crea otro. Protege contra dobles
  clics, reintentos y re-procesos.
- Calcula y guarda `amountBs`/`amountUsd` con la tasa del momento.
- Resuelve la cuenta desde `PaymentMethod.bankAccountId`. Si un método electrónico **no**
  tiene cuenta → **no** crea movimiento (y se muestra el método como "sin cuenta" en el
  resumen), sin fallar el cobro.
- Si `bancosEnabled` está apagado, el servicio sale temprano (no hace nada).

### Puntos de enganche

| Evento | sourceType | Dirección | Cuándo |
|---|---|---|---|
| Cobro de contado en POS | `SALE_PAYMENT` | IN | Al confirmar cobro, por **cada línea de pago** electrónica |
| Recibo de cobro (CxC) | `RECEIPT_COLLECTION` | IN | Al postear el recibo, por cada `ReceiptPayment` electrónico |
| Recibo de pago (CxP) | `RECEIPT_PAYMENT` | OUT | Al postear el recibo de pago |
| Gasto de contado electrónico | `EXPENSE` | OUT | Al registrar el gasto pagado por banco |
| Anticipo cliente/proveedor electrónico | `ADVANCE` | IN/OUT | Al crear el anticipo |

### Detalles finos
- **Factura mixta** (efectivo + transferencia): solo la porción electrónica genera movimiento
  de banco; el efectivo va a caja. Por eso se engancha a nivel de **línea de pago**.
- **Facturas a crédito (CxC):** no generan movimiento al facturar; el banco se mueve cuando se
  **cobra** esa CxC vía recibo. Cero doble conteo.

### Sincronización al editar método de pago de factura procesada
Trinity ya permite cambiar el método de pago de una factura procesada, y eso re-sincroniza el
cash ledger (fix Sesión 70). El módulo de bancos se cuelga en **ese mismo punto**, en la misma
transacción:
- Se **borran** los `BankMovement` de esa factura (`sourceType=SALE_PAYMENT`, `sourceId=facturaId`).
- Se **recrean** desde el nuevo conjunto de métodos/montos.

Cubre: Efectivo→Transferencia (aparece), Transferencia→Efectivo (desaparece),
Banesco→Mercantil (se va de una y entra a la otra). Borrar+recrear el set completo mantiene el
saldo cuadrado sin importar cuántas veces editen.

## 5. Páginas web (UI)

Bajo `/bancos`, siguiendo el patrón visual del módulo divisas.

1. **`/bancos` — Resumen:** tarjetas por cuenta (nombre, banco, moneda, saldo actual); totales
   Bs y USD por separado; indicador de movimientos sin conciliar; aviso de métodos
   electrónicos sin cuenta asignada.
2. **`/bancos/cuentas` — Catálogo:** CRUD de `BankAccount`; asignación de qué métodos apuntan a
   cada cuenta.
3. **`/bancos/[id]` — Detalle / Libro banco:** cabecera con saldo actual/inicial y
   conciliado vs pendiente; tabla del libro (fecha, tipo, referencia, descripción, entrada,
   salida, saldo corriente, ✓ conciliado); botón "Registrar movimiento manual"; filtros por
   fecha/tipo/estado; cada fila enlaza a su documento origen.
4. **Conciliación (pestaña "Conciliar" en el detalle):** elegir periodo → listar movimientos →
   marcar (check-off) los que ya salen en el estado de cuenta (opcional `statementDate`);
   panel en vivo: saldo según libro / saldo conciliado / partidas conciliatorias (lo no
   marcado). Al cerrar, lo marcado queda `reconciled=true` con quién y cuándo.
5. **Traspasos entre cuentas propias:** movimiento manual tipo `TRASPASO` crea el par (salida
   en A, entrada en B) en una sola operación.

**Títulos de pestaña:** `Bancos | Trinity ERP`, `Cuentas bancarias | Trinity ERP`, detalle
dinámico `${cuenta.name} | Trinity ERP`.

## 6. Permisos, activación y menú

### Activación por empresa (opt-in)
- Bandera `bancosEnabled` en `CompanyConfig` (patrón `@RequireModule('bancos')` como divisas).
- Apagada: menú oculto, rutas 403, y los enganches automáticos no hacen nada. El código se
  despliega a las 6 empresas **sin efecto** hasta encenderlo una por una.

### Permisos granulares
- `VIEW_BANKS` — ver módulo, resumen y libros.
- `MANAGE_BANK_ACCOUNTS` — crear/editar/desactivar cuentas y asignar métodos.
- `CREATE_BANK_MOVEMENT` — registrar movimientos manuales.
- `RECONCILE_BANK` — conciliar/desconciliar.
- Los movimientos automáticos no requieren permiso extra (nacen del cobro/pago ya autorizado).

### Menú lateral
- Sección **"Bancos"** (Resumen, Cuentas) visible solo si `bancosEnabled` y `VIEW_BANKS`.
  Agrupada con lo financiero, cerca de "Divisas" y "Caja".

### Datos sensibles
- Movimientos manuales editables/borrables solo si **no están conciliados**. Editar uno
  conciliado requiere "desconciliar" primero (`RECONCILE_BANK`).
- Toda operación que afecte saldo va en **transacción Prisma**.

## 7. Riesgos y notas

- **Descuadre por método editado:** mitigado por el borrar+recrear en el mismo punto que el
  cash ledger (§4).
- **Doble movimiento:** mitigado por idempotencia `(sourceType, sourceId, bankAccountId)`.
- **Método sin cuenta:** no rompe el cobro; se avisa en el resumen para que lo configuren.
- **Migración Prisma:** usar `IF NOT EXISTS` en ALTER/CREATE (regla del proyecto); `bankAccountId`
  en `PaymentMethod` es nullable (aditivo, despliegue inofensivo).
