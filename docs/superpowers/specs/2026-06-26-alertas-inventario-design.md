# Diseño: Pantalla de Alertas de Inventario + Botón "¿Cómo se calcula?"

- **Fecha:** 2026-06-26
- **Estado:** Aprobado para escribir plan de implementación
- **Autor:** Diego + Claude

## 1. Contexto y problema

La pantalla de **Análisis de Inventario** (`/purchases/analysis`) ya calcula clasificación ABC,
rotación, rentabilidad, valor de inventario y sugerencias de compra. Sin embargo:

1. La alerta de **"stock muerto"** actual (`inventory-analysis.service.ts:178`) es binaria —
   `unitsSold === 0 && currentStock > 0` — y **no considera la antigüedad del producto**: un
   producto recién comprado que aún no se vende sale marcado como "muerto" injustamente.
2. El cliente pidió **reportes operativos imprimibles** que hoy no existen como pantalla dedicada:
   artículos agotados, artículos bajo mínimo, artículos comprados que no han rotado, y exceso de stock.
3. Las métricas son fáciles de olvidar: hace falta documentación en la propia interfaz de **cómo se
   calcula cada cosa**.

## 2. Objetivo

- Crear una pantalla nueva **Alertas de Inventario** con 4 reportes seleccionables/filtrables y
  exportación a **PDF** y **Excel**.
- Reemplazar la lógica binaria de stock muerto por una **clasificación por antigüedad** basada en la
  fecha de la **última compra**.
- Agregar un botón **"¿Cómo se calcula?"** (modal) en la pantalla nueva y en la de Análisis, con un
  glosario de fórmulas como fuente única de verdad.

Fuera de alcance: tocar el dashboard de Análisis salvo para agregarle el botón de ayuda. Umbrales
configurables por UI (se dejan como constantes en código).

## 3. Reglas de negocio

### 3.1 Última entrada (antigüedad)
- **Última entrada** = fecha del último `StockMovement` de tipo **`PURCHASE`** del producto.
- Si el producto **no tiene ninguna compra registrada** (catálogo importado antiguo) → se usa
  `Product.createdAt` como respaldo.
- **Decisión:** cualquier compra reciente reinicia el reloj (opción "simple"). El cliente analiza
  antes de comprar y no recompra cosas que no rotan, así que el riesgo de "esconder" stock viejo con
  una compra chica es aceptable.

### 3.2 Ventas desde la última entrada
- **`ventasDesdeEntrada`** = unidades vendidas entre la fecha de última entrada y hoy, contando
  facturas `PAID` / `PARTIAL_RETURN`, tipo `SALE`, descontando `returnedQty`.

### 3.3 Clasificación "Sin rotación" (3 niveles)
Aplica solo a productos con `stock > 0` **y** `ventasDesdeEntrada === 0`:

| Días desde última entrada | Etiqueta | Color |
|---|---|---|
| `< 10` | Recién ingresado (muestra la fecha de entrada) | ⚪ neutro |
| `10` a `28` | Nuevo sin rotación | 🟠 naranja |
| `> 28` | Stock muerto | 🔴 rojo |

Constantes en código: `DIAS_RECIEN_INGRESADO = 10`, `DIAS_STOCK_MUERTO = 28`.

### 3.4 Los 4 reportes

| Reporte | Criterio |
|---|---|
| **Agotados** | `stock <= 0` |
| **Bajo mínimo** | `0 < stock <= minStock` |
| **Sin rotación** | `stock > 0` y `ventasDesdeEntrada === 0` (muestra los 3 niveles de 3.3) |
| **Exceso** | `stock > 0` y `ventasPeriodo > 0` y `díasDeInventario > 180` |

- Constante `DIAS_EXCESO = 180`.
- "Exceso" y "Sin rotación" son mutuamente excluyentes (uno vende 0, el otro vende algo).
- Solo productos `isActive = true` y `isService = false`.
- `stock` = suma del stock del producto en todos los almacenes.

### 3.5 Período (solo afecta a "Exceso")
- La pantalla tiene un selector de período (**30 / 60 / 90 / personalizado**) que define la ventana de
  venta para calcular la rotación y `díasDeInventario` del reporte de Exceso.
- Los reportes Agotados, Bajo mínimo y Sin rotación **no** dependen del período (son una foto del
  estado actual; "Sin rotación" usa su propia ventana = desde la última entrada).
- `díasDeInventario = periodDays / rotación`, donde `rotación = ventasPeriodo / stock` (misma fórmula
  que `getRotation` hoy).

## 4. Arquitectura

### 4.1 Backend — nuevo endpoint
- **Módulo:** se extiende `inventory-analysis` (reusa helpers de timezone y la lógica de rotación
  existente). Nuevo método `getInventoryAlerts(from, to)` en `inventory-analysis.service.ts` y ruta
  `GET /inventory-analysis/alerts?from=&to=` en el controller.
- Devuelve **una sola lista** de productos; el filtrado entre reportes se hace en el frontend (rápido,
  una sola consulta). Cada ítem incluye:
  ```ts
  {
    productId, productCode, productName, category, supplierId, supplierName,
    currentStock, minStock, costUsd, inventoryValueUsd,
    lastEntryDate: string | null,      // ISO; null si cae a createdAt
    lastEntrySource: 'PURCHASE' | 'CREATED',
    daysSinceEntry: number,
    unitsSoldSinceEntry: number,
    unitsSoldPeriod: number,           // ventana del período (para exceso)
    daysOfInventory: number,
    alerts: {
      agotado: boolean,
      bajoMinimo: boolean,
      sinRotacion: null | 'RECIEN_INGRESADO' | 'NUEVO_SIN_ROTACION' | 'STOCK_MUERTO',
      exceso: boolean,
    }
  }
  ```
- **Cálculo de última compra:** una consulta `groupBy` sobre `StockMovement` (`type = 'PURCHASE'`,
  `_max: { createdAt }` agrupado por `productId`) para evitar N+1.
- Fechas con los helpers `caracasDayStart/End` (regla de timezone del proyecto).

### 4.2 Frontend — pantalla nueva
- **Ruta:** `apps/web/src/app/(dashboard)/inventory/alerts/page.tsx`.
- **Entrada en sidebar:** "Alertas de inventario" dentro del grupo Inventario.
- `document.title = 'Alertas de Inventario | Trinity ERP'`.
- **Layout:**
  - Header con título + botón **ℹ️ ¿Cómo se calcula?**.
  - Selector de reporte: `Agotados | Bajo mínimo | Sin rotación | Exceso | Todos`.
  - Selector de período (visible/relevante para Exceso).
  - Buscador por código/nombre + botones **Exportar PDF** / **Exportar Excel**.
  - Tabla con columnas según el reporte; badges de 3 niveles en "Sin rotación".
- Patrón de datos: `fetch('/api/proxy/inventory-analysis/alerts?...')`, filtrado client-side por
  reporte seleccionado.

### 4.3 Exportación
- **Excel:** client-side con `xlsx` (`^0.18.5`, ya instalado) — `XLSX.utils.json_to_sheet` +
  `XLSX.writeFile`, igual que las pantallas de `reports/*`.
- **PDF:** server-side reusando el patrón de `reports-pdf.service.ts`; el frontend abre
  `window.open('/api/proxy/inventory-analysis/alerts/pdf?report=<tipo>&from=&to=')` (mismo patrón que
  `reports/sales-product`).
- Ambos exportan **el reporte seleccionado** con sus filtros.

### 4.4 Botón "¿Cómo se calcula?" (modal reutilizable)
- **Componente:** `apps/web/src/components/metrics-help-modal.tsx` — modal que recibe una lista de
  claves de métrica y las renderiza (nombre + fórmula + explicación simple).
- **Fuente única de verdad:** `apps/web/src/lib/metrics-help.ts` con entradas tipadas:
  ```ts
  { key, titulo, formula, explicacion }
  ```
  Métricas: `abc`, `rotacion`, `diasInventario`, `rentabilidad`, `margen`, `valorInventario`,
  `sugerenciaCompra`, `agotado`, `bajoMinimo`, `sinRotacion` (con los 3 niveles), `exceso`.
- **Uso:**
  - Pantalla **Alertas**: muestra agotado, bajoMinimo, sinRotacion, exceso, valorInventario.
  - Pantalla **Análisis**: muestra abc, rotacion, diasInventario, rentabilidad, margen,
    valorInventario, sugerenciaCompra.
- **Mantenimiento:** al cambiar un umbral en código, se actualiza el texto en `metrics-help.ts` (queda
  documentado para cliente y equipo).

## 5. Casos borde
- **Stock negativo** (sobreventa) → cuenta como **Agotado** (`stock <= 0`).
- **Producto sin movimientos de compra** → `lastEntrySource = 'CREATED'`, antigüedad desde `createdAt`.
- **Producto en exacto el mínimo** (`stock === minStock`, > 0) → **Bajo mínimo**.
- Servicios e inactivos → excluidos de todos los reportes.
- Período personalizado sin fechas válidas → no recalcula Exceso (mantiene última consulta válida).

## 6. Archivos afectados (estimado)
- `apps/api/src/modules/inventory-analysis/inventory-analysis.service.ts` — método `getInventoryAlerts`.
- `apps/api/src/modules/inventory-analysis/inventory-analysis.controller.ts` — rutas `alerts` y `alerts/pdf`.
- `apps/api/src/modules/inventory-analysis/inventory-alerts-pdf.service.ts` — PDF (nuevo, patrón existente).
- `apps/web/src/app/(dashboard)/inventory/alerts/page.tsx` — pantalla nueva.
- `apps/web/src/components/metrics-help-modal.tsx` — modal de ayuda (nuevo).
- `apps/web/src/lib/metrics-help.ts` — contenido del glosario (nuevo).
- `apps/web/src/app/(dashboard)/purchases/analysis/page.tsx` — agregar botón de ayuda.
- `apps/web/src/components/sidebar.tsx` — entrada de menú.

## 7. Criterios de aceptación
- [ ] La pantalla muestra los 4 reportes y permite alternar/filtrar entre ellos.
- [ ] "Sin rotación" muestra los 3 niveles con sus colores y la fecha de última entrada en los recién ingresados.
- [ ] Un producto comprado hace menos de 10 días sin ventas **no** aparece como stock muerto.
- [ ] El selector de período recalcula el reporte de Exceso.
- [ ] Exportar a PDF y a Excel respeta el reporte y filtros activos.
- [ ] El botón "¿Cómo se calcula?" abre el modal con las fórmulas en ambas pantallas.
- [ ] Las fechas respetan timezone Caracas (helpers del proyecto).
