Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Hay 5 correcciones/mejoras a implementar relacionadas con la Serie y los libros fiscales.
Antes de escribir cualquier código consulta las skills disponibles.
⚠️ ADVERTENCIA: No tocar fiscal-printer.ts ni los comandos fiscales. Solo los puntos descritos abajo.

CORRECCIÓN 1 — Ticket de devolución no fiscal
Actualmente cuando una nota de crédito NCV tipo MERCHANDISE tiene serie.isFiscal = false, no se imprime nada — solo hay botón de PDF.
Agregar impresión de ticket térmico para devoluciones no fiscales, igual que el ticket de factura pero con formato de devolución:
En print-receipt.ts agregar función buildReturnReceiptText(note, invoice):
{{CENTER}}{{BIG}}NOMBRE DE LA EMPRESA{{/BIG}}{{/CENTER}}
{{CENTER}}RIF: J-XXXXXXXXX{{/CENTER}}
{{CENTER}}Dirección{{/CENTER}}
{{LINE}}
{{CENTER}}NOTA DE DEVOLUCIÓN{{/CENTER}}
{{CENTER}}NCV-26-00000001{{/CENTER}}
Fecha: 26/05/2026
Factura origen: VTA-26-00000001
Cajero: Carlos Rodriguez
{{LINE}}
{{BOLD}}ARTÍCULO          CANT  PRECIO{{/BOLD}}
Martillo Stanley    1     $18.79
...
{{LINE}}
{{BOLD}}Total devuelto:   $XX.XX{{/BOLD}}
Total Bs:           Bs XX.XX
{{LINE}}
{{CENTER}}Documento no fiscal{{/CENTER}}
{{CENTER}}Devolución procesada{{/CENTER}}
{{CUT}}
En la página /credit-debit-notes/[id]:

Si note.type = NCV y note.origin = MERCHANDISE y serie.isFiscal = false → al contabilizar la nota, intentar imprimir el ticket de devolución via el agente Trinity igual que las facturas normales
Agregar también botón manual "Imprimir ticket" para reimprimir si es necesario


CORRECCIÓN 2 — Retenciones verificar serie.isFiscal
En purchase-orders.service.ts la condición actual es:
typescriptif (order.supplier.isRetentionAgent && order.isFiscal && order.totalIvaUsd > 0)
Cambiar para que use la serie correctamente:
typescriptif (order.supplier.isRetentionAgent && order.serie?.isFiscal && order.totalIvaUsd > 0)
También al crear el RetentionVoucher, asignar el serieId de la orden:
typescriptserieId: order.serieId

CORRECCIÓN 3 — Crear modelo SalesBookEntry
El libro de ventas actualmente se genera dinámicamente. Crear un modelo con registros editables igual que PurchaseBookEntry:
prismamodel SalesBookEntry {
  id                    String   @id @default(cuid())
  invoiceId             String?  // vinculado a la factura (opcional)
  invoice               Invoice? @relation(...)
  entryDate             DateTime
  invoiceNumber         String   // número de factura
  controlNumber         String?  // número de control fiscal
  customerName          String
  customerRif           String?
  exemptAmountBs        Float    @default(0)
  taxableBaseBs         Float    @default(0)
  ivaAmountBs           Float    @default(0)
  igtfAmountBs          Float    @default(0)
  totalBs               Float    @default(0)
  isManual              Boolean  @default(false)
  isRetentionLine       Boolean  @default(false)
  notes                 String?
  createdById           String
  createdBy             User     @relation(...)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
Al pagar una factura (InvoicesService.pay()):

Si invoice.serie.isFiscal = true → crear automáticamente un SalesBookEntry con los datos de la factura
Los montos se convierten a Bs usando la tasa de la factura

Corre migración con nombre add_sales_book_entry.

CORRECCIÓN 4 — Libro de ventas con registros editables y filtro por rango de fechas
Nuevo SalesBookModule:
GET /sales-book?from&to — lista entradas:

Filtro por rango de fechas usando entryDate
Ordenado por entryDate ASC

POST /sales-book — crear entrada manual
PATCH /sales-book/:id — editar entrada:

Todos los campos editables
No afecta la factura original

DELETE /sales-book/:id — solo ADMIN
GET /sales-book/pdf?from&to — generar PDF del libro de ventas:

Formato igual al libro de compras
Columnas: N° | Fecha | N° Control | N° Factura | Cliente | RIF | Exento Bs | Base Imponible Bs | IVA Bs | IGTF Bs | Total Bs
Fila de totales al pie
Segunda página con resumen fiscal del período

Página /fiscal/libro-ventas — actualizar:
Reemplazar selector de mes/año por:

Date pickers "Desde" y "Hasta"
Botones rápidos: "Este mes" | "Quincena 1 (1-15)" | "Quincena 2 (16-fin)" | "Mes anterior"
Botón "Generar"

Tabla del libro con las mismas columnas del PDF:

Cada fila tiene botón de editar (ícono lápiz) que abre modal
Fila de totales al pie en negrita
Badge "MANUAL" para entradas manuales
Badge "AUTO" para entradas generadas desde factura

Modal de editar entrada:

Todos los campos editables
Nota: "Los cambios no afectan la factura original"

Botón "+ Agregar entrada manual"
Botón "Exportar PDF"

Al terminar:

Verificar que al pagar una factura fiscal se crea automáticamente en SalesBookEntry
Verificar que una factura no fiscal NO crea entrada en el libro
Verificar que las retenciones de compra solo se crean para facturas con serie.isFiscal = true
Verificar que el filtro por quincena funciona en ambos libros
Verificar que una devolución no fiscal imprime el ticket de devolución via agente
Haz commit con el mensaje feat: sales book entries, date range filter, return ticket and fiscal serie fixes
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md