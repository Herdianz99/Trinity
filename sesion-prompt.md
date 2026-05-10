Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 5c de Trinity ERP: Ajuste masivo de precios.
Antes de escribir cualquier código consulta las skills disponibles en /mnt/skills/public/ especialmente frontend-design.
PARTE 1 — Backend (NestJS)
Agregar a ProductsModule dos endpoints nuevos:
GET /products/price-adjustment — lista productos con filtros combinables para previsualizar cuáles serán afectados:

Query params: categoryId, subcategoryId, brandId, supplierId, costMin, costMax
Retorna: { id, code, name, category, brand, supplier, costUsd, gananciaPct, gananciaMayorPct, priceDetal, priceMayor, ivaType }
Sin paginación — retorna todos los que cumplan los filtros (máximo 500)

POST /products/price-adjustment — aplica el cambio masivo:

Body:
json{
  "filters": {
    "categoryId": "...",
    "brandId": "...",
    "supplierId": "...",
    "costMin": 0,
    "costMax": 100
  },
  "adjustmentType": "REPLACE",
  "gananciaPct": 35,
  "gananciaMayorPct": 25
}

adjustmentType puede ser:

REPLACE — reemplaza el porcentaje con el valor nuevo exacto
ADD — suma el valor al porcentaje existente (puede ser negativo para restar)


Por cada producto filtrado:

Calcular nuevo gananciaPct y/o gananciaMayorPct según adjustmentType
Recalcular priceDetal y priceMayor con la fórmula completa del PROJECT.md
Actualizar el producto


Crear registro en PriceAdjustmentLog con los filtros, tipo de ajuste, valores y cantidad de productos afectados
Todo en transacción Prisma
Retornar: { productsAffected: number, log: PriceAdjustmentLog }
Solo ADMIN puede ejecutar este endpoint

GET /products/price-adjustment/history — historial de ajustes masivos anteriores, ordenado por fecha DESC
PARTE 2 — Frontend (Next.js)
Nueva página /catalog/price-adjustment accesible desde sidebar bajo CATÁLOGO con nombre "Ajuste de precios":
Layout de la página:
Panel izquierdo — Filtros:

Selector categoría (dropdown con todas las categorías)
Selector subcategoría (se carga dinámicamente según categoría seleccionada)
Selector marca
Selector proveedor
Rango de costo: campo "Costo mínimo USD" y "Costo máximo USD"
Botón "Ver productos afectados" → carga la tabla de preview

Panel central — Preview de productos afectados:

Tabla con columnas: Código, Nombre, Categoría, Marca, Costo USD, Ganancia Detal% actual, Ganancia Mayor% actual, Precio Detal actual, Precio Mayor actual
Contador: "X productos serán afectados"
Si no hay filtros aplicados → mensaje "Aplica al menos un filtro para ver los productos"
Si no hay resultados → mensaje "Ningún producto coincide con los filtros"

Panel derecho — Configuración del ajuste:

Toggle: "Reemplazar %" vs "Sumar/Restar %"
Campo "Nueva ganancia detal %" con preview del nuevo precio detal en tiempo real
Campo "Nueva ganancia mayor %" con preview del nuevo precio mayor en tiempo real
Los campos de preview muestran el precio resultante para el primer producto de la lista como ejemplo
Botón "Aplicar cambio" (deshabilitado si no hay productos en la tabla o no se ingresaron valores)

Modal de confirmación al presionar "Aplicar cambio":

Título: "¿Confirmar ajuste masivo de precios?"
Resumen: "Se modificarán X productos", tipo de ajuste, valores ingresados
Advertencia en amarillo: "Esta acción no se puede deshacer"
Botón "Cancelar" y botón rojo "Confirmar"

Después de aplicar → mostrar resultado: "✅ X productos actualizados correctamente" con link a historial
Sección de historial al final de la misma página:

Título "Historial de ajustes"
Tabla: Fecha, Filtros aplicados (resumen legible), Tipo, Ganancia detal%, Ganancia mayor%, Productos afectados, Usuario
Los filtros se muestran como texto legible: "Categoría: Herramientas, Marca: Stanley"

Al terminar:

Prueba el flujo completo: filtrar por una categoría, ver preview, aplicar cambio, verificar que los precios se actualizaron en el catálogo
Verifica que el historial registra el ajuste correctamente
Haz commit con el mensaje feat: Session 5c - bulk price adjustment with filters, preview and audit log
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md