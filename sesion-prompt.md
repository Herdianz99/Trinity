Guarda esto en tu session-prompt.md y dáselo a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 4 de Trinity ERP: Compras.
Antes de escribir cualquier código consulta las skills disponibles en /mnt/skills/public/ especialmente frontend-design.
Implementar exactamente lo descrito en la Sesión 4 del PROJECT.md:
Backend (NestJS):
PurchaseOrdersModule completo:

GET /purchase-orders — lista con filtros ?supplierId&status&from&to&page&limit usando setUTCHours para rangos de fecha
GET /purchase-orders/:id — detalle con items, proveedor y movimientos generados
POST /purchase-orders — crear orden con numeración automática PO-0001 correlativa
PATCH /purchase-orders/:id — editar solo si status es DRAFT
PATCH /purchase-orders/:id/status — cambiar a SENT o CANCELLED
PATCH /purchase-orders/:id/receive — recibir orden completa o parcial:

Body: { warehouseId, items: [{ purchaseOrderItemId, receivedQty, costUsd }] }
Por cada item recibido:

Actualiza receivedQty en PurchaseOrderItem
Actualiza stock en tabla Stock para el almacén seleccionado
Actualiza costUsd del producto con el nuevo costo
Recalcula priceDetal y priceMayor del producto usando la fórmula del PROJECT.md
Crea StockMovement tipo PURCHASE


Si todos los items están completamente recibidos → status = RECEIVED
Si solo algunos → status = PARTIAL
Todo en transacción Prisma


GET /purchase-orders/reorder-suggestions — productos donde stock total <= minStock, ordenados por criticidad (stock/minStock ASC), incluye último proveedor y último costo

Frontend (Next.js):
Sección COMPRAS en sidebar: Órdenes de compra, Sugerencias de reorden
Página /purchases:

Header: "Órdenes de Compra" + contador + botón "+ Nueva orden"
Filtros: proveedor, estado, rango de fechas
Tabla: Número (PO-0001), Proveedor, Items (resumen), Total USD, Estado, Fecha, Acciones
Badge de estado: gris DRAFT, azul SENT, amarillo PARTIAL, verde RECEIVED, rojo CANCELLED
Acciones: Ver detalle, Editar (solo DRAFT), Recibir (solo SENT o PARTIAL), Cancelar (solo DRAFT o SENT)

Modal "Nueva orden de compra":

Selector de proveedor (obligatorio)
Lista de items: búsqueda de producto (full-text), cantidad, costo USD por unidad, total parcial calculado
Botón "+ Agregar producto"
Total general de la orden
Notas opcionales
Botón "Guardar como borrador" y botón "Marcar como enviada"

Modal "Recibir orden":

Muestra items de la orden con cantidades pedidas
Selector de almacén destino (obligatorio)
Por cada item: campo "Cantidad recibida" (pre-llenado con cantidad pedida) y campo "Costo USD" (pre-llenado con costo actual)
Si el costo cambió → mostrar badge "⚠️ Precio actualizado" y advertencia "Esto recalculará el precio de venta del producto"
Preview de nuevo precio detal y mayor calculado con el nuevo costo
Botón "Confirmar recepción"

Página /purchases/reorder:

Título "Sugerencias de Reorden"
Tabla: Producto, Categoría, Proveedor principal, Stock actual, Stock mínimo, Diferencia, Último costo USD
Filas ordenadas por criticidad: rojo si stock = 0, amarillo si stock < minStock
Botón "Crear orden" por fila que pre-llena una nueva orden de compra con ese producto y proveedor

Al terminar:

Verifica el flujo completo: crear orden → marcar enviada → recibir con nuevo costo → verificar que el stock subió, el costo del producto se actualizó y el precio de venta se recalculó
Haz commit con el mensaje feat: Session 4 - purchase orders with auto stock update and price recalculation
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md