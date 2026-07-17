# Multisucursal — Estudio de Factibilidad

> Documento de evaluación. **No es un plan de implementación ni un compromiso de ejecución.**
> Fecha: 2026-07-17 · Estado: evaluación cerrada a nivel de negocio, pendiente luz verde para ejecutar.

## Objetivo

Evaluar convertir Trinity (hoy **single-tenant / single-location**) en un sistema
**multisucursal**: una misma instalación/base de datos manejando varias sucursales físicas,
cada una con su inventario, cajas, series, documentos y reportes separados, pero compartiendo
los maestros (artículos, clientes, proveedores).

**Restricción dura:** las empresas en la nube (chica/grande, de una sola sucursal) **no pueden
verse afectadas**.

---

## Veredicto

| | |
|---|---|
| **Factibilidad** | **ALTA** |
| **Dificultad** | **MEDIA** (no es una reescritura) |
| **Tiempo estimado** | **11–13 sesiones (~1–1.5 mes)** a ritmo actual |

La clave: aunque el sistema es single-location por diseño, **ya tiene el 60–70% de la fontanería
multi-ubicación puesta sin usar**. No hay que reconstruir los flujos core, sino **enhebrar una
dimensión de "sucursal" a través de puntos de control que ya existen**.

---

## Modelo de negocio definido (decisiones cerradas)

Patrón: **maestros compartidos + transacciones separadas por sucursal** (idéntico al otro sistema
que usa el cliente).

**Compartido — se crea una sola vez, se usa desde cualquier sucursal:**
- Artículos / catálogo — con **precio compartido** (una sola lista)
- Clientes
- Proveedores
- Categorías, marcas, métodos de pago

**Separado por sucursal — no se ligan entre sí:**
- Facturas de compra y de venta
- Notas de débito / crédito
- Recibos de cobro y de pago
- CxC / CxP
- Cajas, sesiones y arqueos
- Stock y movimientos (almacenes separados)
- Reportes y dashboard

**Reglas de negocio confirmadas:**
1. **Mismo RIF** para todas las sucursales → fiscal **consolidado**: un solo libro de ventas/compras
   ante el SENIAT (una declaración), con opción de desglose por sucursal.
2. **Cupo de crédito GLOBAL:** el crédito disponible del cliente se calcula contra su deuda total
   sumando **todas** las sucursales (el cálculo del cupo ignora la sucursal).
3. **Cobro en la sucursal de origen:** cada CxC/CxP queda amarrada a la sucursal que la creó y
   **solo se cobra/paga ahí**. La deuda es visible desde cualquier lado (para el cupo), pero el
   recibo lo hace la sucursal de origen.
4. **Usuarios multi-sucursal:** un usuario puede tener acceso a varias sucursales (rotan).

---

## Lo que YA juega a favor

| Pieza | Estado | Por qué ayuda |
|---|---|---|
| `Warehouse` + `Stock` por almacén | Completo | Inventario ya es multi-ubicación real (stock, movimientos, transferencias, ajustes, conteos con `warehouseId`). |
| Selectores de almacén en frontend | 5/5 pantallas de inventario | Stock, transferencias, ajustes y conteo ya dejan elegir almacén. |
| `Serie` ↔ `CashRegister` (1:1) | Completo | La numeración fiscal **ya es por caja**. Si cada sucursal tiene sus cajas/series, los correlativos de factura ya salen separados por sucursal. |
| `ModuleGuard` + flags en `CompanyConfig` | Patrón establecido (`useCashLedger`) | Ya existe el mecanismo para prender/apagar features sin afectar a nadie más. |
| `CashLedgerEntry` (Sesión 69) | Completo | Arqueo por sesión/caja ya aislado; consolidar por sucursal = un filtro. |
| Transferencias entre almacenes | Completo | "Transferencia entre sucursales" ya funciona. |

---

## Lo que hay que construir (puntos de fricción, en orden de dolor)

1. **Modelo `Branch` + `branchId` (aditivo, nullable)** en `Warehouse`, `CashRegister`, `User`,
   más `UserBranch` (muchos-a-muchos) para usuarios que rotan. Migración con `IF NOT EXISTS`.
2. **Un solo punto de resolución de almacén** — el más importante. Hoy `invoices.service.ts`
   resuelve el almacén con cascada global (`CompanyConfig.defaultWarehouseId`). Cambio: **derivar
   el almacén de la sucursal de la caja abierta** (sesión → caja → sucursal → almacén). Cambiando
   ese único punto, las ventas se aíslan por sucursal casi solas.
3. **Reportes / dashboard / libros fiscales** — el trabajo más tedioso (no el más difícil). Hoy
   todo agrega global; hay que añadir un filtro `branchId` opcional a ~12 reportes + dashboard +
   libros, y un selector de sucursal en el header. **~40% del esfuerzo.**
4. **Correlativos.** Los de factura ya quedan por-serie/por-caja. Bajo un solo RIF, los de
   CxC/CxP/compras pueden quedarse globales (una sola entidad legal) → poco trabajo aquí.
5. **Contexto de sucursal en el frontend.** Provider global de "sucursal activa": en POS se deriva
   de la caja; en inventario/reportes, selector en el header limitado a las sucursales permitidas
   (ADMIN = todas), persistido en `localStorage`.
6. **Usuarios atados a sucursal + guard** que impida operar la caja de una sucursal no permitida.

---

## Por qué las empresas en la nube quedan 100% intactas

Dos capas de aislamiento:

1. **Ya están en DB/servidor separados** (chica y grande son deploys independientes).
2. **Feature detrás del flag `CompanyConfig.multiSucursal` (default `false`)**, mismo patrón que
   `useCashLedger`. Con el flag apagado, la resolución de almacén cae **exactamente al camino de
   hoy** (almacén global por defecto, sin filtros, sin selector visible).

Regla férrea: **todo cambio de schema aditivo y nullable** (`IF NOT EXISTS`, sin columnas
`NOT NULL` nuevas, sin renombres). Con el flag en `false` y DB aparte, las nubes son byte-por-byte
el sistema actual.

---

## Estimación por fases

| Fase | Alcance | Sesiones |
|---|---|---|
| 0 — Diseño | `Branch`, `UserBranch`, flag, contexto de sucursal | 1 |
| 1 — Fundación de datos | Modelo + migración aditiva + seed "Casa Matriz" + backfill + helper de contexto | 2 |
| 2 — Ventas / Caja | Resolución de almacén por caja, caja/sesión branch-aware, guard de sucursal permitida | 2 |
| 3 — Compras / Inventario | Compra apunta a almacén de sucursal, transferencias inter-sucursal, selectores faltantes | 2 |
| 4 — Reportes / Dashboard / Fiscal | Filtro de sucursal opcional + selector en header + contexto frontend | 3–4 |
| 5 — Admin de sucursales + pulido + prueba sobre copia de la grande | | 2 |
| **Total** | | **11–13 sesiones (~1–1.5 mes)** |

---

## Riesgos

- **Volumen de reportes (Fase 4):** es donde puede estirarse ±1 sesión. Es tedio, no complejidad.
- **Backfill de datos históricos:** las filas existentes quedan con `branchId` nullable → se
  asignan a la sucursal "Casa Matriz" por defecto. Seguro y aditivo.
- **Disciplina de migraciones:** todo debe ir aditivo/nullable para no romper las nubes. Ya es la
  norma del proyecto (CLAUDE.md).

---

## Siguiente paso (cuando haya luz verde)

Armar el **plan de implementación de la Fase 0**: modelo `Branch`/`UserBranch`, el flag
`multiSucursal`, el helper de contexto de sucursal y la migración aditiva. **No iniciar hasta
aprobación explícita.**
