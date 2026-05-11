Guarda esto en tu session-prompt.md y dáselo a Claude Code:


Lee el PROJECT.md y el PROGRESS.md antes de escribir cualquier línea de código.
Vamos a implementar el IGTF y estandarizar el guardado de montos en Bs en la base de datos.
Antes de escribir cualquier código consulta las skills disponibles especialmente frontend-design.
PARTE 1 — Migración de Prisma
Agregar a CompanyConfig:

isIGTFContributor Boolean @default(false) — activa/desactiva el IGTF
igtfPct Float @default(3) — porcentaje IGTF configurable (actualmente 3% por ley)

Agregar a Invoice:

igtfUsd Float @default(0) — monto IGTF en USD
igtfBs Float @default(0) — monto IGTF en Bs
subtotalBs Float @default(0) — subtotal en Bs guardado
ivaBs Float @default(0) — IVA total en Bs guardado

Agregar a InvoiceItem:

unitPriceBs Float @default(0) — precio unitario en Bs
ivaAmountBs Float @default(0) — monto IVA en Bs
totalBs Float @default(0) — total del item en Bs

Agregar a Payment:

igtfUsd Float @default(0) — IGTF generado por este pago
igtfBs Float @default(0) — IGTF en Bs

Verificar que Receivable y Payable ya tienen campos Bs — si no agregar:

amountBs, paidAmountBs en ambos modelos

Corre migración con nombre add_igtf_and_bs_amounts.
PARTE 2 — Backend (NestJS)
Lógica del IGTF en InvoicesService:
Al crear una factura (POST /invoices) y al procesar el cobro (PATCH /invoices/:id/pay):
Regla del IGTF:
typescript// Métodos que generan IGTF
const IGTF_METHODS = ['CASH_USD', 'ZELLE']

// Solo calcular si:
// 1. companyConfig.isIGTFContributor = true
// 2. invoice.igtfUsd === 0 (no se ha calculado antes)
// 3. El método de pago actual está en IGTF_METHODS

if (isIGTFContributor && invoice.igtfUsd === 0 && IGTF_METHODS.includes(payment.method)) {
  const igtfUsd = payment.amountUsd * (igtfPct / 100)
  const igtfBs = igtfUsd * exchangeRate
  // Actualizar invoice.igtfUsd e invoice.igtfBs
  // Recalcular invoice.totalUsd += igtfUsd
  // Recalcular invoice.totalBs += igtfBs
}
Al calcular y guardar montos en Bs — aplicar en toda creación de documentos:
typescriptconst exchangeRate = todayRate.rate

// InvoiceItem
item.unitPriceBs = item.unitPriceUsd * exchangeRate
item.ivaAmountBs = item.ivaAmount * exchangeRate
item.totalBs = item.totalUsd * exchangeRate

// Invoice
invoice.subtotalBs = invoice.subtotalUsd * exchangeRate
invoice.ivaBs = invoice.ivaUsd * exchangeRate
invoice.totalBs = invoice.totalUsd * exchangeRate
// igtfBs se calcula al momento del pago
Actualizar GET /invoices/:id para retornar todos los campos Bs en la respuesta.
PARTE 3 — Frontend (Next.js)
Modal de cobro en el POS:
Al agregar un método de pago en divisas (Efectivo USD o Zelle):

Si companyConfig.isIGTFContributor = true Y es el primer método en divisas (igtfUsd actual = 0):

Calcular IGTF: igtfUsd = amountUsd * (igtfPct / 100)
Mostrar en el resumen del modal una línea nueva: "IGTF (3%): $X.XX / Bs X.XX"
El total se actualiza automáticamente sumando el IGTF


Si ya hay un pago en divisas registrado → no calcular IGTF de nuevo aunque agregue otro método en divisas

El resumen del modal de cobro debe mostrar:
Subtotal:        $XX.XX    Bs XX.XX
IVA:             $XX.XX    Bs XX.XX
IGTF (3%):       $XX.XX    Bs XX.XX  ← solo si aplica
─────────────────────────────────────
Total:           $XX.XX    Bs XX.XX
─────────────────────────────────────
Pagado:          $XX.XX
Pendiente:       $XX.XX
PDF de factura:

Agregar línea de IGTF entre IVA y Total si igtfUsd > 0
Mostrar: "IGTF (3%): $X.XX / Bs X.XX"

Vista detalle de factura:

Mostrar IGTF en el desglose si aplica
Mostrar todos los montos en Bs junto a los USD

En /settings — Configuración de empresa:

Agregar sección "Impuestos":

Toggle "Contribuyente IGTF" con descripción "Aplica 3% IGTF a pagos en divisas"
Campo "Porcentaje IGTF (%)" — solo visible si el toggle está activo, default 3



Libro de ventas fiscal:

Agregar columna "IGTF" en el libro de ventas
Incluir en los totales del período

Al terminar:

Activar isIGTFContributor en la configuración
Crear factura de prueba: total $100, pagar $60 Zelle + $40 Pago Móvil
Verificar: IGTF = $1.80 (3% de $60), total factura = $101.80
Crear segunda factura: pagar $50 Zelle + $50 Efectivo USD
Verificar: IGTF se calcula solo una vez sobre $50 (el primer pago en divisas), no sobre $100
Verificar que el PDF muestra el IGTF correctamente
Verificar que los montos en Bs están guardados correctamente en la DB
Haz commit con el mensaje feat: IGTF tax implementation and standardize Bs amounts in database
Haz push a GitHub
Actualiza el PROGRESS.md y el PROJECT.md