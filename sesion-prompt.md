Guarda esto en tu session-prompt.md y dáselo a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 5b de Trinity ERP: Importación masiva de productos, corrección de códigos y áreas de impresión.
Antes de escribir cualquier código consulta las skills disponibles en /mnt/skills/public/ especialmente frontend-design.
PARTE 1 — Migración de Prisma
Nuevo modelo PrintArea:
prismamodel PrintArea {
  id          String     @id @default(cuid())
  name        String
  description String?
  isActive    Boolean    @default(true)
  categories  Category[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}
Actualizar modelo Category agregando:

code String @unique — 3 letras en mayúsculas, ej: "HER", "PLO", "ELE"
lastProductNumber Int @default(0) — correlativo independiente por categoría
printAreaId String? — relación con PrintArea

Actualizar modelo Product:

El campo code ya existe pero cambiar el comentario — ahora el formato es {categoryCode}{correlativo5digits} ej: HER00001

Nuevo modelo PriceAdjustmentLog (preparar para Sesión 5c):
prismamodel PriceAdjustmentLog {
  id               String   @id @default(cuid())
  filters          Json
  adjustmentType   String
  gananciaPct      Float?
  gananciaMayorPct Float?
  productsAffected Int
  createdById      String
  createdAt        DateTime @default(now())
}
Corre migración con nombre add_print_areas_and_category_code.
PARTE 2 — Migración de datos existentes
Después de aplicar la migración, ejecutar script de migración de datos:

Asignar código temporal a categorías existentes que no tengan código — usar las primeras 3 letras del nombre en mayúsculas, si hay conflicto agregar número: "HER", "HER2", etc.
Reasignar códigos de productos existentes al nuevo formato: para cada producto obtener su categoría, incrementar lastProductNumber de esa categoría con SELECT FOR UPDATE, generar nuevo código {categoryCode}{correlativo5digits padded}
Hacer esto en transacciones pequeñas para no bloquear la DB

PARTE 3 — Backend (NestJS)
Actualizar CategoriesModule:

Al crear categoría: validar que code tenga exactamente 3 letras, convertir a mayúsculas automáticamente, verificar unicidad
Al crear categoría: si no tiene code → retornar error claro "El código de categoría es obligatorio"

Actualizar ProductsModule:

Al crear producto: obtener categoría, incrementar lastProductNumber con SELECT FOR UPDATE en transacción, generar código {category.code}{String(lastProductNumber).padStart(5, '0')}
Si el producto ya tiene código (importación con código explícito) → usar ese código sin generar uno nuevo

Nuevo PrintAreasModule:

GET /print-areas — lista todas las áreas activas
POST /print-areas — crear área
PATCH /print-areas/:id — editar
DELETE /print-areas/:id — solo si no tiene categorías asignadas

Nuevo ImportModule:

POST /import/validate — valida el JSON sin insertar nada, retorna preview:
json{
  "valid": true,
  "preview": {
    "categories": { "create": 2, "exists": 3 },
    "brands": { "create": 1, "exists": 2 },
    "suppliers": { "create": 0, "exists": 2 },
    "products": { "create": 45, "skip": 3, "errors": ["Producto X: categoría no encontrada"] }
  }
}

POST /import — importación real en transacción:

Orden: categorías → marcas → proveedores → productos
Por cada producto: buscar por código o nombre, si existe saltarlo, si no crear
Generar código automático si no viene en el JSON usando el nuevo formato
Calcular priceDetal y priceMayor con la fórmula completa
Retornar reporte detallado de resultado



Formato JSON de importación aceptado:
json{
  "categories": [
    { "name": "Herramientas", "code": "HER", "subcategories": ["Manuales", "Eléctricas"] }
  ],
  "brands": [
    { "name": "Stanley" }
  ],
  "suppliers": [
    { "name": "Distribuidora ABC", "rif": "J-12345678-9" }
  ],
  "products": [
    {
      "code": "HER00001",
      "barcode": "7891234567890",
      "supplierRef": "ST-001",
      "name": "Martillo 16oz Stanley",
      "description": "Martillo de carpintero",
      "category": "Herramientas",
      "subcategory": "Manuales",
      "brand": "Stanley",
      "supplier": "Distribuidora ABC",
      "purchaseUnit": "UNIT",
      "saleUnit": "UNIT",
      "conversionFactor": 1,
      "costUsd": 8.50,
      "gananciaPct": 35,
      "gananciaMayorPct": 25,
      "ivaType": "GENERAL",
      "minStock": 5,
      "bregaApplies": true
    }
  ]
}
PARTE 4 — Frontend (Next.js)
Actualizar modal de categorías en /catalog/categories:

Agregar campo "Código" (3 letras, mayúsculas automáticas, obligatorio)
Agregar selector "Área de impresión" (dropdown con las áreas disponibles, opcional)
Mostrar el código junto al nombre en la tabla: "HER — Herramientas"

Nueva página /settings/print-areas:

Accesible desde sidebar bajo CONFIGURACIÓN
Tabla: nombre, descripción, categorías asignadas (conteo), estado
Modal crear/editar con nombre y descripción
Botón desactivar (no eliminar si tiene categorías)

Nueva página /import:

Accesible desde sidebar bajo CONFIGURACIÓN con nombre "Importación masiva"
Header con título y descripción: "Carga tu catálogo completo desde un archivo JSON"
Acordeón "Ver formato del JSON" con el formato de ejemplo y botón "Copiar"
Zona drag & drop para archivo .json
Textarea para pegar JSON directamente
Botón "Validar" → llama a /import/validate, muestra preview sin insertar nada
Botón "Importar" (habilitado solo si validación pasó) → ejecuta importación real
Sección de resultado: cards con creados/saltados por sección, lista de errores/advertencias en amarillo
Botón "Nueva importación" para resetear el formulario

Actualizar página /catalog/products:

La columna "Código" ahora muestra el nuevo formato HER00001
Agregar columna "Área de impresión" (heredada de la categoría, solo lectura)

PARTE 5 — Impresión automática al cobrar
En InvoicesService.pay(), después de marcar la factura como PAID:

Agrupar items de la factura por product.category.printAreaId
Por cada área de impresión con items → crear un PrintJob:
prismamodel PrintJob {
  id          String      @id @default(cuid())
  invoiceId   String
  invoice     Invoice     @relation(...)
  printAreaId String
  printArea   PrintArea   @relation(...)
  status      PrintStatus @default(PENDING)
  items       Json        // [{code, supplierRef, name, quantity}]
  createdAt   DateTime    @default(now())
}
enum PrintStatus { PENDING PRINTED FAILED }

Agregar esta migración en el mismo migration file

Nuevo endpoint GET /print-jobs/pending?printAreaId= — retorna trabajos de impresión pendientes para un área específica, polling cada 5 segundos desde el frontend
En el frontend, crear componente PrintMonitor que:

Hace polling a /print-jobs/pending?printAreaId=XXX cada 5 segundos
Cuando llega un nuevo job → abre window.print() con el ticket formateado (80mm):

Header: nombre del área de impresión + número de factura + fecha/hora
Tabla: Código | Ref. Proveedor | Descripción | Cantidad
Sin precios


Marca el job como PRINTED después de imprimir
Este componente se monta en el layout principal — cada PC configurada para un área específica lo activa desde Configuración

En /settings agregar opción "Área de impresión de esta PC" — dropdown que guarda en localStorage printAreaId. El PrintMonitor usa este valor para filtrar los jobs.
Al terminar:

Verifica que al crear un producto nuevo en categoría "HER" se genera código HER00001, HER00002, etc.
Verifica que la importación JSON funciona con el formato de ejemplo
Verifica que al cobrar una factura se crean PrintJobs por área
Haz commit con el mensaje feat: Session 5b - category codes, print areas, bulk import and print jobs
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md