Verifica qué modelos tienen campos en Bs y cuáles les faltan. El patrón es: todo campo que tenga un monto en USD debe tener su equivalente en Bs guardado en la DB — nunca calcular Bs en tiempo de ejecución.
Revisa estos modelos específicamente:
PurchaseOrder:

Agregar totalBs Float @default(0)

PurchaseOrderItem:

Agregar costBs Float @default(0) y totalBs Float @default(0)

Payable:

Verificar que tiene amountBs, retentionBs, netPayableBs, paidAmountBs — agregar los que falten

PayablePayment:

Verificar que tiene amountBs — agregar si falta

Receivable:

Verificar que tiene amountBs y paidAmountBs — agregar los que falten

ReceivablePayment:

Verificar que tiene amountBs — agregar si falta

QuotationItem:

Agregar unitPriceBs Float @default(0), ivaAmountBs Float @default(0), totalBs Float @default(0)

Quotation:

Agregar subtotalBs Float @default(0), ivaBs Float @default(0), totalBs Float @default(0)

Después de agregar los campos al schema:

Corre migración con nombre add_bs_amounts_to_all_models
Actualizar los servicios correspondientes para que calculen y guarden los montos en Bs al momento de crear o actualizar cada registro usando la tasa del día
Los registros existentes en la DB quedarán con 0 en los campos Bs — eso está bien para datos de prueba

REGLA PARA FUTURAS TABLAS:
Agregar al CLAUDE.md esta regla:
"Todo campo monetario en USD debe tener su campo equivalente en Bs en el mismo modelo. Los montos en Bs se calculan y guardan al momento de crear/actualizar el registro usando la tasa del día. Nunca calcular Bs en tiempo de ejecución."
Haz commit con el mensaje feat: standardize Bs amounts across all monetary models
Haz push a GitHub y actualiza PROGRESS.md