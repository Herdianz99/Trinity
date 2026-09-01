# Movimientos en Bs por empresa (módulo de divisas) — Diseño

Fecha: 2026-09-01
Estado: aprobado por el usuario (Diego) para implementación.
Relacionado: [Módulo de Compra de Divisas](2026-08-21-modulo-divisas-design.md)

## Propósito

Dar al módulo de divisas una **sección propia de movimientos en Bolívares** (entradas/salidas
por empresa), **hermana pero separada** de la de dólares: cada una su tabla y su vista. Hoy el
Bs del módulo es "de segunda" (solo se ve el saldo agregado en el resumen y una nota en el
detalle del movimiento de divisas); se quiere un **ledger de Bs de primera** con su saldo
corriente, como el de USD.

Regla de negocio confirmada en el brainstorming: **un solo saldo Bs por empresa**. La sección
de Bs maneja las entradas/salidas manuales, y **comprar/vender divisas afecta ese mismo saldo**
automáticamente. Las tablas se ven aparte, pero el saldo cuadra.

## Decisiones (del brainstorming)

- **Un solo saldo Bs por empresa** (opción elegida). No dos nociones independientes de Bs.
- **Representación = fusión virtual (Opción A).** El ledger Bs se arma al vuelo mezclando:
  (1) los `TreasuryBsMovement` propios (entradas/salidas manuales) y (2) el `amountBs` de los
  `TreasuryMovement` (divisas), mostrado como **filas espejo de solo lectura**. No se crean filas
  reales enlazadas (se descartó la Opción B por el riesgo de descuadre al editar/borrar divisas).
- **Migrar las "Cargas de Bs".** Los `TreasuryBsLoad` existentes pasan a ser `TreasuryBsMovement`
  tipo `ENTRADA` (descripción "Carga de Bs"). Se retira el concepto de "Carga de Bs" de la UI
  (el endpoint/tabla vieja se puede dejar de usar; ver "Migración").
- **Corrección de signo Bs↔divisas.** En la fusión, un movimiento de divisas **ENTRADA** (compra
  USD, se pagan Bs) cuenta como **SALIDA de Bs**; una divisa **SALIDA** (venta USD, entran Bs)
  cuenta como **ENTRADA de Bs**. (Hoy `summary()` resta siempre sin signo — se corrige.)
- **Sin dimensión banco en Bs.** El Bs es **por empresa**, como pidió el usuario. Los movimientos
  Bs no llevan banco. (El "banco de origen (Bs)" del movimiento de divisas se mantiene como está,
  es informativo del lado de divisas.)
- **Campos del movimiento Bs:** fecha, empresa, tipo (ENTRADA/SALIDA), monto Bs, contraparte?,
  referencia?, descripción?, estatus (CONFIRMADO/PENDIENTE, def CONFIRMADO). Espeja al de divisas
  menos banco/modalidad/originBank/amountUsd.
- **Estatus y saldo corriente:** igual que USD — los `PENDIENTE` son "tránsito" y no suman al
  disponible; el saldo corriente acumula solo `CONFIRMADO`.
- **Aislamiento/acceso:** misma clave de permiso `divisas` (`@RequireModule('divisas')`). No toca
  ningún módulo fuera de divisas.

## Modelo de datos (1 tabla nueva)

```
TreasuryBsMovement  id, date, companyId(FK TreasuryCompany),
                    type('ENTRADA'|'SALIDA'), amountBs,
                    counterparty?, reference?, description?,
                    status('CONFIRMADO'|'PENDIENTE' def CONFIRMADO),
                    createdById(FK User), createdAt, updatedAt
                    @@index([companyId, date]) @@index([date])
```

- `TreasuryBsLoad` queda **obsoleta** tras migrar sus filas (no se borra la tabla en esta versión
  para no perder histórico; simplemente deja de usarse en la UI). Migración de datos: por cada
  `TreasuryBsLoad` crear un `TreasuryBsMovement` ENTRADA equivalente (misma fecha, monto, empresa,
  createdById; descripción "Carga de Bs" + note original). Idempotente (`IF NOT EXISTS` en DDL;
  la copia de datos se hace una vez, condicionada a que no existan ya movimientos Bs migrados).
- `TreasuryMovement` (divisas) **no cambia de esquema**; su `amountBs` se sigue guardando igual.

## Saldos (calculados, al vuelo)

Saldo Bs de una empresa (disponible) =
  + Σ amountBs de `TreasuryBsMovement` ENTRADA (CONFIRMADO)
  − Σ amountBs de `TreasuryBsMovement` SALIDA (CONFIRMADO)
  − Σ amountBs de `TreasuryMovement` **ENTRADA** (compra divisas, CONFIRMADO)
  + Σ amountBs de `TreasuryMovement` **SALIDA** (venta divisas, CONFIRMADO)

Tránsito Bs = lo mismo pero de las filas `PENDIENTE` (no suma al disponible).

`summary()` se actualiza para calcular el `bsBalance` por empresa con esta fórmula (reemplaza el
actual `cargas − Σ amountBs`). El total "Saldo en Bs" del resumen se recalcula igual.

## Ledger Bs por fila (fusión virtual)

`findBsMovements({ companyId?, type?, from?, to? })`:
1. Trae los `TreasuryBsMovement` de la empresa (o todas) + los `TreasuryMovement` con `amountBs != null`.
2. Normaliza cada divisa a una **fila espejo** `{ source: 'DIVISA', bsType, amountBs, refMovementId, ... }`
   con `bsType` según el signo (ENTRADA divisa → SALIDA Bs; SALIDA divisa → ENTRADA Bs).
3. Ordena por `date` asc (desempate `createdAt`), calcula saldo corriente Bs (solo CONFIRMADO),
   recorta al rango `from/to`, invierte a orden descendente (más reciente primero).
4. Devuelve `{ movements, hasRunningBalance }` cuando el filtro es una sola empresa sin `type`
   (mismo contrato que `findMovements` de USD).

Filas `source: 'DIVISA'` van **solo lectura** en la UI (no se editan/borran desde Bs); llevan un
enlace al movimiento de divisas original. Las `source: 'BS'` son editables.

## API (`/divisas`, guard `@RequireModule('divisas')`)

Nuevos endpoints (espejan los de USD):
- `GET  /divisas/bs-movements?companyId=&type=&from=&to=` → movimientos Bs (fusión) + saldo corriente.
- `POST /divisas/bs-movements` → crear movimiento Bs (DTO nuevo `CreateBsMovementDto`).
- `PATCH /divisas/bs-movements/:id` → editar (solo filas `source: 'BS'`).
- `DELETE /divisas/bs-movements/:id`.

`GET /divisas/summary` se mantiene, con el `bsBalance` recalculado.
Endpoints `bs-loads` (cargas) quedan obsoletos; se retiran de la UI (se pueden dejar en el
controller sin enlace, o eliminar en la limpieza — decisión menor de implementación).

## Frontend (`/divisas`, bajo (dashboard))

- **Nueva pantalla `/divisas/movimientos-bs`**: replica `movimientos/page.tsx` pero en Bs:
  filtros por empresa/tipo/fecha (sin banco), saldo corriente al filtrar una empresa, alta/edición/
  eliminación de movimientos Bs. Las filas espejo de divisas se ven en gris/solo-lectura con enlace
  al movimiento de divisas (`/divisas/movimientos?companyId=…`). Título `Movimientos Bs | Trinity ERP`.
- **Resumen `/divisas`**: el panel "Saldo por empresa" ya muestra `Bs …`; se agrega un acceso
  "Ver movimientos Bs" (botón/enlace) junto a "Ver movimientos". El cálculo del Bs viene del
  `summary()` actualizado.
- El formulario de **movimientos de divisas** mantiene su campo "Monto Bs (descuenta de la empresa)"
  — es la fuente de las filas espejo. Opcional: actualizar el texto de ayuda para aclarar el signo.
- Reusar `MoneyInput` (con `thousands`) y el patrón de la página de divisas.

## Migración

1. **Schema:** `CREATE TABLE IF NOT EXISTS "TreasuryBsMovement" (...)` + índices. Migración Prisma
   aditiva, con `IF NOT EXISTS` (regla del CLAUDE.md).
2. **Datos:** copiar `TreasuryBsLoad` → `TreasuryBsMovement` (ENTRADA). Ejecutar una sola vez;
   condicionar a que la tabla destino esté vacía de filas migradas para ser idempotente.
3. Verificar en local (BD de la grande) que el saldo Bs por empresa **antes** (cargas − amountBs)
   coincide con el **después** (fórmula nueva) para no alterar saldos existentes.

## Fuera de alcance (v1)

- Banco/ubicación para Bs (es por empresa a propósito).
- Exportar a Excel (diferible, como en el módulo base).
- Traslados de Bs entre empresas (se hacen como salida+entrada a mano, igual que USD).
- Borrar físicamente la tabla `TreasuryBsLoad` (se deja como histórico; solo se deja de usar).

## Riesgos / notas

- **Reconciliación de saldo:** el riesgo principal es que la fórmula nueva altere el saldo Bs que
  hoy ven en producción. Se mitiga con la verificación del paso 3 de Migración (comparar antes/después).
- **Signo de divisas:** hoy `summary()` resta el `amountBs` sin importar ENTRADA/SALIDA. Si en
  producción existen divisas SALIDA con `amountBs`, la corrección de signo **cambiará** su saldo
  (para bien). Revisar cuántas hay antes de desplegar y avisar a Finanzas si el número se mueve.
- Módulo aislado y aditivo → despliegue seguro (no afecta ventas/inventario/fiscal). Vive en la grande.
