# Módulo de Compra de Divisas (Tesorería) — Diseño

Fecha: 2026-08-21
Estado: aprobado por el usuario (Diego) para implementación.

## Propósito

Mini-módulo **aislado** (como Incidencias) para que el departamento de Finanzas de la
instancia **grande** lleve el registro de compra de divisas y el movimiento (entradas/salidas)
de dólares, cruzado por dos dimensiones:

- **Empresa lógica**: entidades que Finanzas crea DENTRO del módulo (Inversiones, Aceros
  Portuguesa, Ferreconstrucciones, Total, Mini Market, Pegarca…). **No** son las instancias
  del ERP; son solo etiquetas de este módulo.
- **Banco / Ubicación**: dónde está el dinero (Banesco Panamá, Bank of America, Activo
  Convenio, efectivo en X…). Las cuentas son **compartidas** entre empresas.

Cada movimiento se etiqueta con **empresa + banco**, y el ledger se ve de dos formas:
entrando por una empresa (sus movimientos y en qué banco está cada uno) o por un banco
(todos los movimientos ahí, de todas las empresas).

## Decisiones (del brainstorming)

- **Alcance:** ledger simple (no la mecánica de compra: BCV, comisión, Bs). Cada fila es un
  movimiento con saldos derivados.
- **Tipos de movimiento:** solo **ENTRADA** y **SALIDA** (sin traslados). Mover dinero entre
  bancos = una salida en uno + una entrada en otro, a mano.
- **Moneda:** **solo USD**. (Excepción consciente a la regla "todo USD lleva su par en Bs"
  del CLAUDE.md: este módulo es USD-nativo y aislado, sin Bs ni tasas.)
- **Campos por movimiento:** fecha, empresa, banco, tipo, monto USD, **modalidad**
  (electrónico/efectivo), **contraparte** (de quién/a quién), **referencia**, **descripción**,
  **estatus** (confirmado/pendiente).
- **Saldo corriente:** se muestra el saldo al momento de cada registro **según la vista**
  (si ves un banco → saldo del banco tras la fila; si ves una empresa → saldo de la empresa).
  Se **calcula al vuelo** (no se almacena), ordenado por fecha.
- **Saldo inicial:** se carga como un movimiento de ENTRADA con descripción "Saldo inicial".
- **Aislamiento/acceso:** clave de permiso propia `divisas`, gateado con
  `@RequireModule('divisas')` (igual que `incidents`). No toca ningún módulo existente.

## Modelo de datos (3 tablas nuevas)

```
TreasuryCompany   id, name(unique), isActive, createdAt, updatedAt
TreasuryBank      id, name(unique), isActive, createdAt, updatedAt
TreasuryMovement  id, date, companyId(FK), bankId(FK),
                  type('ENTRADA'|'SALIDA'), amountUsd,
                  modalidad('ELECTRONICO'|'EFECTIVO')?, counterparty?, reference?,
                  description?, status('CONFIRMADO'|'PENDIENTE' def CONFIRMADO),
                  createdById(FK User), createdAt, updatedAt
                  @@index([companyId, date]) @@index([bankId, date]) @@index([date])
```

Enums guardados como String (convención del repo, igual que `Incident.severity`).

## Saldos (calculados)

- **Por empresa** = Σ ENTRADA − Σ SALIDA de esa empresa (todos los bancos).
- **Por banco** = Σ ENTRADA − Σ SALIDA de ese banco (todas las empresas).
- **Saldo corriente por fila**: se ordena por `date` asc (desempate por `createdAt`), se
  acumula, y se devuelve para mostrar (normalmente en orden descendente con su saldo).
- La dimensión del saldo corriente depende del filtro activo (una empresa → saldo empresa;
  un banco → saldo banco).

## API (`/divisas`, guard `@RequireModule('divisas')`)

- Catálogos: `GET/POST/PATCH /divisas/companies`, `GET/POST/PATCH /divisas/banks`.
- `GET /divisas/summary` → saldos por empresa, por banco y total.
- `GET /divisas/movements?companyId=&bankId=&type=&from=&to=` → movimientos + saldo corriente
  cuando el filtro es de una sola dimensión.
- `POST /divisas/movements`, `PATCH /divisas/movements/:id`, `DELETE /divisas/movements/:id`.

## Frontend (`/divisas`, bajo (dashboard))

- **Resumen** (`/divisas`): saldos por empresa y por banco (con totales) + accesos a registrar
  y administrar.
- **Movimientos** (`/divisas/movimientos`): ledger con filtros (empresa, banco, tipo, fecha);
  muestra saldo corriente cuando se filtra por una sola empresa o un solo banco.
- **Registrar movimiento**: modal con los campos definidos.
- **Administrar**: catálogos de Empresas y Bancos (crear/activar).
- Título de pestaña `… | Trinity ERP`. Ítem de sidebar "Compra de divisas" gateado por `divisas`.

## Fuera de alcance (v1)

- Mecánica de compra (tasa BCV, comisión, Bs, reparto de una compra en varias empresas).
- Traslados vinculados entre bancos/empresas.
- Multi-moneda (EUR/Bs).
- Exportar a Excel (fácil de agregar después; diferido para acotar v1).

## Riesgos / notas

- El módulo vive solo en la grande; el permiso `divisas` arranca habilitado para ADMIN
  (y opcionalmente el rol que Finanzas use). Migración idempotente con `array_append`.
- Al ser aislado y aditivo, el despliegue es seguro (no afecta ventas/inventario/fiscal).
