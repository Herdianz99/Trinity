Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a mejorar completamente el módulo de compras con varias funcionalidades importantes.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
PARTE 1 — Migración de Prisma
Agregar a Product:

isService Boolean @default(false) — artículo de servicio (flete, seguro, etc.), no genera movimiento de inventario

Agregar a PurchaseOrder:

invoiceDate DateTime? — fecha de la factura del proveedor
receivedDate DateTime? — fecha real de recepción (para movimientos de inventario)
currency String @default("USD") — "USD" o "BS"
exchangeRate Float @default(1) — tasa usada, editable por el usuario
surchargeUsd Float @default(0) — recargo directo en USD
surchargeDistribution String @default("PROPORTIONAL") — "PROPORTIONAL" o "EQUAL"
totalWithSurchargeUsd Float @default(0) — total incluyendo recargos

Agregar a StockMovement:

stockAfter Float @default(0) — stock resultante después del movimiento
costUsd Float @default(0) — costo unitario en el momento del movimiento

Corre migración con nombre improve_purchase_order_module.
PARTE 2 — Backend (NestJS)
Actualizar ProductsModule:

Agregar isService al DTO de crear/editar producto
En el catálogo mostrar badge "Servicio" para productos con isService = true

Actualizar PurchaseOrdersModule:
Al crear orden de compra (POST /purchase-orders):

Aceptar invoiceDate, currency, exchangeRate, surchargeUsd, surchargeDistribution
Si currency = "BS" → convertir todos los costos a USD dividiendo por exchangeRate
Calcular surchargeDistribution y distribuir entre los items:

PROPORTIONAL → cada item recibe (itemCost / totalCost) × surchargeUsd
EQUAL → cada item recibe surchargeUsd / cantidadItems


El recargo distribuido se suma al costo de cada item
Calcular totalWithSurchargeUsd

Al recibir orden (PATCH /purchase-orders/:id/receive):

Usar receivedDate como fecha del movimiento de inventario
Si receivedDate no viene → usar fecha actual
Buscar tasa del día de receivedDate → si no existe usar exchangeRate de la orden
Por cada item que NO sea isService:

Crear StockMovement tipo PURCHASE con costUsd y stockAfter calculado
stockAfter = stockAnterior + quantity
Actualizar product.costUsd = item.costUsd (costo de la última compra)


Items con isService = true → NO crear movimiento de inventario, solo registrar en la orden
Si la orden tiene surchargeUsd > 0 → el costo distribuido ya está incluido en item.costUsd
Recalcular precios del producto: priceDetal = costUsd × (1 + brecha%) × (1 + ganancia%) × (1 + iva%)

Nuevo endpoint GET /purchase-orders/:id/suggested-prices:

Retorna por cada item los precios actuales y los precios sugeridos con el nuevo costo
{ productId, productName, currentCostUsd, newCostUsd, currentGananciaPct, currentPriceDetal, suggestedPriceDetal, currentPriceMayor, suggestedPriceMayor }

Nuevo endpoint PATCH /purchase-orders/:id/update-prices:

Body: { items: [{ productId, gananciaPct, gananciaMayorPct }] }
Actualiza ganancia% de cada producto y recalcula precios
Solo disponible para órdenes en status RECEIVED

Actualizar StockMovementsModule:

En GET /inventory/movements incluir stockAfter y costUsd en la respuesta
Ordenar siempre por createdAt ASC para el kardex

PARTE 3 — Frontend (Next.js)
Formulario de crear/editar producto:

Agregar toggle "Es artículo de servicio" con descripción "Los artículos de servicio no generan movimiento de inventario"

Página /purchases/new y /purchases/[id]/edit — Formulario de orden de compra:
Agregar campos en el header de la orden:

"Fecha de factura" (date picker)
"Fecha de recepción" (date picker) — al cambiar → buscar tasa de ese día automáticamente
"Moneda" (selector: USD | Bs)
"Tasa de cambio" — pre-llenado con la tasa del día de la fecha de recepción, editable
Si moneda = Bs → mostrar nota "Los costos se convertirán a USD usando la tasa indicada"

Sección de recargos al pie de la tabla de items:

Campo "Recargo directo (USD)" — monto adicional que se distribuirá entre los productos
Selector "Distribución" — "Proporcional al costo" | "Partes iguales"
Al cambiar → recalcular y mostrar el recargo por item en la tabla
Columna adicional en la tabla: "Recargo" mostrando cuánto le corresponde a cada item
Columna "Costo final" = costo + recargo
Items de servicio → mostrar badge "SERVICIO", sin columna de recargo (no aplica)

Página /purchases/[id] — Tab "Información General":

Mostrar invoiceDate y receivedDate separados
Mostrar moneda, tasa usada y recargos
Mostrar costo final por item incluyendo recargo distribuido

Modal "Actualizar precios" al recibir la orden:
Al hacer clic en "Recibir orden" → antes de confirmar mostrar modal con tabs:
Tab "Confirmar recepción":

Resumen de la orden: proveedor, items, totales
Botón "Confirmar" para proceder

Tab "Actualizar precios de venta":

Tabla con todos los productos NO servicio de la orden:

Columnas: Producto, Costo anterior, Costo nuevo, Ganancia% detal (editable), Precio detal calculado, Ganancia% mayor (editable), Precio mayor calculado
Si el costo nuevo es mayor al anterior → resaltar en rojo
Si el costo nuevo es menor → resaltar en verde
El precio calculado se actualiza en tiempo real al cambiar la ganancia%
También editable al revés: si el usuario cambia el precio final → calcular ganancia% automáticamente usando la fórmula: ganancia% = (precio / (costo × (1 + brecha%) × (1 + iva%))) - 1


Botón "Aplicar precios y recibir" → llama a receive + update-prices en una sola acción
Botón "Recibir sin actualizar precios" → solo recibe sin cambiar precios

Tab de precios en /catalog/products/[code]:
Rediseñar la tab "Precios" para que sea completamente editable:
┌─────────────────────────────────────────────────────┐
│ PRECIO DETAL                                        │
│ Costo USD:          $XX.XX  (solo lectura)          │
│ Brecha (%):         XX%     (solo lectura si aplica)│
│ IVA:                XX%     (solo lectura)          │
│ Ganancia (%):       [  XX  ] ← editable             │
│ Precio final:       [  $XX.XX  ] ← editable         │
│                                                     │
│ PRECIO MAYOR                                        │
│ Ganancia mayor (%): [  XX  ] ← editable             │
│ Precio mayor:       [  $XX.XX  ] ← editable         │
│                                                     │
│                    [Guardar precios]                │
└─────────────────────────────────────────────────────┘

Si el usuario cambia ganancia% → recalcular precio final en tiempo real
Si el usuario cambia precio final → recalcular ganancia% en tiempo real
Fórmula inversa: ganancia% = (precio / (costo × (1 + brecha%) × (1 + iva%))) - 1
Botón "Guardar precios" → llama a PATCH /products/:code con los nuevos valores

Kardex en /catalog/products/[code] tab "Movimientos":

Agregar columnas: "Stock después" y "Costo unitario"
Mostrar el saldo acumulado después de cada movimiento
Ordenar por createdAt ASC (más antiguo primero) para leer el kardex correctamente
Total de entradas y salidas al pie

Al terminar:

Crear una orden de compra en Bs con flete como artículo de servicio y recargo directo
Verificar que los costos se convierten correctamente a USD
Verificar que el recargo se distribuye correctamente entre los productos
Recibir la orden y actualizar precios desde el modal
Verificar que el kardex muestra stockAfter correctamente
Verificar que la tab de precios del producto es editable y calcula correctamente
Haz commit con el mensaje feat: improve purchase orders with surcharges, service items, editable prices and kardex
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md