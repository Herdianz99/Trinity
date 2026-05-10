Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar la Sesión 9 de Trinity ERP: Documentos Fiscales Venezolanos.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
CONTEXTO:
Los documentos fiscales venezolanos requeridos son: Libro de Ventas, Libro de Compras y manejo de retención ISLR en compras. Las notas de crédito y débito se implementarán en una sesión futura junto con el módulo de devoluciones.
PARTE 1 — Migración de Prisma
Agregar a Invoice:

controlNumber String? — número de control manual, se llena cuando tienen máquina fiscal o lo asigna el sistema manualmente

Agregar a PurchaseOrder:

islrRetentionPct Float? — porcentaje de retención ISLR si aplica
islrRetentionUsd Float? — monto calculado de retención ISLR
islrRetentionBs Float? — monto en Bs
supplierControlNumber String? — número de control de la factura del proveedor

Agregar a CompanyConfig:

islrRetentionPct Float @default(0) — porcentaje ISLR por defecto configurable

Corre migración con nombre add_fiscal_documents_fields.
PARTE 2 — Backend (NestJS)
Nuevo FiscalModule con endpoints de reportes:
GET /fiscal/libro-ventas?from&to — Libro de Ventas en formato SENIAT:

Filtrar facturas PAID y CREDIT en el período con setUTCHours
Agrupar por fecha
Por cada factura retornar:
fecha, numeroFactura, numeroControl, rif cliente, nombre cliente,
baseImponibleExenta, baseImponibleReducida, baseImponibleGeneral, baseImponibleEspecial,
ivaReducido (8%), ivaGeneral (16%), ivaEspecial (31%),
totalFactura

Totales al final del período
Retornar como JSON — el PDF lo genera el frontend

GET /fiscal/libro-compras?from&to — Libro de Compras en formato SENIAT:

Filtrar PurchaseOrders RECEIVED en el período
Por cada orden retornar:
fecha, numeroFacturaProveedor, numeroControlProveedor, rif proveedor, nombre proveedor,
baseImponibleExenta, baseImponibleReducida, baseImponibleGeneral, baseImponibleEspecial,
ivaReducido, ivaGeneral, ivaEspecial,
retentionIva, islrRetention,
totalCompra

Totales al final

GET /fiscal/resumen?from&to — Resumen fiscal del período:
json{
  "ventas": {
    "totalFacturas": 0,
    "baseImponibleTotal": 0,
    "ivaTotal": 0,
    "totalVentas": 0
  },
  "compras": {
    "totalOrdenes": 0,
    "baseImponibleTotal": 0,
    "ivaTotal": 0,
    "retencionesIva": 0,
    "retencionesIslr": 0,
    "totalCompras": 0
  }
}
PARTE 3 — Actualizar módulos existentes
Actualizar InvoicesModule:

En GET /invoices/:id incluir controlNumber en la respuesta
En PATCH /invoices/:id permitir actualizar controlNumber — solo ADMIN
En el PDF de factura: mostrar número de control si existe, campo vacío si no

Actualizar PurchaseOrdersModule:

En modal de crear/editar orden agregar campos:

"Número de control proveedor" — el número de control de la factura física del proveedor
Toggle "Aplica retención ISLR"
Si activo: campo porcentaje ISLR (pre-llenado con companyConfig.islrRetentionPct pero editable)
Monto ISLR calculado automáticamente: totalCompra × (islrRetentionPct / 100)


Al recibir orden con ISLR → actualizar el Payable correspondiente descontando también la retención ISLR del neto a pagar

PARTE 4 — Frontend (Next.js)
Nueva sección en sidebar: FISCAL con items:

Libro de Ventas → /fiscal/libro-ventas
Libro de Compras → /fiscal/libro-compras
Resumen Fiscal → /fiscal/resumen

Página /fiscal/libro-ventas:
Header: "Libro de Ventas" + selector de período (mes actual por defecto)

Selector: mes y año (dropdown)
Botón "Generar" → carga los datos
Botón "Exportar PDF" → genera PDF con formato SENIAT

Tabla con todas las columnas del libro de ventas SENIAT:

N°, Fecha, N° Factura, N° Control, RIF Cliente, Cliente, Base Exenta, Base Reducida, Base General, Base Especial, IVA 8%, IVA 16%, IVA 31%, Total
Fila de totales al final en negrita
Columnas con valor 0 se muestran como "0,00" en formato venezolano

PDF del Libro de Ventas (formato A4 horizontal):

Header: nombre empresa, RIF, "LIBRO DE VENTAS", período (MES/AÑO)
Tabla completa con todas las columnas
Fila de totales
Footer: fecha de generación

Página /fiscal/libro-compras:

Mismo formato que libro de ventas pero con columnas de compras
Incluye columnas adicionales: Retención IVA, Retención ISLR

Página /fiscal/resumen:

Selector de período
2 cards grandes: Ventas del período y Compras del período
Tabla comparativa: IVA débito fiscal (ventas) vs IVA crédito fiscal (compras) = IVA a pagar/recuperar
Resumen de retenciones del período

En /settings:

Agregar campo "Retención ISLR por defecto (%)"

Al terminar:

Crear 5 facturas de venta con diferentes tipos de IVA y verificar que el libro de ventas las refleja correctamente con los montos desglosados
Crear 2 órdenes de compra con retención IVA e ISLR y verificar el libro de compras
Verificar que el PDF se genera correctamente
Haz commit con el mensaje feat: Session 9 - fiscal documents, libro ventas, libro compras and ISLR retention
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md