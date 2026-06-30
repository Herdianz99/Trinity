# Trinity ERP — Progreso

## Sesion 97 (2026-06-30) — Recibos (cobro/pago): fix bug duplicados + tasa editable + eliminar + lista pendientes (SIN DESPLEGAR)

> Bloque grande pedido por Diego tras detectar en prod 3 recibos de pago al MISMO documento (RPG-0001/2/3: 0003 procesado, 0001/0002 borradores). Se trajo copia fresca de prod a local para investigar y probar (prod intacto).

**Bug recibos duplicados (lo critico):** la causa era doble — (1) `getPendingDocuments` no excluia documentos ya incluidos en un recibo en BORRADOR, asi que se podian crear varios borradores del mismo doc; (2) `post` sumaba el pago al `paidAmountUsd` sin validar saldo, asi que postear un borrador viejo doble-pagaba. Fix:
- `post`: re-lee el doc fresco dentro de la tx y RECHAZA si `payAmount > saldo` ("ya no tiene saldo suficiente, posiblemente ya fue pagado por otro recibo"). Para receivables y payables.
- `getPendingDocuments`: excluye payables/receivables que ya estan en un recibo DRAFT (consultando `ReceiptItem` con `receipt.status='DRAFT'`).

**Eliminar recibos borrador:** nuevo `remove(id)` en service + `@Delete(':id')` en controller. Borra el recibo y sus items SOLO si NO esta POSTED (borradores/anulados). Botones de Trash en las listas de Cobro y Pago (status DRAFT o CANCELLED). Verificado: borrar un POSTED -> 400.

**Tasa editable** (`create-receipt.dto` gana `exchangeRate?`): `create` usa la tasa enviada (o la de hoy como fallback) para los Bs "de hoy" y el diferencial, y la guarda en `Receipt.exchangeRate`; `post` usa la tasa del recibo (no la de hoy) para los pagos. Frontend (`new/page.tsx`): estado `rate` editable + `rateDate`. COBRO: selector de fecha que trae la tasa de ese dia (`/exchange-rate/by-date`) + editable. PAGO: tasa manual (proveedor). Recalcula los Bs de los docs al cambiar la tasa; envia `exchangeRate`.

**Lista de pendientes:** columnas Fecha (documento) y Vence (con `dueDate` agregado al mapping de payables en el backend); "Total de la deuda" abajo (suma de saldos CxC/CxP de los PENDIENTES, decrece al sacar docs); ordenados por fecha de vencimiento ascendente (los que vencen primero, arriba); fecha "Vence" en ROJO si esta vencida.

- Probado E2E en la copia de prod: by-date OK (607/623), DELETE protege POSTED, post valida saldo. API + Web typecheck 0 errores. Sin cambios de schema. **Importante**: probar bien el flujo completo de cobro/pago antes de desplegar (afecta CxC/CxP y diferencial cambiario).

## Sesion 96 (2026-06-30) — Proveedores: buscador (como en clientes) (SIN DESPLEGAR)

> Pedido de Diego: filtro en `/catalog/suppliers` como el de `/sales/customers`. Solo frontend (`catalog/suppliers/page.tsx`): el backend (`suppliers.service findAll`) YA soportaba `?search=` (name + rif, case-insensitive), solo faltaba cablearlo.
- Se agrego un input "Buscar por nombre o RIF..." arriba de la tabla (mismo patron que clientes). `fetchSuppliers` paso a `useCallback([search])` y manda `?search=`; refetch al escribir. Imports: `useCallback`, `Search`.
- Probado: 56 proveedores, filtrar por "ACEROS" devuelve 3. Web typecheck 0 errores. Sin backend ni schema.

## Sesion 95 (2026-06-30) — Cotizaciones: compartir PDF en movil (WhatsApp/correo) + Firma y Sello en el PDF (SIN DESPLEGAR)

> Dos pedidos de Diego sobre el PDF de cotizacion (continuacion de S94).
- **Compartir en movil** (`quotations/page.tsx`, `handlePrint` ahora async): antes `window.open` solo dejaba VER el PDF en movil (no compartir). Ahora, si es movil (UA Android/iPhone) y soporta `navigator.canShare`, baja el PDF como `File` y abre el **menu nativo de compartir** (`navigator.share({files})`) → WhatsApp, correo, Drive. En desktop o sin Web Share: `window.open` (ver/imprimir), como antes. Cae con gracia si cancela (AbortError) o no soporta archivos. Modal renombrado a "Imprimir / Compartir".
- **Firma y Sello en el PDF** (`quotation-pdf.service.ts`): se renderiza `config.stampImage` (campo "Firma y Sello (Retenciones)" de Configuracion) a la IZQUIERDA de los totales, con rotulo "Firma y Sello", para darle seriedad. Mismo patron base64→Buffer que el logo, guardado en try/catch. Ajusta el cursor `y = max(y, totalsTopY+95)` para no encimar la nota.
- Probado: PDF genera 200 valido en todos los modos; el sello se embebe sin error (probado con sello temporal, restaurado a NULL). La copia LOCAL tiene `stampImage` NULL, asi que el sello solo se ve en prod (donde esta configurado) o si se carga en Config. API + Web typecheck 0 errores. Sin cambios de schema.

## Sesion 94 (2026-06-30) — Cotizaciones: PDF con opcion "Sin IVA" (vendedor elige al imprimir) (SIN DESPLEGAR)

> Pedido de Diego: poder mandar la cotizacion sin que el reporte muestre el IVA, para que el vendedor elija cual ver/enviar. Decision (confirmada): "sin IVA" = MISMO total, solo se oculta el impuesto (precios finales, el cliente paga lo mismo), NO precios netos.
- **Backend** (`quotation-pdf.service.ts` + `quotations.controller.ts`): `generatePdf(id, hideIva=false)`; el endpoint `GET :id/pdf` acepta `?hideIva=true`. En modo sin IVA: se oculta la columna "% IVA", el desglose de IVA y la linea Subtotal; queda solo el TOTAL (= `quotation.totalUsd`, con IVA incluido). El precio unitario se muestra con IVA (`totalUsd/cant`) para que cant x unitario = total quede consistente.
- **Frontend** (`quotations/page.tsx`): los botones de impresora (tabla desktop + tarjeta movil) ahora abren un modal "Imprimir cotizacion" con 2 opciones: **Con IVA** (PDF de siempre) / **Sin IVA**. `handlePrint(id, hideIva)` agrega el query param.
- Probado E2E: ambos PDFs generan 200 `application/pdf` validos (sin IVA sale mas liviano). API + Web typecheck 0 errores. Sin cambios de schema.

## Sesion 93 (2026-06-30) — Inventario/Stock: KPIs arriba + toggle Costo/Brecha en valuacion (SIN DESPLEGAR)

> Dos pedidos de Diego en `/inventory/stock` (solo frontend, `inventory/stock/page.tsx`).
- **KPIs arriba**: el "Reporte Valorizado" (Productos, Unidades, Valor USD, Valor Bs) se movio de DESPUES de la tabla a ARRIBA (debajo del selector de almacen), para verlo sin scrollear toda la lista.
- **Toggle Costo / Brecha**: en la cabecera del reporte. "Costo" = costo puro; "Brecha" = costo + brecha (`bregaGlobalPct` global) sumada SOLO a productos con `bregaApplies`. **Arranca en "Brecha" por defecto** (la valuacion que el negocio mira). Afecta el total USD/Bs y las columnas Costo USD + Valor USD por fila (coherente: stock x costo = valor). Muestra "Brecha +X%" cuando esta activo.
- Sin backend: el endpoint de stock ya devolvia `bregaApplies` (include product:true); solo se trajo `bregaGlobalPct` del `/config`. Web typecheck 0 errores.

## Sesion 92 (2026-06-30) — POS: autorizar venta sin stock con clave de supervisor al agregar (SIN DESPLEGAR)

> Pedido de Diego (2da iteracion; la 1ra se revirtio). El 1er intento pedia la clave AL COBRAR, pero el vendedor no se enteraba de que no habia stock hasta el final. Este enfoque autoriza **al agregar el producto**: el vendedor ve "Sin stock" al instante y un boton discreto "Autorizar" que pide la clave del supervisor (que esta ahi mismo).

- **Permiso nuevo** `SELL_NEGATIVE_STOCK` ("Vender sin stock (negativo)") en el enum `DynamicKeyPerm` (migracion `20260630183000_sell_negative_stock_perm`, solo `ADD VALUE IF NOT EXISTS`, + en `fix-schema.sql`; tambien se agrego el faltante `MANUAL_CASH_MOVEMENT` a fix-schema). **Sin columna nueva, sin config de 3 modos**: se reusa el toggle "Permitir ventas sin stock".
- **Flujo**: con el toggle apagado, el producto sin stock en el POS muestra "Sin stock · Autorizar 🔒". Click → `DynamicKeyModal` (modo normal, valida contra `/dynamic-keys/validate` + log de auditoria, igual que las otras claves). Al autorizar, `addToCart(product, true)` lo agrega marcando la linea `authorizedNegative`. Por producto.
- **Backend** (`invoices.service` pay): el bloqueo de stock ahora es `if (allowNegativeStock===false && !dto.negativeStockAuthorized)`. El POS manda `negativeStockAuthorized: cart.some(i => i.authorizedNegative)` en cobro contado Y credito. `pay-invoice.dto` gana `negativeStockAuthorized?: boolean`. NO se re-valida la clave en el backend (frontend-gated, como el resto de claves dinamicas).
- Probado E2E el eslabon nuevo: crear clave + validar `SELL_NEGATIVE_STOCK` autoriza; el flujo en POS lo confirmo Diego. API + Web typecheck 0 errores. **Nota**: el 1er intento (clave al cobrar + columna `negativeStockRequiresAuth` + config 3 modos) tuvo un bug (el evento del click se pasaba como authKey → "circular JSON") y se revirtio entero; quedo una columna huerfana `negativeStockRequiresAuth` solo en la BD LOCAL (no en prod, no en schema).

## ✅ DEPLOY a PRODUCCION — 2026-06-30 (mediodia) — commit `b6ea75e`

Desplegadas las **Sesiones 86 a 91** (deploy hecho por Diego al mediodia, en el descanso de 2h de los vendedores). Ya en uso en la nube. Incluye: Precio venta + Descuento en movimientos (S86), vuelto en efectivo USD + fix base IGTF sobre sobrepago (S87), emails de usuario normalizados/login case-insensitive + tasa de cambio a 4 decimales (S88), boton imprimir en cotizaciones movil (S89), y navegacion con teclado (flechas + Enter) en los buscadores de compras (S90) y POS (S91).

- **Verificar en prod (pendiente del cliente):** (1) IGTF en caja fiscal real usa la base correcta sin contar el vuelto; (2) el vuelto en efectivo USD deja la caja cuadrada; (3) opcional para uniformar emails: `UPDATE "User" SET email = lower(email) WHERE email <> lower(email);` (el login ya es case-insensitive, nadie queda bloqueado sin esto).

## ✅ DEPLOY a PRODUCCION — 2026-06-29 (noche) — commit `4ad88bf`

Desplegadas las **Sesiones 78 a 85** (primer dia de Trinity en produccion en El Trebol). Verificado por SSH: migracion `20260629160000_invoice_pending_indexes` aplicada, PM2 (`trinity-api`/`trinity-web`) online y estable, health `ok` + `database: ok`. Sin incidentes.

- **Ya estaba en prod sin deploy (aplicado a mano por SSH durante el dia):** metodo de pago `pm_saldo_favor` (desbloqueo de caja, Sesion 80) e indice GIN `Product_searchVector_idx` (busqueda de productos). Ambos confirmados + en `fix-schema.sql` como red de seguridad.

### 🔜 Para continuar mañana (2026-06-30)
1. **Reporte Z + Libro (Sesion 84)** — PROBAR en la HKA80 real. Si imprime y guarda → OK. Si da error → usar **"Reporte Z simple"** (siempre cierra) y capturar el log de consola (`[FISCAL] U0X raw:` y `readReportData: N paquete(s)`) para afinar offsets / pasar a `U0Z`. (El fix del timeout fue: los comandos de extraccion usan protocolo multi-paquete ETB/EOT, no la trama simple ETX.)
2. **Cuadre de caja (Sesion 83)** — confirmar que ya NO da sobrante falso cuando hay facturas devueltas (PARTIAL_RETURN/RETURNED ahora cuentan en el esperado). El sobrante que anotaron a mano hoy queda a criterio de Diego.
3. **Verificaciones rapidas en prod:** reimpresion de ticket 80mm de nota de entrega (Sesion 82, el boton de impresora ahora saca ticket en no fiscales), comanda con cliente/vendedor/firma (Sesion 78), "Disponible" en POS (Sesion 81), busqueda POS completa (Sesion 79), KPI Ventas monto completo (Sesion 85).
4. **Pendientes menores documentados (NO urgentes):** drift FK `onDelete RESTRICT` en `Receivable.invoiceId` y `RetentionVoucherLine.purchaseOrderId` (solo afecta si se BORRAN facturas/compras con relaciones; las facturas se anulan, no se borran); columnas `NOT NULL` en `PurchaseOrder`/`PurchaseOrderItem` con 0 NULLs reales hoy; opcion de monto completo en las mini-cards de caja del dashboard (Ingresos/Egresos/Neto) si lo piden.

---

## ✅ DEPLOY a PRODUCCION — 2026-06-27 (noche) — commit `8ff02e5`

Se desplegó a produccion todo lo que estaba en `main` (server paso de `80ad634` a `8ff02e5`): **Sesiones 69 a 76** (y lo que quedaba pendiente de 66-68). Las **5 migraciones** se aplicaron correctamente y el schema quedo sincronizado.

- **Incidente (resuelto)**: el `deploy.sh` **se salto el `pnpm install`** (paso [2/9] "sin cambios en dependencias") porque se hizo `git pull` antes y el pull interno del script vio "Already up to date" → su deteccion de cambios concluyo que no habia dependencias nuevas. Resultado: **`bwip-js` no se instalo** → el build de la API fallo y la API entro en crash-loop (`MODULE_NOT_FOUND: bwip-js` en `labels.service`). **Fix aplicado a mano**: `pnpm install && pnpm --filter @trinity/api build && pm2 restart trinity-api` → API estable (uptime subiendo, ↺ sin crecer). Datos y migraciones intactos.
- **Leccion / pendiente**: ajustar `deploy.sh` para que el `pnpm install` **no dependa** de su deteccion de cambios (que siempre lo intente, o que compare `pnpm-lock.yaml` contra el ultimo commit desplegado). Mientras tanto: si un deploy trae dependencia nueva, correr `pnpm install` aparte.
- **Paso manual post-deploy PENDIENTE**: en *Configuracion → Permisos por rol*, dejar **WAREHOUSE** en "Inventario (solo consulta)" (la BD de prod no se actualiza sola) y que el usuario cierre sesion y vuelva a entrar.
- **Pendientes de prueba E2E del cliente en prod**: etiquetas (PDF), reemplazos, transferencias (TRF-0001), ventas perdidas (boton POS), compra con costo bajo (6 decimales).

---

## Sesion 91 (2026-06-30) — POS: navegacion con teclado en buscadores de producto y cliente (DESPLEGADA 2026-06-30)

> Continuacion de la S90: mismo patron de teclado replicado en el POS (`sales/pos/page.tsx`) para consistencia. Solo las vistas DESKTOP (lista de una columna); la grilla movil de productos (2 columnas, tactil) se dejo como estaba.
- Estados `productHighlight` / `customerHighlight`. Helpers `pickProduct` (sin stock → venta perdida, con stock → carrito) y `pickCustomer` (asigna cliente), reusados en click y Enter.
- `onKeyDown` en los inputs desktop de producto y cliente: ArrowDown/ArrowUp (mueve y topa), Enter (selecciona el resaltado + preventDefault), Escape (cierra resultados). Resaltado visual + `scrollIntoView({block:'nearest'})` + `onMouseEnter` unifica mouse/teclado.
- Reset del indice a 0 al teclear y al llegar resultados (producto async con debounce; cliente via useEffect de `customerSearch`).
- Lector de codigo de barras sin conflicto: si Enter llega antes de cargar resultados (`length===0`), el handler retorna sin hacer nada (igual que antes). Solo frontend, Web typecheck 0 errores.

## Sesion 90 (2026-06-30) — Compras: navegacion con teclado en buscadores de proveedor y producto (DESPLEGADA 2026-06-30)

> Pedido de Diego: los usuarios venian de un sistema donde buscaban el proveedor y bajaban con las flechas del teclado para seleccionar sin mouse. Se agrego navegacion con teclado a los dos autocompletes de `purchases/new/page.tsx`.
- **Proveedor** (dropdown sincronico, lista `filteredSuppliers`): estado `supplierHighlight`; `onKeyDown` en el input con ArrowDown/ArrowUp (mueve y topa el indice), Enter (selecciona el resaltado + `preventDefault` para no enviar el form), Escape (cierra). Resaltado visual del item activo, `scrollIntoView({block:'nearest'})` para auto-scroll, y `onMouseEnter` unifica mouse+teclado. Reset del indice a 0 en onChange/onFocus.
- **Productos** (busqueda async con debounce, lista `productResults` por fila `activeSearchRow`): estado `productHighlight`; misma logica en `onKeyDown` del input de producto (guard `activeSearchRow === idx`), Enter llama `selectProduct`, Escape limpia resultados. Reset del indice a 0 al teclear y al llegar los resultados async.
- Solo frontend, Web typecheck 0 errores. Mismo patron reusable para POS (cliente/producto) si lo piden.

## Sesion 89 (2026-06-30) — Cotizaciones: boton de imprimir en la vista movil (DESPLEGADA 2026-06-30)

> El listado de cotizaciones (`quotations/page.tsx`) tenia boton de imprimir PDF en cada fila del desktop, pero la vista movil (tarjetas) no lo tenia (ni el modal de detalle). Se agrego un boton "Imprimir" a cada tarjeta movil.
- La tarjeta era un `<button>` (abria el detalle); se convirtio en `<div>` clickeable (no se puede anidar un boton dentro de otro). El boton de imprimir usa `e.stopPropagation()` para imprimir sin abrir el detalle. Misma accion `handlePrint` (abre `/quotations/:id/pdf`). Solo frontend, Web typecheck 0 errores.

## Sesion 88 (2026-06-30) — Emails de usuario estandarizados + tasa de cambio a 4 decimales (DESPLEGADA 2026-06-30)

> Dos pedidos chicos de Diego. Probado en local con copia de la BD de prod.

**1. Emails estandarizados** (Diego no podia entrar por poner una mayuscula sin querer). Helper nuevo `apps/api/src/common/email.ts` → `normalizeEmail()` (trim + lowercase).
- Al **crear/editar** usuario se guarda el email normalizado (`users.service.ts`).
- **Login** y chequeos de duplicado: busqueda **case-insensitive** (`findFirst` + `mode: 'insensitive'`), asi el casing nunca bloquea el acceso aunque el email guardado tenga mayusculas (`auth.service.ts`, `users.service.ts`). Verificado en local: login con `ROXANA@gmail.com` (mayusculas) → 401 por clave, no 500 → la query insensitive corre OK.
- Datos existentes: pasado a lower() el unico email con mayusculas en la copia local (`Roxana@gmail.com`). **En prod**, al desplegar correr una vez: `UPDATE "User" SET email = lower(email) WHERE email <> lower(email);` (opcional: el login ya es case-insensitive, asi que nadie queda bloqueado sin esto).

**2. Tasa de cambio con 4 decimales** en TODOS los sitios donde se muestra el VALOR de la tasa (no montos en Bs). Helper nuevo `apps/web/src/lib/format.ts` → `fmtRate()` (4 dec, es-VE).
- `.toFixed(2)` → `.toFixed(4)` en displays de tasa; `fmt(tasa)` → `fmtRate(tasa)` (con import). Cubre POS, config (tasa de hoy + historial), banner BCV, gastos, dashboard home, facturas (detalle + listado + tabla de pagos), CxC/CxP, recibos, notas credito/debito, cronogramas de pago, retenciones ISLR, y el **ticket termico impreso** (`print-receipt.ts`, helper local `fmtRate4` estilo VE). 22 archivos + 2 helpers.
- Los montos en Bs (`monto × tasa`) se dejaron en 2 decimales a proposito.
- Sweep mecanico hecho con subagente bajo reglas estrictas (solo valor de tasa, nunca montos, no tocar `fmt`); revisado y verificado typecheck 0 errores.

- Sin cambios de schema. API + Web typecheck 0 errores.

## Sesion 87 (2026-06-30) — POS: vuelto en efectivo USD (ayuda de calculo) + fix base IGTF sobre sobrepago (DESPLEGADA 2026-06-30)

> Dos cambios en el cobro del POS (`sales/pos/page.tsx`) + backend de IGTF (`invoices.service.ts`). Probado en local con copia de la BD de prod.

**1. Vuelto en efectivo USD** (pedido de Diego): cuando el cliente paga en divisa y sobra, el cajero podia antes dar TODO el vuelto en Bs. Ahora puede dar **parte en billetes USD** y solo el resto en Bs (ej. factura $17.63, paga $20, da $2 USD + $0.37 en Bs). 
- **Enfoque (decidido con Diego): ayuda de calculo que guarda el NETO, sin campo nuevo ni migracion ni cambio de backend.** A la caja entran $18 (20 − 2), no $20. Al confirmar, el frontend **resta el vuelto USD al pago en divisa** antes de enviar; la logica de vuelto existente calcula sola el resto en Bs. La caja cuadra exacto (+$18 USD − Bs del resto = total) reutilizando el arqueo actual.
- UI: input "Vuelto en efectivo USD" topado al vuelto total + boton "Todo USD"; muestra el Bs restante; el "Metodo de vuelto (Bs)" solo se exige si queda resto en Bs. Limpieza de pagos en $0 tras la reduccion (evita pagos fantasma).
- Tradeoff aceptado: no se guarda el bruto ("$20 entregados"); en la factura el pago USD figura como el neto. Correcto para arqueo/reportes.

**2. Fix IGTF sobre sobrepago** (bug pre-existente detectado por Diego): el IGTF (3%) se calculaba sobre el monto entregado en divisa (`firstForeignPayment.amountUsd`), asi que cobraba 3% tambien del vuelto. Ahora la base se topa a lo que realmente paga la factura: `baseIGTF = max(0, min(divisaPagada, totalBienesIVA − otrosMetodos))`. Ej: factura $17.61 pagada con $20 → IGTF pasa de $0.60 (sobre $20) a **$0.53** (sobre $17.61). Aplicado **identico en frontend (display) y backend (autoritativo)**. Maneja pago mixto (IGTF solo sobre la porcion en divisa).

- API + Web typecheck 0 errores. Sin cambios de schema. **Pendiente probar en caja fiscal real** antes de confiar el IGTF en produccion.

## Sesion 86 (2026-06-30) — Movimientos de Stock: quitar "Referencia", agregar "Precio venta" + "Descuento" (DESPLEGADA 2026-06-30)

> Pedido de Diego: en `/inventory/movements` las columnas "Motivo" y "Referencia" eran casi lo mismo (ej. reason "Venta factura X-001" / reference "X-001", y el numero ya esta dentro del Motivo + la columna "Origen" enlaza al documento). Se **elimino "Referencia"** (se dejo "Motivo", la mas descriptiva) y se agregaron dos columnas para auditar descuentos de cajeros: **"Precio venta"** y **"Descuento"**.

- **Backend** (`stock-movements.service.ts`, `findAll`): el `StockMovement` no guarda precio ni descuento, asi que se **enriquecen** los movimientos de venta buscando su `InvoiceItem` por `(invoiceId, productId)`. Una sola query extra por pagina (`invoiceId IN [...]`), solo para `sourceType='SALE_INVOICE'`. Devuelve `salePrice` y `discountPct` (null en compras/ajustes/transferencias).
- **Precio CON IVA** (decision de Diego): `salePrice = totalUsd / quantity` de la linea = precio unitario final que paga el cliente, **con IVA incluido y descuento ya aplicado**. (Primero se hizo neto sin IVA y quedaba "en menos" vs lo que el supervisor espera; se corrigio a con-IVA. Maneja exentos OK: IVA 0 sin recargo.)
- **Frontend** (`inventory/movements/page.tsx`): nuevas columnas "Precio venta" (`$x.xx`) y "Descuento" (% en ambar si >0, gris si 0%, `—` si no aplica). colSpan 8→9. Solo ventas traen datos; compras/ajustes salen con `—`.
- Sin cambios de schema. API + Web typecheck 0 errores. Probado en local (Diego valido el numero con IVA).
- **Pendiente**: ¿incluir tambien precio/descuento en devoluciones (`CREDIT_DEBIT_NOTE`)? Hoy salen con `—`.

## Sesion 85 (2026-06-29) — Dashboard: KPI de Ventas muestra monto completo (no $2.8K / Bs 1.7M) (DESPLEGADO 2026-06-29)

> El KPI "Ventas" del dashboard abreviaba con `fmtCompact` ($2.8K, Bs 1.7M). Se cambio a `fmt` (monto completo con separadores VE: $2.800,00 / Bs 1.700.000,00), igual que ya hacian "Devoluciones" y "Ticket Promedio". Solo el value y sub de la card Ventas (`dashboard/page.tsx`). Los ejes de los graficos SIGUEN compactos (si no, no caben las etiquetas). Solo frontend, deploy Web. Typecheck 0 errores.

## Sesion 84 (2026-06-29) — Reporte Z: 2 botones (simple seguro + "Z + Libro") + fix protocolo multi-paquete (DESPLEGADO 2026-06-29)

> El boton Reporte Z fallaba con "Timeout esperando ETX en trama de respuesta". **Causa raiz (confirmada con el manual The Factory HKA, §10.3 Tabla 11)**: los comandos de extraccion de reporte (`U0X`/`U0Z`) responden con protocolo **multi-paquete** — varios paquetes `STX-DATA-ETB-LRC` (ETB=0x17), ACK por paquete, cerrando con `EOT` (0x04). El codigo solo sabia leer la trama simple terminada en `ETX` (0x03, Tabla 10, que usan S1/SV) -> `readFrame` nunca hallaba ETX -> timeout. Por eso la deteccion (S1/SV) funcionaba pero el Z no. `U0X` NO era inventado (manual §21.1, valido para HKA80).

- **Fix protocolo** (`fiscal-printer.ts`): constantes `ETB`/`EOT`; nuevo `SerialIO.readReportData()` que lee los paquetes ETB, ACK-ea cada uno y termina en EOT, concatenando el DATA; nuevo `sendReportReadCommand()`. `extractAndPrintZReport` ahora lee `U0X` con ese protocolo (+ logs del raw para afinar offsets si hiciera falta). Se mantiene `U0X` (lee acumuladores actuales antes de cerrar) y el parseo existente.
- **UX — 2 botones de Z** (decision del usuario, patron seguro):
  - **"Reporte Z + Libro"** (`'Z'`): extrae datos (multi-paquete) + imprime + guarda en libro. Experimental hasta validar contra la HKA80 real.
  - **"Reporte Z simple"** (`'Zs'`): solo manda `I0Z` (como el X), imprime el cierre SIN leer ni guardar. **Respaldo garantizado** si el "+ Libro" falla. Como el "+ Libro" lee ANTES de cerrar, si falla la lectura el Z no se cierra -> el simple lo cierra sin doble cierre.
- Solo frontend, sin schema/backend. Web typecheck 0 errores. No se pudo probar local (no hay impresora fiscal): se valida manana en caja; si "+ Libro" da error, usan el simple y se itera con el log del raw.

## Sesion 83 (2026-06-29) — Caja: facturas devueltas desaparecian del reporte Y del arqueo (sobrante falso) (DESPLEGADO 2026-06-29)

> **Bug grave detectado en produccion hoy**: al cuadrar caja "sobraba dinero". Causa: el modulo de caja contaba pagos de ventas filtrando `status: 'PAID'`. Cuando una factura se devuelve (parcial o total) pasa a `PARTIAL_RETURN`/`RETURNED` y se caia de esos calculos, PERO el pago original SI entro a la caja (la nota de credito no saca efectivo de la gaveta; los pagos no se borran). Resultado: el **esperado** del arqueo quedaba subestimado -> Real > Esperado = **sobrante falso**. Ej. real: NE-26-00000573 (PARTIAL_RETURN) con pagos P.V Bancaribe $167.70 + Cashea $251.55 no aparecia en el reporte de movimientos.

- **Fix** (`cash-registers.service.ts` x3 + `cash-session-pdf.service.ts` x1): `status: 'PAID'` -> `status: { in: ['PAID','PARTIAL_RETURN','RETURNED'] }` en: reporte global de movimientos, reporte de sesion (PDF), lista de pagos de sesion, y `getSessionSalesData` (calculo del arqueo/esperado).
- **Por que es correcto**: una factura pagada-y-luego-devuelta FUE pagada; ese movimiento de dinero ocurrio y debe contarse. La devolucion es un evento aparte (si entrega efectivo, ya se registra como movimiento de salida). Verificado: la NCV no crea CashMovement ni borra los Payment, asi que NO hay doble conteo.
- **Alcance**: solo modulo de caja (movimiento de dinero). NO toca reportes de ventas (donde una devolucion si debe restar ventas netas). Solo backend, sin schema. API typecheck 0 errores.
- *Nota*: corrige hacia adelante; sesiones ya cerradas con el sobrante falso quedan como estan (el calculo del esperado se recomputa bien al re-consultar).

## Sesion 82 (2026-06-29) — Reimprimir ticket 80mm de notas de entrega (no fiscales) (DESPLEGADO 2026-06-29)

> Pedido: poder reimprimir el ticket termico de una factura cuando es **nota de entrega** (no fiscal). Antes solo se podia: reimprimir si era fiscal (impresora fiscal) o "Imprimir PDF" que sale tamaño **carta**. La funcion `printReceipt()` (ticket 80mm, ya usada por el POS al cobrar) existia pero no estaba cableada para reimprimir. Solo frontend, deploy **solo Web**. Web typecheck 0 errores.

- **Decision UX**: NO se agrega un boton aparte; se reusa el **boton de impresora que ya existia**. Para no fiscales imprime el ticket 80mm; para fiscales mantiene el PDF carta.
- **Detalle de factura** (`sales/invoices/[id]`): el item de impresion en "Mas acciones" ahora ramifica: `serie.isFiscal` -> "Imprimir PDF (carta)" (window.open pdf); no fiscal -> "Imprimir ticket" via `handleReprintTicket()` -> `printReceipt(invoice, companyConfig)` (agente termico, o window.print() 80mm). Mismo icono Printer.
- **Listado de facturas** (`sales/invoices`): el boton de impresora de cada fila ramifica igual (fiscal -> PDF, no fiscal -> ticket). Como el listado solo trae resumen, para el ticket **pide la factura completa** (`GET /invoices/:id`) + `/config` antes de imprimir. Estado `ticketBusyId` para el spinner por fila. (La tarjeta movil no tiene boton de impresion; en movil se imprime desde el detalle, como era antes.)
- Las fiscales siguen con su "Reimprimir Fiscal" (impresora fiscal) ademas del PDF.

## Sesion 81 (2026-06-29) — POS: "Disponible" = stock real - reservado en facturas en espera (DESPLEGADO 2026-06-29)

> Pedido: en el POS ver, ademas del stock real, cuanto queda DISPONIBLE descontando lo que otros vendedores ya pusieron en facturas en espera (PENDING). Ej: 80 tubos reales, 5 en una factura en espera y 7 en otra -> "Stock: 80 / Disponible: 68". El stock solo se descuenta al PAGAR, asi que las en-espera no reservaban nada. **Cambio de schema** (2 indices). API + Web typecheck 0 errores. Migracion aplicada y validada en local.

- **Backend** (`invoices`): nuevo `GET /invoices/reserved-stock` -> `getReservedStock()` hace `groupBy InvoiceItem by productId where invoice.status='PENDING' _sum quantity`, devuelve `{productId: cantidadReservada}` (todas las pendientes, de cualquier dia/vendedor/caja). Escala con # de pendientes, NO con el catalogo.
- **Frontend** (`sales/pos/page.tsx`): estado `reservedStock`, se carga junto al sondeo de pendientes (cada 30s, `Promise.all`). En resultados de busqueda (movil grid y escritorio lista) muestra "Disponible: X (N en espera)" debajo del stock, **solo si reserved>0**; en rojo si queda negativo (sobrevendido en espera). No cuenta el carrito en construccion.
- **Indices** (migracion `20260629160000_invoice_pending_indexes` + `@@index` en schema + `fix-schema.sql`): `Invoice(status)` e `InvoiceItem(invoiceId)`. No afectan nada existente (aditivos/transparentes); aceleran esta consulta Y la lista de facturas en espera. Especialmente valiosos en la tienda grande por VOLUMEN de ventas (no por catalogo). Nombres = defaults de Prisma para evitar drift.
- **Follow-up GIN (RESUELTO en prod):** se descubrio que el indice GIN `Product_searchVector_idx` (que crea la migracion 20260510000000) **faltaba en prod** — la columna `searchVector` y el trigger estaban, el indice no -> la busqueda hacia seq scan. Se **re-creo directo en prod por SSH** (instantaneo, sin deploy, no bloquea lecturas) y se agrego a `fix-schema.sql` con `IF NOT EXISTS` para que no vuelva a faltar. (Optimizacion mas profunda futura, NO hecha: indice trigram pg_trgm para el `ILIKE '%...%'`; no urgente.)

## Sesion 80 (2026-06-29) — Cobro con "Saldo a Favor" reventaba: faltaba el metodo en prod (DESPLEGADO 2026-06-29)

> En produccion, al cobrar una factura cruzando el saldo a favor del cliente, fallaba con *"Metodo de pago con id 'pm_saldo_favor' no encontrado"* (`invoices.service.pay` linea ~421). **Causa raiz = dato faltante, no codigo**: el sistema usa el id fijo `pm_saldo_favor` (seed.ts:505) y `Payment.methodId` es FK a `PaymentMethod`, asi que esa fila DEBE existir. La BD de prod (sembrada antes de que el seed lo incluyera) NO la tenia. Verificado por SSH: habia 20 metodos, ninguno el saldo a favor.

- **Fix inmediato (YA aplicado en prod por SSH)**: `INSERT` de `pm_saldo_favor` (Saldo a Favor, isDivisa=false, isActive=true, sortOrder=99) con `ON CONFLICT DO NOTHING`. La caja quedo desbloqueada al instante (el backend lee el metodo fresco en cada cobro, sin reinicio).
- **Auto-reparacion** (`deploy/fix-schema.sql`): se agrego el mismo INSERT idempotente para que cualquier BD sin el metodo se repare en el proximo deploy.
- **Frontend** (`sales/pos/page.tsx`): el dropdown de **metodo de vuelto** filtraba solo por `!isDivisa && isActive`, asi que "Saldo a Favor" (que es ambas) se colaba como opcion de vuelto. Se agrego `&& pm.id !== 'pm_saldo_favor'` (igual que ya hacian los selectores de pago y de anticipo). El selector principal de pago ya lo excluia: el cajero NO lo ve como metodo normal, solo via el boton "Saldo a favor del cliente" cuando el cliente tiene saldo.
- *Sin cambio de codigo backend ni de schema.* Web typecheck 0 errores.

## Sesion 79 (2026-06-29) — POS: busqueda mostraba solo 10 resultados (DESPLEGADO 2026-06-29)

> Reporte de vendedores en el arranque en produccion: buscar "clavo" en el POS mostraba **10** articulos, pero en `/catalog/products` salian **40** ("donde estan los demas?"). Causa: el POS pedia `&limit=10` sin paginacion; POS y catalogo usan **la misma busqueda del API** (full-text + ILIKE sobre name/code/barcode/supplierRef), la unica diferencia era el limite. Los productos nunca faltaron. Solo frontend, deploy **solo Web**. Web typecheck 0 errores.

- **Frontend** (`sales/pos/page.tsx`, `handleProductSearch`): limite **10 → 500** para que el cajero scrollee todos los resultados de su busqueda (ej. "tubo"/"cable" pasan de 50). El dropdown ya era scrollable. No se quita el tope del todo para no arriesgar pintar miles de tarjetas si el termino es muy generico (tablet de caja).
- **Aviso de seguridad**: nuevo estado `searchTotal` (del `total` que ya devuelve el API). Si los resultados superan el tope, muestra "Mostrando X de Y. Refiná la búsqueda para ver el resto." en las **dos** vistas del POS (grid desktop y lista). Se resetea al limpiar busqueda / agregar al carrito.
- **Sin cambio de backend**: el DTO de products (`limit`) solo tiene `@Min(1)`, sin `@Max`, asi que acepta 500.

## Sesion 78 (2026-06-29) — Comanda de despacho: cliente, vendedor y firma (DESPLEGADO 2026-06-29)

> Pedido de la gente de despacho en el arranque de Trinity en produccion: la comanda debe mostrar **cliente** y **vendedor**, mas una **seccion para firmar quien despacha**. Sin cambio de schema (solo se incluyen relaciones ya existentes). API typecheck 0 errores, Web typecheck 0 errores. El **agente termico NO cambia** (el texto se arma en el web y se le envia listo): solo deploy de **API + Web**.

- **Backend** (`print-jobs.service.ts`, `findPending`): el `include` de la factura ahora trae `customer { name }` y `seller { name }` para que la comanda pendiente los tenga al imprimirse.
- **Frontend** (`print-monitor.tsx`): interfaz `PrintJob` ampliada + las **dos** rutas de impresion actualizadas: (1) `buildTicketText` (markup ESC/POS del agente termico) y (2) el fallback HTML de `window.print()`. Se agrega bajo Factura/fecha: `Cliente: <nombre>` (o "Contado" si null) y `Vendedor: <nombre>` (solo si la factura tiene vendedor). Al final, tras Renglones/Unidades, bloque de firma: linea + "Despachado por (firma)".
- *Nota*: las comandas que ya esten `PENDING` antes del deploy no traeran cliente/vendedor; las nuevas y las reimpresiones si. El vendedor se preserva en el flujo POS (vendedor→cajero), asi que viene poblado en ventas reales.

## Sesion 77 (2026-06-28) — Descartar pagos en cero en el POS (filas fantasma) (DESPLEGADO 2026-06-28)

> Bug de datos detectado al revisar la factura NE-26-00000443: tenia **3 registros de pago pero 2 en $0** (Transferencia y Efectivo USD), aunque el cobro real fue 100% Efectivo Bs. El POS pre-llena un metodo recien agregado con el **restante**; si el total ya estaba cubierto, ese metodo entra en $0 y se persistia igual, **inflando los reportes por metodo de pago** (no afecta total ni cuadre). La pantalla de cobranzas (`receipts/new`) ya filtraba; el POS no. Sin cambio de schema. API typecheck 0 errores, watcher recompilo limpio. Commit `8ba484a`.

- **Frontend** (`sales/pos/page.tsx`, `handleConfirmPayment`): `finalPayments` ahora filtra las filas con `amountUsd <= 0 && amountBs <= 0` antes de enviar (igual que cobranzas) + corta si no queda ningun pago real. **No rompe el pago dividido**: el cajero sigue pudiendo agregar metodos y repartir montos; solo se descartan las filas realmente vacias. Se descarto la idea de "bloquear al agregar cuando el restante es 0" porque romperia justamente el flujo de dividir el pago.
- **Backend** (`invoices.service.pay`): red de seguridad — filtra los mismos pagos en cero al inicio del metodo, antes de validar/persistir, para que **ninguna ruta** pueda volver a guardar filas fantasma. Toda la logica posterior (validacion de total, ajuste de redondeo del ultimo pago, guardado) opera solo sobre pagos reales.
- *Pendiente*: las facturas viejas que ya tienen filas de pago en $0 quedan como estan (el usuario indico que el conteo/limpieza global no era necesario).

## Sesion 76 (2026-06-27) — Costos unitarios de compra a 6 decimales (articulos de costo muy bajo) (DESPLEGADO 2026-06-27)

> Bug real: en compras el **costo unitario** se redondeaba a 2 decimales, rompiendo los articulos de costo muy bajo. Ej. factura FER01752: 10 paquetes x 100 uds = 1000 uds a $2.33/paquete = **$0.0233/unidad**, pero `round2(0.0233)=0.02` → la linea daba **$20** cuando debe ser **$23.30**. Sin cambio de schema (los campos ya son Float). Probado E2E. Web/API **0 errores**.

- **Backend** (`purchase-orders.service`): nuevo helper `round6`. En `calculateItemValues` y `applySurchargeLandedCost`, los costos **UNITARIOS** (costUsd, costBs, netCostUsd/Bs, discountUsd/Bs, landedCostUsd/Bs) redondean a **6 decimales**; los **TOTALES** de linea/factura siguen en **round2** (dinero real). Los totales fiscales usan los totales de linea, asi que el IVA cuadra. Verificado: 0.0233 x 1000 -> linea $23.30 (+ IVA = factura $27.03).
- **Frontend**: detalle de compra (`/purchases/[id]`) usa nuevo `fmtCost` (formateo inteligente min 2 / max 6 decimales, sin ceros de relleno) para los **costos unitarios** → muestra `0.0233`; los totales siguen con `fmt` (2 dec). Form de compra (`/purchases/new`): input de costo `step="any"`.
- **Decision**: los **precios de venta se dejan en 2 decimales** (el precio es lo que se cobra, limpio; el costo ahora preciso ya da margenes reales). Asimetria a proposito: costo 6 dec, precio 2 dec.
- *Pendiente*: la factura vieja FER01752 quedo en $20 (procesada con el bug) — corregir aparte si se quiere. Otros displays de costo del producto (detalle/stock) siguen en 2 dec.

## 🚧 Sesion 75 (2026-06-27) — Pagina de detalle de transferencias + correlativo + clicables (DESPLEGADO 2026-06-27)

> Se completo lo que quedo pendiente en la Sesion 70 ("luego hacemos transferencias como debe de ser"). Probado E2E en local (crear TRF-0001, aprobar, movimientos con sourceType). Web typecheck **0 errores**, API **0 errores**. **Cambio de schema** (campo `Transfer.number`).

- **Schema**: `Transfer.number String? @unique` (TRF-0001). Migracion `20260627180000_transfer_number` con `IF NOT EXISTS` + `fix-schema.sql`. Nullable: las transferencias viejas quedan sin numero (muestran "—"); las nuevas reciben correlativo.
- **Backend** (`transfers.service`): correlativo **TRF-0001** al crear (SELECT FOR UPDATE). Al aprobar, los movimientos `TRANSFER_OUT/IN` ahora guardan `sourceType:'TRANSFER'` + `sourceId` + `reference:TRF-XXXX` (antes no, por eso no eran clicables). Mensaje de **stock insuficiente legible**: "codigo - nombre" (+ disponible vs requerido al crear) en vez del id.
- **Pagina de detalle** `/inventory/transfers/[id]`: cabecera (N°, origen → destino, estado, fecha, notas), tabla de items (codigo, ref. proveedor, nombre, cantidad, total) y botones **Aprobar/Cancelar** si esta PENDING (aprobar solo ADMIN/SUPERVISOR).
- **Lista**: filas **clicables al detalle** + columna **N°**; acciones inline con `stopPropagation`.
- **Nueva transferencia** de **modal a pagina propia** `/inventory/transfers/new` (consistente con Ajustes/Reemplazos). Buscador de productos (todos, antes el modal cargaba solo 200) que **muestra las existencias del almacen origen elegido**; columna "Disponible" en los items y aviso visual si la cantidad supera el stock. Al crear redirige al detalle.
- **Movimientos clicables**: activado `TRANSFER` en `lib/movement-source.ts`.

## 🚧 Sesion 74 (2026-06-27) — Ventas perdidas / demanda insatisfecha (DESPLEGADO 2026-06-27)

> Feature nueva: el vendedor registra lo que el cliente quiso comprar y no se vendio, para analizar cuanto se dejo de facturar. Se desarrollo en rama `feat/ventas-perdidas` (checkpoint), el cliente la aprobo y se **mergeo a main** (rama eliminada). Probado E2E en local. Web/API **0 errores**. **Cambio de schema** (tabla `LostSale` + enum).

- **Schema**: enum `LostSaleReason` (SIN_STOCK, PRECIO_ALTO, DESCONTINUADO, PEDIDO_NO_RECIBIDO) + modelo `LostSale` (producto opcional/texto libre, cantidad, motivo, **precio del momento USD+Bs snapshot**, **valor estimado**, existencia al momento, cliente opcional, nota, vendedor, fecha). Migracion `20260627160000_lost_sales` con `IF NOT EXISTS` + `fix-schema.sql`.
- **Backend** modulo `lost-sales`: `POST /lost-sales` (congela precio del producto y calcula Bs con la tasa del dia, no bloquea si no hay tasa), `GET /lost-sales` (lista con filtros), `GET /lost-sales/report` (agregado por producto + por motivo + totales), `DELETE`.
- **POS (lo importante: rapido)**: boton **"Venta perdida"** (icono PackageX) junto al escaner, en layout movil Y desktop. Modal `lost-sale-modal.tsx`: producto **del catalogo** (buscar) o **texto libre** (con precio aprox opcional), cantidad (default 1), **motivo en chips** (default Sin stock), nota opcional. Caso tipico = 3 toques. **Atajo contextual**: en el buscador del POS, un producto **sin stock** ahora es clicable y abre el modal **pre-llenado** con ese producto (en vez de quedar deshabilitado).
- **Reporte** `/reports/ventas-perdidas` (seccion Reportes, ADMIN/SUPERVISOR): filtro por fecha, tarjetas de resumen (registros, unidades, $ y Bs estimados), desglose por motivo, y tabla **por producto** ordenada por $ perdido (lo que mas se dejo de vender → sirve para decidir que comprar).
- Motivos: por ahora los 4 que pidio el cliente (sin "Otro").

## 🚧 Sesion 73 (2026-06-27) — Modulo de etiquetas + escaner en consulta + permiso de inventario solo-lectura (DESPLEGADO 2026-06-27)

> Tres cosas pedidas por el cliente. Frontend + backend, probado E2E en local (login admin/warehouse, endpoints reales, PDF de etiquetas `%PDF-`, bloqueo de permisos verificado). Web typecheck **0 errores**, API **0 errores**. **Nueva dependencia `bwip-js`** en `apps/api` (el deploy.sh corre `pnpm install`). **FALTA DEPLOY + prueba E2E del cliente.**

### Modulo de Etiquetas (`/inventory/etiquetas`)
- **Etiquetas internas SIN precio** (uso interno): nombre, codigo, ref. proveedor y **codigo de barras Code128** (codifica el `code` interno para que coincida con el "CODIGO" impreso; si no tuviera, cae al `barcode`). Se descarto el QR: el escaner del POS hoy lee solo 1D y agregar QR lo haria mas lento (decision del cliente: Code128).
- **Backend** `POST /labels/pdf` (modulo nuevo `labels`, pdfkit + **bwip-js**): una etiqueta por copia, pagina = tamano exacto (57x40mm default, configurable ancho x alto en mm). Diseno con borde, nombre con auto-ajuste de letra (2 lineas), columnas **CODIGO | REF. PROVEEDOR** y el codigo de barras. Tope 2000 etiquetas/lote.
- **Frontend**: buscar/filtrar productos por **proveedor, categoria, marca** + busqueda; agregar individual o **"Agregar todos los filtrados"** (tope 1000). **Toggle "Cantidad = existencias"** (al agregar carga la cantidad = stock total; si no, 1). **"Importar de una compra"** (modal): se escribe el proveedor → lista sus compras (filtrable por N° de factura) → "Cargar" trae los articulos con la **cantidad comprada** (suma si se repite). Genera el PDF y lo abre para imprimir. Sin tocar Compras ni otros modulos.

### Escaner del POS en la consulta de articulos
- Componente reutilizable `components/barcode-scanner.tsx` con el **mismo motor hibrido del POS** (BarcodeDetector nativo + fallback ZXing, formatos 1D, doble lectura). Boton **"Escanear"** junto al buscador en `/inventory/articulos`: lee un codigo y lo pone en la busqueda.

### Permiso de inventario SOLO-LECTURA (real: menu + backend)
- Pedido: el personal de inventario (rol **WAREHOUSE**) debe ver **solo** Consultar articulos + Etiquetas; el **AUDITOR** maneja las modificaciones. Antes el permiso `inventory` era todo-o-nada (por seccion) y solo ocultaba el menu (no bloqueaba el API).
- **Nuevo permiso `inventory-consult`** (solo esas 2 paginas). Agregado a `VALID_MODULES` y al catalogo de "Permisos por rol" ("Inventario (solo consulta: articulos + etiquetas)"). Default de **WAREHOUSE** cambiado a `['dashboard','inventory-consult']` (AUDITOR sigue con `inventory`).
- **Sidebar con permiso por ITEM**: quien tenga `inventory-consult` ve solo esas 2; quien tenga `inventory` ve todo.
- **Middleware de rutas** (`middleware.ts`): `/inventory/articulos` y `/inventory/etiquetas` admiten `inventory` **o** `inventory-consult`; el resto de `/inventory/*` sigue exigiendo `inventory`. (Era la causa de un 403 al entrar a la consulta con solo `inventory-consult`.)
- **Bloqueo REAL en backend**: guarda reutilizable `ModuleGuard` + decorador `@RequireModule` (lee de "Permisos por rol", respeta la config de la UI). `RolePermissionsModule` hecho `@Global`. Aplicada a los controllers que modifican inventario (ajustes, reemplazos, transferencias, conteo) y a `POST /stock/adjust` con `@RequireModule('inventory')`. Verificado E2E: WAREHOUSE recibe **403** en todos los modify y **200** en consulta/etiquetas; ADMIN/AUDITOR pasan. (Lo de modificar productos/catalogo se dejo fuera: el AUDITOR no tiene `catalog` hoy, es decision aparte.)
- **Nota de permisos (importante)**: los permisos viajan en el token JWT; un cambio de permiso de rol aplica al **proximo login** del usuario (logout + login). El backend (guarda) usa el valor de BD al instante, asi que no hay hueco de seguridad. **Post-deploy**: en *Permisos por rol* dejar **WAREHOUSE** en "Inventario (solo consulta)" (la BD de prod no se actualiza sola).
- *Pendiente menor*: la pagina de **inicio** muestra accesos rapidos hardcodeados por rol (Stock/Movimientos/Transferencias/Conteo) que un `inventory-consult` no puede abrir (daria 403). Hacerlos respetar el permiso queda para otra pasada.

## 🚧 Sesion 72 (2026-06-27) — Pagina de consulta de articulos para inventario (solo lectura) (DESPLEGADO 2026-06-27)

> Pedido del cliente: una pantalla para el personal de inventario (rol WAREHOUSE) que puedan **ver y buscar** articulos, **solo lectura** (no modifican nada). Frontend puro — reutiliza endpoints GET existentes, sin cambios de backend. Web typecheck **0 errores**, smoke test de los 3 endpoints OK (2368 productos, tasa, kardex).

- **Pagina nueva `/inventory/articulos`** ("Consultar articulos" en sidebar INVENTARIO; WAREHOUSE ya tiene permiso `inventory`, no se tocaron permisos). Distinta de `/inventory/stock` (esa muestra costo/valor y tiene modal de ajuste; esta muestra Ref. proveedor + precio de VENTA y es 100% lectura).
- **Lista con buscador** (codigo/nombre/referencia, busqueda + paginacion del lado del servidor via `GET /products?search=&page=&limit=25&isActive=true`). Columnas: **Codigo, Ref. proveedor, Nombre, Existencias** (suma de `stock[]` de todos los almacenes), **Precio USD** (priceDetal) y **Precio Bs** (priceDetal x tasa de `GET /exchange-rate/today`).
- **Clic en fila → panel lateral (drawer)** con cabecera del articulo + **kardex** (`GET /stock-movements/kardex/:productId`): Fecha, Tipo (badge), Cantidad, Saldo corrido, Almacen, Referencia. Con paginacion del kardex. Sin links a documentos editables ni botones de edicion (solo lectura).

## 🚧 Sesion 71 (2026-06-27) — Reemplazos de inventario (canje de un articulo por otro) (DESPLEGADO 2026-06-27)

> Feature nueva pedida por el cliente: cambiar un articulo por otro en el inventario (ej. vende cable por rollo y por metro; cuando no hay metros, saca 2 rollos y mete 200 metros). Documento con pagina de detalle propia (no modal). Calcado de Ajustes de inventario. Backend typecheck **0 errores**, web **0 errores TS**. **Probado E2E en local con datos reales** (login admin local + endpoints reales: correlativo, stock, movimientos, costo derivado, recalculo de precio, PDF 200/`%PDF-`). **FALTA DEPLOY + prueba E2E del cliente.**

- **Schema**: enum `ReplacementStatus`, `MovementType` += `REPLACEMENT_IN`/`REPLACEMENT_OUT`, modelos `InventoryReplacement` (number `REP-0001`, warehouse, date date-only, notes, status) + `InventoryReplacementItem` (outProduct/outQuantity/outCostUsd, inProduct/inQuantity/inCostUsd). Migracion `20260627140000_inventory_replacements` con `IF NOT EXISTS` (+ `ALTER TYPE ... ADD VALUE IF NOT EXISTS` para los enums) y replicada en `deploy/fix-schema.sql`.
- **API** (modulo nuevo `inventory-replacements`, calcado de adjustments): CRUD cabecera + lineas (cada linea = 1 sale ↔ 1 entra), correlativo **REP-0001** con `SELECT FOR UPDATE` (parsea sufijo). **Procesar** (transaccion): valida stock suficiente del que sale, resta su stock (`REPLACEMENT_OUT`) y suma al que entra (`REPLACEMENT_IN`); ambos movimientos con `sourceType:'REPLACEMENT'`+`sourceId`+`reference:REP-XXXX` (clic en Movimientos abre el reemplazo, infra de Sesion 70).
- **COSTO DERIVADO + UTILIDAD REAL** (clave): los "metros" no se compran, no tienen costo propio. Al procesar, el **costo del que ENTRA = (cantidad que sale × costo del que sale) ÷ cantidad que entra** (ej. 2 rollos × $10 / 200 metros = $0.10/metro). Se actualiza el `costUsd` del que entra **y se recalcula su precio** de venta (costo+brega+ganancia%+IVA, mismo criterio que una compra). Si un producto entra en varias lineas, se agrega (valor total / cantidad total). Asi el valor del inventario se conserva (no se crea/destruye valor fantasma) y la utilidad del metro es real.
- **Validacion anti-robo por CANTIDADES**: se quito la idea inicial de "valor total/diferencia" (siempre daria diferencia porque el que entra no tiene costo previo → falso positivo). Administracion valida con las **cantidades** (lado que sale vs lado que entra). El reporte muestra el **costo asignado** al que entra (informativo para contabilidad), sin columna de diferencia.
- **Reporte PDF** (`GET /inventory-replacements/:id/pdf`): 2 columnas **SALIDA** (codigo, nombre, cantidad) | **ENTRADA** (codigo, nombre, cantidad, costo asignado), con linea de Responsable/Firma. Paginacion automatica.
- **Frontend**: sidebar INVENTARIO → **Reemplazos**. Paginas `/inventory/replacements` (lista), `/new` (cabecera: almacen, fecha, observacion) y `/[id]` (detalle). En el detalle, seccion "Agregar linea de canje" en **vertical** (Salida con cantidad arriba, Entrada con cantidad abajo, boton debajo) con doble buscador de producto; tabla de lineas con columna **Costo asign.** (en vivo en borrador, congelado al procesar); botones Procesar/Cancelar/Eliminar e **Imprimir reporte**. Textos "Salida"/"Entrada" (no "Sale"/"Entra"). **Fix z-index**: el dropdown del buscador quedaba detras de la tabla porque `.card` usa `backdrop-blur` (crea stacking context); se resolvio con `relative z-30` en la tarjeta de agregar linea.
- **Badges** `Reemplazo +/−` (y se completaron `Devolucion +/−`) en `/inventory/movements` y en la pestaña Movimientos del producto.
- **Notas de prueba (solo LOCAL)**: se reseteo el password del `admin@trinity.com` **LOCAL** a `Test1234!` para el smoke test (prod intacto). Quedaron reemplazos de prueba REP-0001..0003 con movimientos en la BD local; un producto de prueba (CON00957) se modifico y luego se **restauro** a su costo/precio original.

## 🚧 Sesion 70 (2026-06-27) — Movimientos con link al documento origen + Reporte PDF de ajuste (DESPLEGADO 2026-06-27)

> Dos pedidos del cliente. Backend typecheck limpio (API 0 errores, Web 0 errores TS). Migracion `20260627120000_stock_movement_source` aplicada en LOCAL; render del PDF de ajuste probado con datos reales (ajuste real procesado: 2 items, total importe $11.84, `%PDF-` OK). **FALTA DEPLOY + prueba E2E del cliente.**

### Trazabilidad: clic en un movimiento de inventario abre su documento origen
- Pedido: en la pestaña **Movimientos** del detalle de producto (`/catalog/products/[code]`) y en `/inventory/movements`, poder **hacer clic** en un movimiento y abrir el documento que lo genero (factura de venta/compra, ajuste, conteo, nota de credito), para auditar.
- **Schema**: 2 campos nuevos en `StockMovement` → `sourceType` (`SALE_INVOICE | PURCHASE_ORDER | INVENTORY_ADJUSTMENT | INVENTORY_COUNT | CREDIT_DEBIT_NOTE | TRANSFER | REPLACEMENT`) y `sourceId` (ID real del documento). Migracion con `IF NOT EXISTS` + agregado a `deploy/fix-schema.sql`.
- **API**: se setean `sourceType`/`sourceId` al crear el movimiento en: ventas (`invoices.service`), compras (`purchase-orders.service`), ajustes (`inventory-adjustments.service`), conteo fisico (`inventory-counts.service`, ademas se le agrego `reference` `CNT-xxxxxxxx`) y notas de credito venta/compra (`credit-debit-notes.service`). Los endpoints ya devuelven los campos (usan `include`).
- **Decision: SOLO movimientos nuevos** (forward-only). Los viejos no traen origen → no son clicables (muestran "—"). Sin backfill por ahora. La **carga inicial Wensoft**, los ajustes manuales y las **transferencias** quedan sin link (transferencias: pendiente hasta hacer su pagina de detalle). **Reemplazos de inventario** (a futuro) ya quedan contemplados: basta setear `sourceType: 'REPLACEMENT'` + `sourceId`.
- **Frontend**: helper unico `lib/movement-source.ts` mapea `sourceType` → ruta + etiqueta. En ambas vistas: **fila clicable** (cursor + hover, solo si hay origen) **+ boton "Ver ..."** con icono. Se quito la logica rota previa de prefijos `FAC-`/`PO-` (nunca existieron en los datos). En `/inventory/movements` se agrego columna **Origen**.

### Reporte PDF del ajuste de inventario (`/inventory/adjustments/[id]`)
- Pedido: un reporte como el de diferencias de conteo, con **Codigo, Ref. Proveedor, Producto, Cantidad, Costo, Importe** y **TOTAL** al final.
- **Backend**: `inventory-adjustments-pdf.service.ts` (carta vertical, paginacion, encabezado con almacen/fecha/tipo/estado/proveedor-cliente/descripcion). Importe = `cantidad × costo` (costo actual del producto); Total = suma de importes + total de unidades. Endpoint `GET /inventory-adjustments/:id/pdf` (JWT), servicio registrado en el modulo.
- **Frontend**: boton **"Imprimir reporte"** 🖨️ en el header del detalle (si el ajuste tiene productos), abre `/api/proxy/inventory-adjustments/:id/pdf` en pestaña nueva (mismo patron que conteo).

## 🚧 Sesion 69 (2026-06-26) — Alertas de Inventario + boton "¿Como se calcula?" (DESPLEGADO 2026-06-27)

> Feature nueva pedida por el cliente, en rama `feat/alertas-inventario` (no en `main` aun). Backend **probado en local con datos reales** (login admin local + curl al endpoint: 2367 productos, conteos correctos; PDF 200/`%PDF-`). **Build de produccion API+Web limpio (exit 0).** **FALTA: merge a `main` + DEPLOY + prueba E2E del cliente.** Spec: `docs/superpowers/specs/2026-06-26-alertas-inventario-design.md`; Plan: `docs/superpowers/plans/2026-06-26-alertas-inventario.md`.

- **Pantalla nueva `/inventory/alerts`** (entrada en sidebar, seccion INVENTARIO): 4 reportes seleccionables/filtrables — **Agotados** (stock ≤ 0), **Bajo minimo** (0 < stock ≤ min), **Sin rotacion** y **Exceso** (vende pero >180 dias de inventario) — mas "Todos". Buscador por codigo/nombre, selector de periodo (afecta solo Exceso) y export a **Excel** (client-side `xlsx`) y **PDF** (server-side `pdfkit`).
- **Stock muerto rehecho por antiguedad de ULTIMA COMPRA** (antes era binario `0 ventas && stock>0`, injusto con productos recien comprados). Nuevo: la antiguedad cuenta desde el ultimo `StockMovement` tipo `PURCHASE` (o `createdAt` si nunca se compro). 3 niveles: **<10 dias** ⚪ Recien ingresado · **10-28** 🟠 Nuevo sin rotacion · **>28** 🔴 Stock muerto. "Ha vendido desde la entrada" se mide con el ultimo `StockMovement` tipo `SALE`. Una compra reciente reinicia el reloj (opcion "simple" elegida por el cliente). Umbrales **fijos en codigo** (`DIAS_RECIEN_INGRESADO`/`DIAS_STOCK_MUERTO`/`DIAS_EXCESO` en `inventory-analysis.service.ts`).
- **Backend** (`inventory-analysis` extendido): metodo `getInventoryAlerts` + ruta `GET /inventory-analysis/alerts` + `GET /inventory-analysis/alerts/pdf` + `inventory-alerts-pdf.service.ts`. Una sola consulta devuelve toda la lista; el front filtra por reporte. Fechas con helpers Caracas.
- **Boton "¿Como se calcula?"** (modal reusable `components/metrics-help-modal.tsx`) en **Alertas** y en **Analisis** (`/purchases/analysis`). Glosario con formula + explicacion simple de cada metrica (ABC, rotacion, dias inventario, rentabilidad, margen, valor inventario, sugerencia compra, y las alertas). Fuente unica de verdad en `lib/metrics-help.ts` — al cambiar un umbral en codigo, actualizar tambien ese texto.
- **Nota datos**: en la copia LOCAL casi todo cae al fallback `createdAt` (solo 99 movimientos `PURCHASE` vs 1424 `ADJUSTMENT_IN` de la importacion), asi que el "stock muerto" local sale subestimado; en prod los `createdAt` reales son mas viejos y la clasificacion sera correcta. El cliente confirmo que el dato de importacion no importa (la feature es para compras futuras). Tambien: se reseteo el password del `admin@trinity.com` **LOCAL** a `Test1234!` para el smoke test (prod intacto).

### Mejoras al PDF de Alertas (mismo dia)
- **Altura de fila dinamica** (`inventory-alerts-pdf.service.ts`): los nombres/proveedores largos hacian 2 lineas y se encimaban con la fila siguiente (altura fija 14px). Ahora cada fila mide su celda mas alta con `heightOfString` y avanza esa altura.
- **Carta vertical** (antes A4 horizontal): `size: 'LETTER', layout: 'portrait'`. Se **quito la columna Proveedor** y en la columna de codigo se muestra el codigo del articulo + `Ref: <supplierRef>` (campo "Ref. Proveedor"). Se agrego `supplierRef` al `getInventoryAlerts`.
- **Paginacion** "Pagina X de Y" al pie de cada pagina (`bufferPages: true` + `bufferedPageRange`, con `margins.bottom=0` temporal para no agregar paginas de mas).

### Ajuste de precios por SELECCION de articulos (`/catalog/price-adjustment`)
- **Antes** el "Aplicar" mandaba los filtros y el backend reajustaba **TODOS** los que coincidian. **Ahora** se eligen articulos puntuales con **checkbox** (default **desmarcados**) y solo esos se modifican. Pedido del cliente: "no siempre son todos los de una categoria o marca".
- **Backend** (`apply-price-adjustment.dto.ts` + `products.service.applyPriceAdjustment`): nuevo `productIds: string[]` opcional; si viene, `where = { id: { in: productIds }, isActive: true }` (si no, cae al filtro, compatible). Tope de carga del preview subido 500 -> 5000 (`findForPriceAdjustment`). Verificado: enviar 2 IDs afecta exactamente 2.
- **Frontend** rediseñado: filtros en **barra horizontal arriba**, barra de ajuste con contador "N seleccionados", y **tabla a ancho completo y alta** (scroll + header fijo) que muestra **todos** los filtrados (sin paginacion — el cliente pidio verlos todos, no por pagina). Clic en fila o checkbox marca; "seleccionar todos" en el header; el preview de precios nuevos solo se muestra en filas marcadas.
- **Columna + filtro de Brecha**: la tabla muestra **Brecha Si/No** por articulo y hay un filtro **Todas/Con brecha/Sin brecha** (`bregaApplies` en query DTO + `buildPriceAdjustmentWhere`). **Bug arreglado**: el booleano se corrompia con `enableImplicitConversion` (`Boolean('false')===true`); se dejo el param como **string** interpretado en el `where`. Verificado: con brecha 438, sin brecha 93.
- **Columnas de la lista**: se quitaron **P. Mayor** y **Gan. Mayor%**, y se agrego **P. sin IVA** (costo+brecha+ganancia sin el multiplicador de IVA) antes de **P. Detal**. El input de ganancia mayor sigue disponible para aplicar; solo se saco de las columnas.

### Dashboard del vendedor: SOLO porcentajes + meta mensual (`/dashboard/seller`)
- Pedido del cliente: **los vendedores no deben ver montos en $**, todo en **%**; cada uno **pone su meta mensual** y el % se calcula sobre ella (entero, sin decimales).
- **Seguridad real (backend)**: `getVendedor` ya **NO devuelve montos** (ni `totalUsd`, neto, ticket, pendientes ni CxC); solo %. Verificado con un vendedor real: cero fugas de $ en la respuesta. Asi no se ven ni mirando la red.
- **Meta mensual**: campo nuevo `monthlyGoalUsd` en `Seller` (migracion `20260626210000_seller_monthly_goal` con `IF NOT EXISTS` + agregado a `deploy/fix-schema.sql`). El vendedor la pone/edita desde el dashboard (ruta `PATCH /dashboard/vendedor/meta`, DTO `set-seller-goal.dto.ts`).
- **Prorrateo por dias** (param `period`): Hoy = meta/30, Semana = meta×7/30, Mes = meta completa. `goalPct = ventas/periodGoal`.
- **Frontend**: hero con **% de meta** + barra de progreso + vs periodo anterior + editor de meta; Devoluciones como **% de ventas**; Top productos como **% de participacion**; grafico en **% de meta**; Facturas como conteo. Ocultados: ticket, pendientes, CxC, neto.

### Correcciones puntuales en PRODUCCION (por SSH, este dia)
- **Factura NE-26-00000505**: vendedor LENNYS MEJIA → **VIRGINIA CRESPO** (el usuario se equivoco de vendedor).
- **8 facturas montadas la mañana del 26/06 que eran ventas del 25/06**: `createdAt`/`paidAt` movidos al 25/06 21:00 Caracas (tasa identica entre ambos dias, no fiscales, caja abierta → sin efectos colaterales). Numeros: VTA-214..217, NE-525..528.
- **Factura NE-26-00000539**: vendedor YULEINI RODRIGUEZ → **Roxana Marrero**.

## 🚧 Sesion 68 (2026-06-25) — CxP/Libro de Compras/Retenciones: fixes + UTC + totales + modales en /purchases/new (DESPLEGADO 2026-06-27)

> Continuacion de Tanda A (Sesion 66). Todo **probado en local con datos reales** (consultas SQL a la BD local), typecheck API+Web limpio (exit 0). **FALTA DEPLOY + prueba E2E del cliente.** Va junto con Tanda A en `main`. Nota: hubo un **backfill SOLO en la BD local** (numero de comprobante de retencion); prod NO lo necesita (ver punto de retencion abajo).

- **Retencion sigue la fecha de declaracion de la factura** (`purchase-book.service.update`): al editar la fecha de una factura en el Libro de Compras, ahora arrastra en la misma transaccion el `entryDate`/`documentDate` a su(s) linea(s) de retencion del libro y el `issueDate` del/los comprobante(s) (IVA e ISLR), emparejando por `payableId`/`purchaseOrderId`. Antes la factura y la retencion quedaban en meses distintos. El **numero** del comprobante (prefijo YYYYMM) se mantiene.
- **Fix crash en pantalla de Retenciones con CxP manual** (`purchases/retentions/page.tsx` + `[id]`): la pagina asumia que toda linea venia de una orden de compra (`line.purchaseOrder.id`), pero las retenciones de **CxP manual** se enlazan a un `payable` y no tienen `purchaseOrder` → `TypeError: Cannot read properties of null`. Se tipo `purchaseOrder` como nullable y se hace fallback al **N° de factura del proveedor** (texto) cuando no hay orden. (El PDF ya usaba `?.`.)
- **Correlativo de retencion editable desde Configuracion** (`update-company-config.dto.ts` + `config/page.tsx`): nuevos campos **Proximo correlativo IVA** (`retentionNextNumber`) e **ISLR** (`islrRetentionNextNumber`) con **vista previa en vivo** del numero (`YYYYMM` + consecutivo 8 digitos). Permite continuar la numeracion del sistema anterior al ir a usar Trinity oficialmente. El consecutivo es **corrido** (no se reinicia por mes). Antes no habia UI; solo se podia por BD.
- **Borrar una CxP elimina su retencion + devuelve el correlativo + avisa** (`payables.service.remove` + `payables/[id]/page.tsx`): antes al borrar la CxP, su `RetentionVoucher` quedaba **huerfano** (Prisma solo ponia `payableId=null` en la linea por SetNull). Ahora se borra el comprobante en cascada y, si era el **ultimo emitido** (consecutivo == `retentionNextNumber - 1`), se **devuelve el correlativo** (no se quema el numero). El boton Eliminar **avisa** nombrando la retencion antes de pedir la clave.
- **Fechas date-only sin corrimiento UTC (display)**: las fechas fiscales/date-only se guardan a **medianoche UTC** pero se mostraban en hora Caracas → **un dia atras** (23/05 se veia 22/05). Corregido en: Libro de Compras (lista/PDF/Excel) via helper `fmtFiscalDate`; Libro de Ventas (lista/Excel) con `{ timeZone: 'UTC' }`; CxP detalle+lista y CxC detalle+lista (helper `fmtDateOnly` con `getUTC*`, dejando `createdAt` en local). **No** se toco la logica de "vencido" (comparaciones) ni los formularios (parsean por partes). *Pendiente opcional reportado: historial de tasa en Config y lista de Gastos tienen el mismo patron.*
- **Libro de Compras — orden cronologico** (`purchase-book.service.findAll`): ordenaba por `entryDate` (declaracion) sin desempate, pero la columna que se MUESTRA es `documentDate`; con varias en el mismo periodo la fecha salia saltada. Ahora ordena por `documentDate ?? entryDate` + `createdAt` (desempate estable). Afecta lista, PDF y Excel (todos consumen ese orden).
- **Libro de Compras — totales en BRUTO + retencion aparte** (`purchase-book.service.findAll` + render lista/PDF/Excel): los totales **neteaban** el IVA y el total con las lineas de retencion (que guardan IVA negativo), y "Retenciones" salia 0 (`retentionAmountBs` nunca se llenaba). Ahora exento/base/credito-fiscal/total suman **solo facturas** (bruto), y la retencion se acumula aparte (de `retentionAmountBs` o, si es 0, del `-ivaAmountBs` de la linea). Las filas de retencion muestran su monto en la **columna Retencion** y quedan en blanco en Total, asi **sumar a mano cuadra con los totales**. (Ej. real junio: Credito Fiscal 227.132 neto → **908.531 bruto**; Retenciones 0 → **681.398**; Total 6.255.805 → **6.937.203**.)
- **Comprobante de retencion en el libro** (`payables.service` create): la CxP manual guardaba el `retentionVoucherId` pero **no** el `retentionVoucherNumber`, asi que la columna "Comp. de Retencion" salia vacia. Ahora se guarda el numero al crear. El flujo de comprobantes de factura de compra ya lo guardaba. **Backfill aplicado en LOCAL** para los 10 registros viejos; prod no lo necesita (sus retenciones vienen del flujo de comprobantes).
- **Serie fiscal obligatoria en CxP** (`payables/new/page.tsx`): el boton **Guardar CxP** queda deshabilitado si no hay serie fiscal; validacion con mensaje claro; el select muestra "Seleccione una serie..." y etiqueta con `*`. (Solo frontend; el backend aun la acepta opcional — se puede reforzar si se pide.)
- **Botones agregar/editar Proveedor y Articulos en `/purchases/new`** (2 componentes nuevos `components/supplier-form-modal.tsx` y `product-form-modal.tsx`): modales en la misma pagina (no se pierde la compra en progreso). Proveedor: **＋ Nuevo** y **✎ Editar** (del seleccionado) junto al selector → al guardar refresca lista y autoselecciona. Articulos: **＋ Nuevo articulo** (form de producto COMPLETO; al guardar lo agrega como renglon con costo/IVA) y **✎ por renglon** (edita ese producto y refresca su costo/IVA). Reutilizan los endpoints existentes (POST/PATCH suppliers/products); sin cambios de backend.

### Tanda 2 (mismo dia) — tasa por fecha en CxP/CxC, fix UTC restante, y PERMISO configurable para la tasa
- **Tasa por fecha de origen en CxP y CxC** (`payables/new`, `receivables/new`): al cambiar "Fecha original" ahora busca la tasa de ESE dia (`/exchange-rate/by-date`) y la precarga (editable), igual que la factura de compra. Antes ponia solo la de hoy.
- **Fix UTC restante (display)**: historial de tasa en Configuracion (`config:484`, `ExchangeRate.date` es `@db.Date`) y lista de Gastos (`expenses:457`, `Expense.date` confirmado a medianoche UTC) ya no muestran la fecha un dia atras (`{ timeZone: 'UTC' }`).
- **Actualizar la tasa: de solo-ADMIN hardcodeado → PERMISO configurable** `MANAGE_EXCHANGE_RATE`. **Causa del bloqueo de los probadores**: el banner "No hay tasa BCV" se muestra a todos y el boton "Obtener del BCV" funciona, pero `exchange-rate.service.create` tenia `if (user.role !== ADMIN) throw Forbidden` y el banner se **comia el error** (catch vacio) → "no me deja guardar" sin mensaje. Ahora: (1) ADMIN siempre puede, los demas roles si tienen el permiso `MANAGE_EXCHANGE_RATE` (via `RolePermissionsService.getModulesForRole`, `ExchangeRateModule` importa `RolePermissionsModule`); (2) agregado a `VALID_MODULES` (backend) y al catalogo de "Permisos por rol" (frontend, grupo Administracion, label "Actualizar tasa de cambio"); (3) el banner `exchange-rate-banner.tsx` ahora **muestra el error** si el guardado falla. **PASO POST-DEPLOY**: en *Permisos por rol* activar "Actualizar tasa de cambio" para **Cajero** (y los roles que se quiera) para que puedan registrar la tasa desde el banner sin el admin.

## 🚧 Sesion 67 (2026-06-25) — POS: precios en Bs en movil + eliminar articulo en la franja (DESPLEGADO 2026-06-27)

> Dos observaciones de los **vendedores probando el sistema** en el cliente. Solo frontend (`sales/pos/page.tsx`), typecheck Web limpio (exit 0). **FALTA DEPLOY** (al deployar tambien sube lo de Tanda A de la Sesion 66, que sigue sin probarse E2E — son del mismo `main`).

- **Precios en Bs en la vista movil/tablet (la que usan los vendedores)**: antes los precios salian **solo en USD** en movil; en escritorio ya mostraba Bs debajo del $. Se replico ese patron (Bs en gris, pequeno, debajo del verde) en: tarjeta de producto del buscador, renglones de "Mi carrito", la franja de agregados, el total del renglon, subtotales y botones de total ("Ir a cobrar"/"Cobrar"). Se agrego helper `fmtBs` (formato venezolano `1.234,56` via `toLocaleString('es-VE')`) y se unifico el formato Bs en escritorio (antes `.toFixed(2)`). Todo usa la `tasa` que el POS ya tenia cargada; si `exchangeRate` es 0, no se muestra Bs.
- **Boton de eliminar en la franja de abajo del movil ("En esta factura")**: no tenia forma de quitar un articulo si el vendedor se equivocaba. Se reestructuro cada renglon a **2 lineas** (elegido por Diego sobre 1-linea-apretada y swipe): arriba el nombre + **papelera roja** (`removeItem`), abajo los controles de cantidad + total ($ y Bs). Mas alto pero legible y cabe todo. El carrito completo ("Mi carrito") ya tenia papelera; ahora la franja rapida tambien.

## 🚧 Sesion 66 (2026-06-24) — CxC/CxP fechas+tasa, Libro de Compras fecha doc vs declaracion (Tanda A). **Tanda B (montos fiscales al procesar) REVERTIDA por pedido del cliente (2026-06-25).**

> **ACTUALIZACION 2026-06-25**: el cliente indico que la pantalla de "Montos fiscales del documento" al procesar la factura **no le sirve** ("no podia ser asi por varios problemas, mejor dejarlo como trabajan ya"). Se **revirtio la Tanda B** (`3cb4a97`) con `git revert` (commit `d84195e`): los 3 archivos afectados volvieron **byte-identicos a `c89da2e`**. **Tanda A se queda.** No hubo cambio de schema (las columnas fiscales de `Payable` ya existian; la columna `documentDate` del libro es de Tanda A y se conserva). Sin referencias colgantes en el codigo fuente.

> Tanda A (`c89da2e`) sigue en `main`, pusheada y typechequeada, pero **NO se ha deployado ni probado E2E**. Quedo pendiente porque Docker Desktop local se cayo (se llevo el Postgres `trinity-postgres-1`) al intentar levantar el sistema para probar. **Al volver: levantar local y correr el checklist de prueba (solo lo de Tanda A), luego deployar.**

### Commits de esta sesion (en `main`)
- `7cb9d79` — fix: cuadro de totales SENIAT no se parte entre paginas (PDFs de libro de ventas detallado + reporte Z, y libro de compras) — `page-break-inside: avoid`. Solo CSS.
- `c89da2e` — **Tanda A**: CxC/CxP vencimiento desde Fecha original + Tasa del dia editable; Libro de Compras nuevo campo `documentDate` (fecha que se MUESTRA) vs `entryDate` (periodo/declaracion). Incluye **migracion Prisma** `20260624120000_purchasebook_document_date` + `deploy/fix-schema.sql`.
- ~~`3cb4a97` — **Tanda B**: pantalla de "Montos fiscales del documento" al procesar factura de compra~~ → **REVERTIDA** (`d84195e`, 2026-06-25) por pedido del cliente. No deployar.
- Plan completo: `docs/superpowers/plans/2026-06-24-cxp-libro-compras-montos-fiscales-exactos.md`.

### Operaciones en PRODUCCION ya aplicadas hoy (cerradas, solo registro)
- Reasignacion de vendedor por error de carga: facturas **NE-26-00000487** y **NE-26-00000488** de LENNYS MEJIA → **YULEINI RODRIGUEZ** (VEN-005); factura **NE-26-00000449** de YULEINI → **Roxana Marrero** (VEN-006). Solo `sellerId`+`updatedAt`.

### PENDIENTE al volver (en orden)
1. **Levantar local**: arrancar Docker Desktop → `docker start trinity-postgres-1` (la columna `documentDate` ya se aplico a la BD local, persiste en el volumen) → `pnpm -C apps/api dev` (puerto 4000) → `pnpm -C apps/web dev` (puerto 3000). Web `http://localhost:3000`, `admin@trinity.com` / `Test1234!`. NOTA: el Postgres local usa el **puerto 5432**; el proyecto "romana" usa el 5433 (no chocan).
2. **Correr el checklist de prueba E2E** (ver abajo).
3. **Deployar** (lleva migracion, el deploy normal la corre): `ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"`.
4. Opcional futuro: montos fiscales exactos tambien en compras de **contado** (hoy contado fiscal sigue usando montos de lineas, a proposito).

### Checklist de prueba E2E (solo Tanda A — Tanda B revertida)
- **CxC/CxP manual**: vencimiento se mueve con Fecha **original** (no recepcion); Tasa editable (precargada, recalcula totales, no deja guardar en 0).
- **CxP fiscal con original 28/05 + recepcion 02/06**: aparece en Libro de Compras de **junio** mostrando **28/05**; NO en mayo; linea de retencion en junio junto a su factura.
- **Libro de Compras**: modal con 2 fechas (documento=se muestra / declaracion=periodo); PDF y Excel muestran fecha documento; entradas viejas sin cambios.
- **Regresion (procesar factura de compra)**: el modal **NO** debe mostrar ninguna seccion de "Montos fiscales del documento" (volvio al flujo previo); CxP y libro salen de las lineas como siempre.

## ✅ Sesion 65 (2026-06-23) — Fix timezone UTC→Caracas en TODA la API (DEPLOYADO 2026-06-23, commit 82f3ea0)

> Detectado por Diego: el dashboard mezclaba las ventas de hoy con las de ayer cuando las de ayer se cargaron despues de las 8 PM. **Causa raiz**: el server corre en UTC y el negocio es en Caracas (UTC-4, sin DST). Calcular "hoy"/rangos con `new Date()` + `setUTCHours(0/23)` hace que todo lo posterior a las 8 PM Caracas (= medianoche UTC) caiga en el dia UTC siguiente. Mismo patron del fix de "facturas en espera" de la Sesion 64, pero ahora resuelto a nivel de toda la API.

- **Helper compartido nuevo** `apps/api/src/common/timezone.ts`: `caracasToday()`, `caracasDayStart()/caracasDayEnd()` (rangos sobre campos TIMESTAMP), `caracasDateKey()` (lookups de `ExchangeRate.date` y comparaciones "hoy" contra campos date-only), `caracasParts()` (agrupar timelines por hora/dia). Venezuela no tiene horario de verano, offset fijo `-04:00`.
- **Dashboard** (`dashboard.service.ts`): rango gerencial/vendedor anclado al dia-calendario Caracas; gráficos por hora/dia en hora Caracas (antes corridos 4h); periodo-anterior recalculado sin `setUTCHours` (se rompia al cambiar from/to a instantes Caracas); lookup de tasa en `getHome` y rango "due this week" anclados.
- **~30 servicios del API** corregidos en 3 categorias: (1) **lookups de "tasa de hoy"** → `caracasDateKey()` — esto arregla un **segundo bug serio**: de noche fallaban con *"No hay tasa de cambio registrada para hoy"* al crear facturas/recibos/gastos/movimientos de caja/anticipos/cotizaciones/CxC/CxP, porque buscaban la tasa del dia UTC siguiente; (2) **rangos sobre TIMESTAMP** (`createdAt`/`paidAt`/`openedAt`): invoices, quotations, receipts, payables, receivables, sellers (comisiones por `paidAt`), retenciones (IVA/ISLR/vouchers), stock-movements, dynamic-keys, cash-registers (`openedAt`), credit-debit-notes, customer-iva-retentions, reports (`parseDateRange`), inventory-analysis, invoice-pdf, print-jobs; (3) **comparaciones de vencidos** (`markOverdue` de payables/receivables, `cancelOldPendingInvoices`) ancladas a Caracas. La creacion/upsert de tasa (`exchange-rate.service.create`) ahora guarda con la fecha Caracas.
- **NO se toco (a proposito)**: rangos sobre campos **date-only** guardados a medianoche UTC (libros fiscales `date` en fiscal/sales-book/purchase-book, `invoiceDate`, `dueDate` en rangos, `reportDate`, `voucherDate`) — son timezone-independientes y anclarlos romperia los reportes contables. Hallazgo util: `CreditDebitNote.documentDate` es `DateTime` (timestamp), no date-only, asi que SI va con rango Caracas (valida el cambio del dashboard `getReturns`). El unico `@db.Date` real del schema es `ExchangeRate.date`.
- **Regla anti-recurrencia**: se reescribio la seccion "Fechas y timezone" de `CLAUDE.md` (antes decia, erroneamente, "siempre usar setUTCHours") para que prohiba ese patron y obligue a usar el helper.
- Typecheck API limpio (`tsc --noEmit` exit 0). **DEPLOYADO a produccion el 2026-06-23.** (El frontend del dashboard ya estaba bien: usa la fecha local del navegador = Caracas.) **Verificar post-deploy de noche (>8 PM Caracas)**: que el dashboard NO mezcle ventas de hoy con ayer y que ya no salga "No hay tasa de cambio registrada para hoy" al facturar/cobrar.

## 📌 PENDIENTE PARA MAÑANA (Sesion 62 — 2026-06-19)
- **Operaciones en PRODUCCION ya aplicadas hoy (cerradas, solo registro)**: (a) **Reasignacion de vendedor**: las 10 facturas en estado PENDING que tenian a **LENNYS MEJIA** (`VEN-001`) se cambiaron a **YULEINI RODRIGUEZ** (`VEN-005`) — solo `sellerId`+`updatedAt`, las PAID no se tocaron. (b) **Fix factura NE-26-00000410**: el item `PIN01291` (ESMALTE 1/4GL) estaba en cantidad 1 y debia ser 2; se corrigio item (qty/iva/totales), totales de factura ($20.28->$33.55), se desconto 1 unidad mas de inventario (stock 22->21 + movimiento -1->-2), y el faltante ($13.27) se cargo al pago **Cashea** con su **CxC** ajustada (6.86->20.13). Todo cuadra: items=total, pagos=total, CxC=pago. Respaldo de filas en el server: `/opt/Trinity/fix-NE410-20260620-020507.txt`.
- **Cotejo de precios Wensoft vs sistema — DECISION PENDIENTE**: se cruzo el Excel `lista-pre.xlsx` (2.375 productos, columnas Referencia/Articulo/Existencias/Precio $ en USD) contra produccion por `code`. Resultado: **el STOCK esta sano** (solo 8 diferencias >=1, casi todas items de servicio tipo FLETE/RECUPERACION con stock negativo a proposito). **El problema son los PRECIOS: 424 productos (~18%) tienen el `priceDetal` desfasado** respecto a Wensoft, en ambas direcciones (no es una tasa ni un % sistematico, son cambios de precio reales no reflejados). Reportes CSV generados en la raiz del repo (no commiteados): `reporte-precios.csv` (424, ordenado por diferencia), `reporte-stock.csv` (8), `reporte-no-en-sistema.csv` (13 codigos del Excel que no existen en el sistema, incluye un codigo literal "0" invalido), `reporte-no-en-excel-activos.csv` (6 activos sin contraparte). **Duplicados en el Excel**: `PIN01316`, `PLO02402` (confirmar con encargado cual registro es el bueno, segun checklist de importacion). Casos raros a revisar a mano antes de tocar: `ELE12888` ENCHUFE METALICO (Excel $1.76 vs sistema $25.33 — huele a error de carga). **Opciones para retomar**: (1) desglosar los 424 por direccion (sistema mas barato = pierde margen / mas caro = espanta ventas); (2) actualizar precios en lote en prod desde el Excel con respaldo previo (total o por umbral); (3) revisar primero los casos raros. Script de cruce: se uso `node` con `xlsx@0.18.5` (cargado por ruta directa desde `.pnpm`), parseando `lista-pre.xlsx` y un dump psql de `code|priceDetal|SUM(stock)|isActive`.

## 🧪 Sesion 64 (2026-06-22) — pruebas en cliente: fixes de categorias + comandas (agente ya aplicado, web/api PENDIENTE DEPLOY)

> Probando facturacion/agente en el cliente antes de produccion. El **agente v1.1.3 ya se copio y probo en la PC de despacho** (imprime perfecto con el formato nuevo). Lo de **web + api (categorias + HTML de respaldo) FALTA DEPLOYAR** al server.

- **Codigo de categoria de longitud variable (2 a 6 letras)**: estaba forzado a **exactamente 3** y el cliente tiene categorias de 3, 4 y 5 caracteres (no podia crear las de 4/5). Se relajo a **2–6 letras** en: DTO backend (`categories/dto/create-category.dto.ts`, `@MinLength(2)/@MaxLength(6)/^[A-Za-z]{2,6}$`), y frontend (`catalog/categories/page.tsx` las 2 validaciones + los 2 inputs `maxLength`/`slice(0,6)`/ancho; `catalog/categories/[id]/page.tsx` input + label "2 a 6 letras"). La generacion de codigo de producto (`{COD}{00001}`) y `syncCorrelatives` ya eran agnosticas a la longitud. **Cuidado**: no crear prefijos que sean inicio de otro (ej. `EL` y `ELE`) porque el correlativo usa `LIKE 'EL%'` y se solaparian. **Necesita deploy web+api.**
- **Comandas: el agente NO imprimia solo (CAUSA RAIZ encontrada)**. Sintoma: salia el diálogo de `window.print()` del navegador y/o un archivo llamado `POS-80C` con el markup `{{...}}` crudo adentro. Diagnostico por capas: (1) **PNA** — Chrome bloqueaba el `fetch` de la pagina HTTPS (`eltrebol.app`) al agente en `http://localhost:8765` por *Private Network Access*; se agrego el header `Access-Control-Allow-Private-Network: true` en `apps/agent/src/server.ts`. (2) **CAUSA REAL del no-imprime** — `sendRawToPrinter` (`apps/agent/src/raw-print.ts`) pasaba TODO el C# de winspool por `powershell.exe -EncodedCommand <base64>`; ese comando superaba el **limite de longitud de linea de cmd.exe (~8191 chars)** → error "La linea de comandos es demasiado larga" → el RAW ESC/POS fallaba **siempre** y caia al fallback de texto plano (que manda el markup literal). **Fix**: escribir el script a un `.ps1` temporal y ejecutarlo con `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "<ps1>"` (linea corta) — confirmado el nombre `POS-80C` (USB002) coincide exacto con `config.json`. Agente subido a **v1.1.3** (health + banner) y reempaquetado (`apps/agent/trinity-agent.exe`). **Probado en cliente: imprime solo, en ESC/POS, negrita/grande/codigos apilados + corte.** El agente ya esta puesto en la PC de despacho; el exe queda commiteado para repartir.
- **Fixes detectados probando en local (Sesion 64)**: (1) **Facturas en espera vacias de noche (BUG de timezone)**: `findPending(todayOnly)` en `invoices.service.ts` armaba el rango "de hoy" con la fecha LOCAL del servidor pero en UTC (`Date.UTC(now.getFullYear()...)`), asi que una factura aparcada de noche en Caracas (que en UTC ya es del dia siguiente) se caia del filtro y "no salia nada". Ahora calcula "hoy" en **America/Caracas** (`Intl.DateTimeFormat('en-CA', {timeZone})` + offset `-04:00`). (2) **Aviso de cliente por defecto no detectaba al RETOMAR (BUG)**: el "cliente por defecto" se define por `config.defaultCustomerId` (= "*** Cliente Final ***"), pero el frontend lo detectaba por el flag `Customer.isDefault` que en ese cliente esta en **false** (ningun cliente lo tiene en true). Al retomar una factura ya aparcada venia `customerId` = Cliente Final con `isDefault=false` -> no avisaba. Fix: el POS ahora compara `customerId === companyConfig.defaultCustomerId` (se agrego `defaultCustomerId` a la config que ya cargaba de `/config`). El aviso ahora dispara en venta nueva Y al retomar. (3) **En PC el "Si, asignar cliente" no llevaba al buscador**: el input del carrito aparecia pero no se enfocaba; se agrego `customerSearchInputRef` y `goAssignCustomer` lo enfoca tras el re-render (en movil/tablet el modal full-screen ya hacia autoFocus). Typecheck API+Web limpio. **Necesita deploy API+Web.** (Nota pendiente opcional: marcar `isDefault=true` en el Cliente Final alinearia el flag con `config.defaultCustomerId` y ademas ocultaria el toggle "Contribuyente?" en ese cliente.)
- **Aviso de cliente por defecto al aparcar (POS, no bloqueante)**: al hacer clic en **Guardar/Aparcar** (`handleSaveInvoice`), si la factura quedaria con el **cliente por defecto** sale un modal informativo "Cliente no asignado — ¿Deseas asignarle un cliente?". Disparo: `!customerId || customerIsDefault` (cubre los dos casos que terminan en el cliente por defecto: sin cliente elegido → el backend asigna `config.defaultCustomerId` en `invoices.service.ts`, o el cliente marcado `isDefault`). **No bloquea**: boton "No, aparcar asi" → aparca igual (`doSaveInvoice`); "Si, asignar cliente" (`goAssignCustomer`) → limpia el cliente y abre el buscador en el sitio del dispositivo (movil/tablet: modal "Seleccionar Cliente" full-screen via `setShowCustomerSearch(true)`; PC: input del carrito que queda visible al limpiar). Si hay **otro cliente real**, no dice nada. Se separo `handleSaveInvoice` (chequeo) de `doSaveInvoice` (guardado real). Typecheck Web limpio. **Necesita deploy web.**
- **Ticket de venta segun moneda (serie NO fiscal): contado en Bs / credito en USD**: a pedido del cliente, el recibo 80mm de **serie no fiscal** muestra los montos en **Bs si es de CONTADO** y en **USD si es a CREDITO** (`cur = invoice.isCredit ? 'USD' : 'BS'`), dejando la **Tasa** como referencia en ambos. Las series fiscales no se tocan (van por la maquina fiscal, otro archivo). En `print-receipt.ts`: helper generico `computeReceipt(invoice, cur)` (antes `computeReceiptBs`) que calcula items/total/igtf en la moneda elegida y lo usan **ambos** generadores (`buildReceiptHTML` y `buildReceiptText`) para no desincronizarse. **Anti-descuadre (el miedo del cliente)**: el TOTAL sale SIEMPRE del campo guardado (`invoice.totalBs`/`invoice.totalUsd` = lo cobrado, lo que cubren los pagos), nunca de la suma de lineas; y el **residual de redondeo** (1-2 centimos) se carga a la **ultima linea** para que la suma NETA de lineas impresas == (total - IGTF). Asi, si el cliente suma lo que ve, da el total exacto. IGTF como linea aparte **solo si > 0**. Pagos y vuelto tambien en la moneda elegida (usan `amountBs`/`amountUsd`/`changeBs` guardados). Helpers `round2`, `fmtBs` (formato `1.234,56`) y `curFmt`. Typecheck Web limpio. **Necesita deploy web.** (El ticket de DEVOLUCION sigue en USD — pendiente si se quiere igual.)
- **Ticket de venta del AGENTE no coincidia con el aprobado (recibo 80mm, serie no fiscal)**: en `apps/web/src/lib/print-receipt.ts` hay 2 generadores — `buildReceiptHTML` (el de `window.print()`, **el aprobado por el cliente**) y `buildReceiptText` (el ESC/POS que manda el agente). El ESC/POS llevaba **cosas de mas que el aprobado no tiene**: encabezado de columnas `ARTICULO/TOTAL`, linea **Subtotal**, **desglose de IVA** (IVA 16%...), linea **IGTF**, linea extra **"Total recibido USD"** en el vuelto, y el sello de credito en `{{BIG}}*** CREDITO ***` (el aprobado dice `*** VENTA A CREDITO ***`). Se reescribio `buildReceiptText` para **espejar exactamente** el HTML: va directo de items a **TOTAL USD/TOTAL Bs** (IVA e IGTF incluidos, sin desglosar), vuelto = monto Bs + `USD x tasa = Bs` + metodo, credito = `*** VENTA A CREDITO ***`, pie "Gracias por su compra" + "*** No constituye factura fiscal ***". Se elimino el const `IVA_LABELS` que quedo sin uso. Typecheck Web limpio. **Necesita deploy web.** (Nota: el doble-ticket que se vio —primero el del navegador y luego el del agente— era transitorio por el agente que aun no respondia; con el agente v1.1.3 andando, `printReceipt` imprime SOLO por el agente y no cae al `window.print()`.)
- **Formato de comanda mas legible (problemas 3 y 4: codigos ocupaban media hoja, letras chicas sin negrita)**: el HTML de respaldo `window.print()` (`apps/web/src/components/print-monitor.tsx`) usaba una tabla de 4 columnas (Cant/Cod/Ref.Prov/Descripcion) a 10–11px sin negrita. Rediseñado a **bloques verticales** (cada producto: `N x NOMBRE` 18px bold y debajo `Cod: … Ref: …` 13px bold), base 15px bold, COMANDA 26px / zona 20px, con `print-color-adjust: exact`. Con el agente andando esta via ni se usa (sale por ESC/POS, que ya venia bold+apilado), pero queda como respaldo legible. **Necesita deploy web** (cosmetico, no urgente).

## ✅ HECHO y DEPLOYADO — Sesiones 58-63 (deployado 2026-06-21)

> Todo lo de abajo ya esta en PRODUCCION (deploy de Diego el 2026-06-21, commit `c912206` = todo `main`). El escaner hibrido se probo en tablet y quedo perfecto; el resto venia probado E2E en local.

- **Sesion 63** (escaner de codigos de barras HIBRIDO en el POS): el escaner de la camara (`sales/pos/page.tsx`, `toggleScanner`) usaba ZXing `BrowserMultiFormatReader` **sin configurar** → tardaba 30-60s en leer y a veces leia mal (ponia otro codigo). Rediseñado a **hibrido**: usa el motor NATIVO del navegador (`BarcodeDetector`) cuando existe — **instantaneo** en Android/Chrome (tablets y telefonos Android, el grueso del mostrador) — y cae a **ZXing calibrado** en iPhone/Safari (que no trae `BarcodeDetector`). Mejoras aplicadas en ambos motores: (1) **formatos restringidos** a los 1D de tienda (EAN-13/EAN-8/UPC-A/UPC-E de fabrica + CODE-128/CODE-39 para etiquetas propias) — antes probaba TODOS los formatos (QR, DataMatrix, PDF417...) en cada frame, lo que lo volvia lento; (2) **camara trasera forzada** (`facingMode: environment`) + resolucion 1280x720 para enfoque nitido; (3) **confirmacion de 2 lecturas iguales seguidas** antes de aceptar (mata el bug de "lee otro codigo"). El boton de la camara y la UI quedan identicos; solo cambia el motor por debajo. Helpers nuevos: `startNativeDetector()`, `startZxingScanner()`, `confirmScan()`, `finishScan()`, `stopScanner()`. **Frontend puro, sin backend, sobre el HTTPS que ya existe.** Typecheck Web limpio. **PROBADO en tablet (Diego, 2026-06-21): quedo instantaneo y con lectura perfecta — "nada que ver con el anterior, completamente diferente".** `BarcodeDetector` requiere Chrome/WebView Android >= 83 (las tablets ya cumplen).
- **Sesion 63** (vista GLOBAL de movimientos de caja + reporte PDF): nueva pantalla `/cash/movements` (item **"Movimientos"** en el submenu CAJA) para ver los pagos/movimientos **cruzando todas las cajas y sesiones**, sin tener que ir cuadrando caja por caja (ej. cotejar **todos los Zelle** de varias cajas juntos). **Filtros**: Caja, Cajero (= dueno de la sesion), rango de fechas (Desde/Hasta) y **Metodos de pago (multi-select por chips)**. Por defecto muestra todo. Incluye tarjetas de resumen (pagos USD/Bs, ingresos/egresos manuales, total) + desglose por metodo, tabla paginada (50/pag) y boton **"Reporte PDF"** (A4 horizontal, agrupado por metodo con subtotales + total general + seccion de movimientos manuales) que **respeta los filtros activos**. **Alcance (importante)**: la vista refleja SOLO lo que hoy toca la caja = **pagos de ventas (POS) + movimientos manuales de gaveta (ingresos/egresos/gastos/anticipos)**. **NO incluye** cobros CxC, pagos CxP ni compras al contado porque esos documentos **hoy no generan `CashMovement`** aunque pidan la caja (ver pendiente nuevo en la lista de abajo — es un cambio aparte que SI afecta el arqueo). El filtro por metodo aplica a los pagos; al seleccionar metodo(s) se ocultan los movimientos manuales (no tienen metodo). Backend: `getGlobalMovementsData()`/`findGlobalMovements()` en `cash-registers.service.ts` (reconstruye pago->sesion con la misma ventana `paidAt ∈ [openedAt, closedAt]` del arqueo; 3 queries, sin N+1), endpoints `GET /cash/movements` (JSON paginado) y `GET /cash/movements-report` (PDF) en el controller, `generateGlobalReport()` en `cash-session-pdf.service.ts` (landscape). **100% aditivo y de solo lectura**: no toca `closeSession`/`getSessionSalesData`/arqueo. Typecheck limpio API+Web. **Probado E2E** contra copia local de la BD de prod: 632 movimientos (631 pagos + 1 egreso), suma por paginas == summary (62.229,92 USD), filtros de fecha/caja/cajero/multi-metodo OK, PDF valido (54 KB sin filtro / 4.6 KB filtrado). **Sin cambios de schema.** *(Nota: para probar se reseteo la clave del admin LOCAL — no afecta prod.)*
- **Sesion 63** (pagina propia de sesion de caja + fix scroll del modal de cierre): el detalle de un cierre solo se veia como un **mini-modal resumido** (sin pagos, ni vueltos, ni movimientos, ni reporte) y tras cerrar la caja ya no se podia sacar el reporte; ademas el **modal de "Cerrar caja"** no scrolleaba cuando era largo (muchos vueltos/canales) y no se llegaba al boton. **(1) Fix scroll** (`cash/[id]/page.tsx`): el modal de cierre ahora es `max-h-[90vh] overflow-y-auto` (ancho original `max-w-lg`). **(2) Pagina propia por sesion** nueva ruta `cash/sessions/[id]/page.tsx` (read-only, sirve para sesiones abiertas y cerradas): replica la vista de "Sesion actual" — fondos de apertura, ventas, por metodo, efectivo esperado en gaveta (+ nota de vueltos), vueltos entregados (con metodo), otros canales, movimientos, y para cerradas un bloque de **Arqueo** (esperado/contado/diferencia USD+Bs + notas) — mas el listado de pagos con filtro/paginacion y el boton **"Reporte detallado"** (PDF), de modo que el reporte se puede sacar aunque la caja este cerrada. Usa los endpoints ya existentes `cash-sessions/:id/summary` y `/payments`. **(3) Navegacion**: el historial global (`cash/sessions/page.tsx`) y el tab "Historial de cierres" de la caja (`cash/[id]`) ahora abren esa pagina propia; se elimino el mini-modal `historyDetail` y sus estados. Cubierto por el permiso `cash` del middleware (esta bajo `/cash/`). Typecheck Web limpio. **Solo frontend, sin backend ni schema.**
- **Sesion 63** (vueltos visibles en el cierre + fix gaveta Bs): los vueltos/cambios (cuando se paga de mas en divisa y el cajero da el cambio por algun metodo) solo se veian en el panel izquierdo en vivo; quien **cuadra la caja** (modal de cierre) o imprime el reporte no los veia, asi que la gaveta Bs aparecia reducida/negativa sin explicacion. **(A) Modal de cierre** (`cash/[id]/page.tsx`): nueva seccion "Vueltos entregados" (factura · metodo · monto + total) y nota bajo "Efectivo Bs" ("Incluye -Bs X de vueltos dados en efectivo"). **(B) PDF del cierre** (`cash-session-pdf.service.ts`): nueva seccion "VUELTOS / CAMBIOS ENTREGADOS" (Factura/Metodo/Bs + total); el query de pagos ahora incluye `changeMethod`. **(C) Panel en vivo**: a cada vuelto se le agrego el metodo de vuelto + la misma nota. **FIX gaveta** (`cash-registers.service.ts`, `getSessionSalesData`): el "Efectivo esperado en gaveta" en Bs restaba **todos** los vueltos (`totalChangeBs`) sin importar el metodo de vuelto; ahora resta solo los dados **en efectivo** (`cashChangeBs`, metodo de vuelto con `isCash`), y los vueltos por canal no-efectivo reducen **ese canal** (`electronicByMethod`), no la gaveta. `changeOutflows` ahora lleva `isCash` y `getSessionSalesData` expone `cashChangeBs`. Comportamiento sin cambios cuando el vuelto es en efectivo (caso actual: 6 vueltos verificados, cashChangeBs==totalChangeBs==4532, gaveta igual). Typecheck limpio API+Web; PDF y summary probados E2E contra la sesion real con vueltos. **Sin cambios de schema.**
- **Sesion 63** (detalles POS facturacion + 2 fixes de cobro): todo en `sales/pos/page.tsx` salvo donde se indica. **(1) Referencia obligatoria en metodos que generan CxC**: cada linea de pago arrastra el flag `createsReceivable` del metodo (generico — cubre Cashea/Crediagro y cualquier futuro, sin hardcodear); si falta la referencia, el campo se pone rojo con texto "Referencia obligatoria para credito" y el boton "Confirmar cobro" queda deshabilitado. Verificado en BD: Cashea y Crediagro tienen `createsReceivable=true` y son metodos de nivel superior. **(2) Filtro de vendedor en el drawer de facturas en espera**: toggle "Mis facturas / Todas" (por defecto "Mis facturas" filtrando por el vendedor del usuario), solo aparece si el usuario tiene vendedor propio (`mySellerId`); es solo visual, no cambia la propiedad de la factura. **(3) Busqueda de cliente -> modal nuevo cliente**: helper `openCreateClient()` (usado por los 3 botones "+": desktop, modal movil y boton inferior movil) que si lo escrito parece documento (prefijo opcional V/E/J/G/C/P + 5+ digitos) lo precarga en RIF con el tipo detectado, si no lo pone en Nombre. **(4) Boton "Usar este cliente"** en el aviso de duplicado de RIF: ahora guarda el cliente encontrado completo y lo asigna directo a la factura; ademas el chequeo excluye el `customerId` actual (en edicion ya no se marca a si mismo como duplicado). **FIX A — descuento/ediciones no se guardaban antes de cobrar**: al cobrar una factura que **ya existe** (retomada/cargada), `handleConfirmPayment`/`handleConfirmCredit` iban directo a `pay` sin reenviar el carrito, asi que `pay()` validaba contra el `invoice.totalUsd` **guardado** (viejo, sin el descuento editado) y rechazaba el cobro en divisa con "El monto pagado es menor al total". Fix: nuevo helper `syncExistingInvoiceItems()` que hace `update-items` del carrito actual **antes** de `pay` en ambos flujos (contado y credito). Las ventas nuevas (carrito desde cero) no cambian. **FIX B — rama exenta ignoraba el descuento** (`apps/api/.../invoices.service.ts`, `pay()`): el recalculo del total para series `isVatExempt` usaba `item.unitPrice * item.quantity` sin aplicar `discountPct` (el `unitPrice` guardado es el precio base SIN descuento), cobrando de mas; ahora multiplica por `(1 - discountPct/100)`. Typecheck limpio en API y Web. **Sin cambios de schema.** Probado en local con copia de la BD de produccion.
- **Sesion 63** (reporte detallado de cierre de caja en PDF): el cierre de caja (`cash/[id]/page.tsx`) no tenia forma de exportar los movimientos con su **referencia** (el listado en pantalla muestra Hora/Factura/Cliente/Metodo/USD/Bs, sin referencia, paginado y sin agrupar) — necesario para cotejar contra Wensoft. Nuevo **PDF imprimible** agrupado por metodo de pago: por cada metodo una tabla Hora/Factura/Cliente/**Referencia**/USD/Bs con subtotal, y un TOTAL PAGOS general; ademas seccion **Movimientos de caja** (ingresos/egresos/gastos manuales: Hora/Tipo/Concepto/Usuario/USD/Bs con totales). Backend: nuevo `cash-session-pdf.service.ts` (`CashSessionPdfService`, PDFKit) registrado en `cash-registers.module.ts`; endpoint `GET /cash-sessions/:id/movements-report` (`@Res` stream `application/pdf`) en `cash-registers.controller.ts`. Usa la **misma ventana de la sesion** (`paidAt` >= openedAt, <= closedAt) que el arqueo, asi cuadra. Horas/fechas fijadas a `America/Caracas`. `Payment.reference` ya existia en BD (solo no se mostraba). Frontend: boton "Reporte detallado" en la cabecera de la seccion Pagos que abre el PDF (`window.open`). Typecheck limpio API+Web. **Probado E2E**: PDF valido (17.7 KB) generado contra una sesion cerrada real de 263 pagos. **Sin cambios de schema.**
- **Sesion 62** (editor de precios completo en el tab "Precios" del producto): el tab "Precios" del detalle de producto (`catalog/products/[code]/page.tsx`) ahora permite editar **toda** la configuracion de precio en un solo sitio: **Costo USD, IVA, Aplica brecha y Precio manual** (antes eran solo lectura ahi y habia que ir a "Informacion general"). Recalcula los precios en vivo al cambiar la base, mantiene la edicion en dos vias ganancia<->precio final, y en modo manual deja escribir los precios finales directos. El boton "Guardar precios" ahora guarda todo junto (costo/iva/brecha/manual/ganancias y, si es manual, los precios finales). Se **elimino** la seccion "Precios" del tab "Informacion general" (su `handleSave` ya no toca precios) para evitar duplicacion. Backend sin cambios: `PATCH /products/:id` ya soportaba todos los campos y recalcula con la misma formula que el preview (`costo x (1+brecha%) x (1+ganancia%) x IVA`). Limpieza: se quitaron variables/constantes de calculo que quedaron sin uso. Typecheck Web limpio. **Sin cambios de schema.**
- **Sesion 62** (correlativos por familia + fixes ajuste de inventario): (A) **Boton "Sincronizar correlativos"** en la lista de Categorias (`catalog/categories/page.tsx`) que llama al endpoint ya existente `POST /import/sync-correlatives` y muestra el detalle de lo corregido (ej. "ELE 15077→15084, REV 69→94"). (B) **Correlativo por familia** en el detalle de categoria raiz (`catalog/categories/[id]/page.tsx`): tarjeta con ultimo numero usado + proximo codigo (ej. REV00095) y boton Sincronizar. Ambos **solo suben** el contador al codigo mas alto existente, nunca lo bajan. (C) **Ajuste de inventario** (`inventory/adjustments/[id]/page.tsx`): fix del bug de que al agregar/eliminar un producto se **borraban las cantidades** ya escritas y no guardadas — `fetchAdjustment` ahora preserva las cantidades locales en edicion y solo toma del server los items nuevos. (D) **Eliminar ajuste en borrador**: nuevo endpoint `DELETE /inventory-adjustments/:id` (borra items+ajuste en transaccion, bloquea si PROCESSED) y boton "Eliminar ajuste" siempre visible en borrador (incluso sin productos) y en ajustes cancelados. Typecheck limpio en API y Web. **Sin cambios de schema.** Operacion en prod aplicada hoy: se corrigieron a mano los correlativos de ELE (→15084) y REV (→94) que estaban desfasados.
- **Sesion 62** (fix modal de pago — punto decimal): los inputs de monto USD/Bs del modal de cobro eran `type=number` controlados por numero; al escribir el punto (`12.`) el browser devuelve `""`, `Number("")` daba 0 y **borraba todo**. Fix: nuevo componente `MoneyInput` (hermano de `QtyInput`, en `sales/pos/page.tsx`) que mantiene el **texto crudo** mientras se edita, avisa el numero parseado en **cada tecla** (para que el campo enlazado USD<->Bs se recalcule en vivo), respeta el `readOnly` del campo calculado y normaliza al salir (`12.`->`12`, vacio->`0`). Reemplaza los dos inputs en `payments.map` (~1709/1722). Typecheck limpio. Pusheado (commit `d103804`).
- **Sesion 62** (boton Guardar pre-factura en la tira): en la tira de agregados del POS movil, al lado de "Ir a cobrar" se agrego un boton **"Guardar"** (icono reloj, secundario) que llama directo a `handleSaveInvoice` — el vendedor guarda sin entrar al carrito. Mismo `disabled`/"Guardando..." que el boton del carrito. Commit `881e2e1`.
- **Sesion 62** (mejoras POS tablet/movil): 4 fricciones resueltas en la vista angosta (<768px) del POS (`apps/web/src/app/(dashboard)/sales/pos/page.tsx`). (1) **Cantidad decimal editable**: nuevo componente compartido `QtyInput` (a nivel de modulo) reemplaza los dos `<input type=number>` de cantidad (carrito movil y escritorio); mantiene el texto crudo mientras se edita, permite borrar y escribir el punto (`0.25`, `0.50`) en el teclado de tablet, y al salir del campo **revierte** al ultimo valor valido si quedo vacio/0 (nunca queda 0/negativo; `setQuantity`/`updateQuantity` ademas ya clampean a 0.01). (2) **Guardar pre-factura vuelve a la busqueda**: `handleSaveInvoice` ahora hace `setMobileView('search')` tras guardar, listo para la siguiente factura (no afecta escritorio; conserva el vendedor). (3) **Boton "+" verde de cliente** al lado del buscador del modal "Seleccionar Cliente" (abre el form de nuevo cliente sin depender del boton inferior que tapa el teclado). (4) **Tira de agregados fija y colapsable** en la vista de busqueda (reemplaza el boton flotante "Ver carrito"): muestra los items de la factura con sus cantidades editables ahi mismo (reusa `QtyInput`), +/-, subtotal por linea y "Ir a cobrar"; cabecera con chevron para colapsar/expandir; el contenedor de resultados lleva `pb-64` cuando hay carrito para que el ultimo resultado no quede tapado. Iconos `ChevronUp/ChevronDown` agregados a los imports. Typecheck del POS limpio. **Sin cambios de backend ni schema.** Verificacion manual pendiente en viewport de tablet. Plan: `docs/superpowers/plans/2026-06-19-pos-tablet-mejoras.md`.
- **Sesion 62** (PWA instalable): la app ahora se puede **instalar** en las tablets (Android, vertical) y abrir a **pantalla completa sin la barra del navegador**. Se agrego `app/manifest.ts` (sirve `/manifest.webmanifest`, `display: standalone`, fondo blanco, theme `#0f172a`), un **service worker minimo** (`public/sw.js`, sin offline — solo para que sea instalable) registrado via `components/pwa-register.tsx` en el layout raiz, **iconos** del trebol generados desde `favicon.png` sobre fondo blanco (`public/icons/`: 192, 512, maskable-512 con safe-area, apple-touch-icon) con el script `scripts/gen-pwa-icons.cjs` (Node puro, sin dependencias). El **middleware** ahora deja pasar sin login `/manifest.webmanifest`, `/sw.js` e `/icons` (si no, redirigia a /login y rompia la instalacion). Verificado en local (manifest/sw/iconos 200 + tags inyectados). Requiere HTTPS (ya esta: `https://eltrebol.app`). **Para el deploy**: poner `COOKIE_SECURE=true` en el `.env` del server (ahora que es HTTPS) para que la sesion persista dentro de la app instalada. Siguiente paso aparte: rediseño del layout del POS para tablet vertical (carrito persistente, menos modales).
- **Sesion 61** (rediseño del Recargo en facturas de compra + eliminar pendientes): el "Recargo $" estaba **sumandose al total** y duplicando montos. Nuevo modelo confirmado con el cliente: **el recargo NUNCA afecta la factura** (total ni montos de linea — la factura debe quedar identica a la del proveedor por temas legales), solo se **reparte entre los articulos no-servicio** subiendo su **costo de inventario** (costo aterrizado), que es lo que define el precio de venta. Implementacion: nuevo campo `PurchaseOrderItem.landedCostUsd/landedCostBs` (migracion `20260619190000_add_landed_cost_purchase_item`, idempotente + backfill); helper `applySurchargeLandedCost` reparte el recargo (PROPORCIONAL/EQUITATIVO) en el costo aterrizado **sin tocar** los totales de linea; `calculateFiscalTotals` deja de sumar el recargo al total (ramas USD y BS); `process()` usa el costo aterrizado para `Product.costUsd`, el recalculo de `priceDetal/priceMayor` y el `StockMovement`. Frontend: formularios de nueva/editar compra ya no suman el recargo al total y **auto-rellenan** el campo "Recargo $" con la suma de las lineas de servicio (flag "tocado" para edicion manual / flete externo); el detalle de la factura muestra una columna **"Costo c/recargo"** (solo si hay recargo) y el modo de reparto. El **modal de precios** del boton "Procesar" (`getSuggestedPrices`) ahora calcula "Costo nuevo" y los precios sugeridos con el **costo aterrizado** (antes usaba `netCostUsd` sin recargo y mostraba un costo/precio menor al que realmente aplicaba `process()`). Ademas: **eliminar facturas de compra en estado PENDIENTE** (endpoint `DELETE /purchases/:id` con guard de estado; reemplaza el boton "Cancelar" en lista y detalle, ya que canceladas solo se acumulaban; las PROCESSED no se pueden borrar). Verificado E2E en local (escenario A con servicio, escenario B con recargo manual, recepcion, y guards de borrado). Plan: `docs/superpowers/plans/2026-06-19-recargo-compras-rediseno.md`. **Pendiente post-deploy**: corregir FC-00026 en prod (re-guardar para que pase de $545.47 a $528.26 con costos aterrizados).
- **Sesion 60** (arqueo de caja por moneda — fix del faltante fantasma): el cierre calculaba el esperado sumando `invoice.totalUsd` Y `invoice.totalBs` (la misma venta en ambas monedas), ignorando el metodo de pago → un dia 100% Efectivo Bs mostraba un faltante en USD igual al valor en dolares de las ventas. Ahora el esperado es **solo el efectivo fisico recibido por moneda**: nuevo flag `PaymentMethod.isCash` (sembrado en Efectivo USD/Bs); `getSessionSalesData` separa efectivo de gaveta (`cashExpectedUsd/Bs`, restando vuelto en Bs y segregando movimientos por `currency`) de los canales electronicos (`electronicByMethod`: Zelle/punto/pago movil/transferencia, **informativos**, se cuadran contra banco/plataforma). `closeSession`/`getSessionSummary` usan el efectivo esperado y **persisten** `expectedUsd/expectedBs/differenceUsd/differenceBs` en `CashSession` (antes el descuadre no se guardaba, se recalculaba con la formula mala). Frontend: el modal de cierre muestra "Efectivo esperado en gaveta" vs "Otros canales (cuadrar aparte)" y la diferencia se calcula contra el efectivo esperado (antes el front duplicaba la formula mala). Migracion `20260618120000_cash_arqueo_by_currency` + `fix-schema.sql`. **No se tocaron** los botones Reporte X/Z (comandos a la maquina fiscal). Incluye **reporte de descuadres**: el historial de sesiones (`/cash/sessions`) ahora tiene columna "Descuadre" (verde "Cuadra" / rojo con monto / "s/d" para cerradas antes del cambio) y filtro "Solo descuadradas" (sin cambio de backend: `findAllSessions` ya devuelve los campos). **Arqueo en vivo (sesion abierta)**: el desglose "Por metodo" muestra cada metodo en su moneda nativa (Efectivo Bs en Bs, no su equivalente en USD) — `byMethod` ahora lleva `isDivisa`/`isCash` — y se agrego un bloque "Efectivo esperado en gaveta" (USD+Bs) para cuadrar a medio dia sin cerrar. Mismo arreglo de moneda nativa en el detalle de historial. Plan: `docs/superpowers/plans/2026-06-18-arqueo-caja-por-moneda-y-canal.md`.
- **Sesion 59e** (reporte de ventas por vendedor en pantalla de Facturas): boton "Reporte por vendedor" en `/sales/invoices` que abre un PDF agrupado por vendedor -> por factura (correlativo - cliente) -> items (articulo, cantidad, precio con IVA de lista, descuento), con subtotal por factura, total por vendedor y total general. **Respeta los filtros activos** de la pantalla (estado, tipo de pago, vendedor, busqueda, fechas); si no se filtra estado, incluye solo ventas concretadas (PAID/PARTIAL_RETURN/RETURNED), no PENDING/CANCELLED. Backend: `GET /invoices/report/by-seller` (colocado antes de `:id/pdf` para evitar colision de rutas) + `InvoicePdfService.generateSellerReport()` con PDFKit. Sin cambios de schema.
- **Sesion 59d** (dashboard vendedor: ventas brutas + netas): "Mis Ventas" mostraba el total bruto pero excluia las facturas totalmente devueltas (`RETURNED`), creando inconsistencia (parciales contaban completas, totales desaparecian). Ahora `getSellerSales` incluye `RETURNED` por su total original (bruto real) y `getVendedor` expone `sales.netUsd = bruto - devoluciones`. La tarjeta "Mis Ventas" muestra el bruto grande + "Neto real" debajo. Nota: el neto del periodo puede ser negativo si se devuelve mas de lo vendido ese dia (correcto: la devolucion se registra cuando ocurre). El conteo "Facturas" ahora incluye las totalmente devueltas.
- **Sesion 59c** (fix devoluciones en dashboard + comision neta): (A) **dashboard y "Ventas por vendedor" no mostraban las devoluciones** porque filtraban las NCV por `appliedAt` (que solo se llena cuando la nota se cruza en un recibo; el `post` no lo setea). Verificado en prod: las 4 devoluciones tenian `appliedAt` nulo. Fix: filtrar por `documentDate` en `dashboard.getReturns/getSellerReturns` y `reports.salesBySeller`. (B) **El reporte de comisiones perdia la factura completa** al recibir una devolucion: `getCommissionReport` filtraba `status: 'PAID'` estricto, asi que una factura `PARTIAL_RETURN`/`RETURNED` desaparecia y el vendedor perdia la comision de todo (incluido lo que el cliente SI se quedo). Fix: incluir `PARTIAL_RETURN`/`RETURNED` y comisionar sobre la **cantidad neta** (`quantity - returnedQty`) con prorrateo de IVA-notas y total vendido; mismo neteo al "vendido al grupo". Las facturas **totalmente devueltas no se cuentan** (`commissionableCount`) ni se listan. `getAllCommissionReports` se corrige solo (reusa el metodo). Sin cambios de schema.
- **Sesion 59b** (fix visibilidad del vendedor al retomar factura en espera): el `sellerId` SÍ se guardaba y preservaba en BD (`create` lo asigna, `updateItems` hace `dto.sellerId || invoice.sellerId`, `pay` no lo toca) — verificado en prod: facturas creadas por el Admin quedaron con vendedor LENNYS. El problema era **solo de UI**: al retomar no se veia de quien era la factura y el Admin veia "Sin vendedor" en el selector (riesgo de reasignar mal y machacar al vendedor real). Fix: `retake()` y el endpoint `pending` ahora incluyen `seller`; el POS precarga `selectedSellerId` desde `fullInvoice.seller` al retomar; y cada tarjeta de "Facturas en espera" muestra el nombre del vendedor. Sin cambios de schema.
- **Sesion 59** (fix caja/serie en cobro vendedor→cajero): el vendedor monta la factura en espera sin elegir caja; al crearla el backend le asignaba **la primera caja activa arbitraria** (la cual podia no tener serie). Al cobrar, `invoices.pay()` priorizaba esa caja de la factura sobre la del cajero → error **"La caja del cajero no tiene serie configurada"**. Fix: `PayInvoiceDto` ahora lleva `cashRegisterId` opcional; el POS lo envia en ambos cobros (contado/credito) con la **caja activa en pantalla** (resuelve el caso de cajero con 2+ cajas abiertas). `pay()` resuelve la caja con prioridad `dto.cashRegisterId` → `invoice.cashRegisterId` → sesion abierta del cajero, **exige sesion OPEN** en esa caja (en compartidas de cualquiera, en no-compartidas del propio cajero) y nombra la caja real en los mensajes de error. La linea 885 ya reescribia `invoice.cashRegisterId`, asi que la factura queda asignada a la caja del cobro. Ademas el **arqueo** (`getSessionSalesData` + `findSessionPayments`) ahora cuenta ventas por **`paidAt`** en vez de `createdAt`, para que la venta caiga en la sesion donde realmente se cobro (antes una pre-factura creada antes de abrir la sesion del cajero no aparecia en su cierre). Sin cambios de schema. **Pre-deploy**: verificar que las facturas PAID en prod tengan `paidAt` poblado.
- **Sesion 58** (Control de Comandas): pantalla nueva `/commands` (menu **COMANDAS**, permiso de seccion `commands`) para ver el estado de las comandas y **reimprimir por factura**. La reimpresion **clona** las comandas como registros nuevos `PENDING` (sello "REIMPRESION") y reencola **a todas las zonas** de la factura; la PC de cada zona las imprime en su poll. Ciclo de vida real: `claim`→`PRINTING`, y el monitor reporta `PRINTED`/`FAILED` segun el agente (antes se marcaba `PRINTED` antes de imprimir → los fallos eran invisibles). La pantalla ancla **fallidas/pendientes** arriba, filtra por fecha/zona/estado/factura y auto-refresca. BD: enum `PrintStatus` +`PRINTING`, `PrintJob` +`isReprint`/`reprintOfId`/`failureReason`/`updatedAt` (migracion `20260616000000_print_jobs_control` + `fix-schema.sql`). Permiso `commands` agregado al middleware (`ROUTE_PERMISSION_MAP`) y a `VALID_MODULES` del backend. Spec/plan en `docs/superpowers/`.

## ✅ HECHO y DEPLOYADO — Sesiones 49-57 (probado 2026-06-15/16)
- **Sesion 57** (comandas de despacho): `PrintMonitor` aplica el cambio de zona al instante (CustomEvent `printAreaChanged`, sin recargar). Comanda con formato ESC/POS (`{{BIG}}/{{BOLD}}/{{LINE}}/{{CUT}}`) + corte automatico. Indicador visible "Comandas: <zona>". **Anti-duplicados**: reserva atomica `PATCH /print-jobs/:id/claim`. **Agente v1.1.1**: fix critico — el `.exe` (pkg) ahora lee el `config.json` externo (`process.execPath`, antes `__dirname` apuntaba al snapshot) y tolera BOM; lanzador portable `iniciar-agente.vbs` (sin consola); guias `INSTALACION-CLIENTE.md`/`SETUP.md`/`README.md` actualizadas. Instalar en cliente: copiar exe+config.json+.vbs a `C:\Trinity\`, editar impresora, acceso directo del .vbs en shell:startup.
- **Sesion 56** (retenciones): TXT SENIAT de retenciones de IVA en compras (declaracion quincenal) + detalle del comprobante mostrando montos en Bs.

### Sesiones 49-55 (probado 2026-06-15)
Resumen (detalle tecnico completo en los logs de cada sesion mas abajo):
- **Sesion 49** — Libro de ventas editable, ticket de devolucion no fiscal, correcciones fiscales.
- **Sesion 50** — Retenciones de IVA de clientes (contribuyente especial, RVC, cruce en recibo, comprobante, caso reintegro). Verificado 2026-06-13.
- **Sesion 51** — Libros fiscales detalle SENIAT: libro de ventas detallado (Tipo / Doc. Afect. / IVA Ret. / Comprob.), NCV en negativo y NDV en positivo, retenciones, PDF apaisado, fix Reportes Z, libro de compras con NCC.
- **Sesion 52** — Correlativos por tipo de documento dentro de la serie, serie en notas de compra, fecha editable de notas, NCC/NDC entran al libro de compras.
- **Sesion 53** — Libro de compras formato SENIAT (PDF/Excel + cuadro de totales), serie del proveedor en facturas/CxP, Excel=PDF en los 3 libros, menus separados de Notas Cr/Db con N° de nota del proveedor, rediseño y eliminacion de CxC/CxP (clave dinamica), no-sacar-sesion, eliminar conteo fisico, boton "Mas acciones" en factura de compra.
- **Sesion 54** — Reporte de comisiones: columna IVA Notas (serie no fiscal), Comision = (Base + IVA Notas) × %, empresas del grupo (toggle en cliente, no comisionan, tarjeta + badge). Migracion `20260615120000_customer_is_group_company`.
- **Sesion 55** — Comisiones a PDF (individual + todos los vendedores con TOTAL GENERAL). *Nota: desfase conocido de 1 centavo por redondeo, decidido dejar asi.*

## 🔨 PENDIENTE — no implementado aun (para proximas sesiones)
- [x] **Comandas automaticas por area de despacho** (Sesion 57): al pagar en POS el ticket 80mm imprime solo y las comandas por area se mandan solas al agente. Arquitectura: 1 PC por despacho (cada una fija a su zona via Configuracion) + su propio agente con su impresora. Pendiente real para futuro: que UN solo agente reparta a varias impresoras por zona (hoy 1 agente = 1 impresora).
- [ ] **Cobros CxC / pagos CxP / compras al contado deben afectar la CAJA (arqueo)** — IMPORTANTE: hoy estos documentos **piden la caja** (`Receipt`/`ReceivablePayment`/`PayablePayment` guardan `cashSessionId`) pero ese dato **NO genera un `CashMovement`**, así que el dinero **no entra al cuadre/arqueo** ni a `getSessionSalesData`. Solo el caso de recibo de cobro NEGATIVO (reintegro) crea egreso. Resultado: un cobro de CxC en efectivo, un pago a proveedor o una compra al contado **no aparecen en el cierre de caja** aunque se haya elegido la caja. Objetivo: que al postear un recibo/compra con `cashSessionId` se cree el `CashMovement` correspondiente (INCOME para cobros, EXPENSE para pagos), respetando moneda/`isCash` del método, para que el arqueo cuadre. OJO: esto **modifica qué entra al arqueo** — coordinar con Diego antes de tocar el cierre. (Detectado en Sesion 63 al construir la vista global de Movimientos de caja, que por ahora solo refleja lo que YA toca la caja: ventas + movimientos manuales/gastos/anticipos.) **➡️ YA HAY PLAN DETALLADO PARA RETOMAR (Fase 1 = recibos CxC/CxP, SIN compras)**: `docs/superpowers/plans/2026-06-21-recibos-afectan-caja.md`. Enfoque: solo-lectura sobre `Receipt` POSTED (inmutable, sin migración, sin lógica de reversa); `getSessionSalesData` lee los `ReceiptPayment` de la sesión y ajusta el efectivo de gaveta (cobros suman, pagos restan, solo el efectivo; electrónicos informativos). 6 tareas con código completo: arqueo, verificación de cierre, display en modal/paneles/PDF y vista global (con cotejo por método). Excluye reintegros (ya crean su `CashMovement`) para no duplicar. **Compras al contado = Fase 2 aparte** (requieren migración + UI porque `PayablePayment` no tiene `cashSessionId`).
- [ ] **Modulo de etiquetas en Trinity** (impresion de etiquetas con codigo de barras propio): el cliente ya imprime sus propias etiquetas por fuera; a futuro hacer un modulo dentro de Trinity para generar/imprimir etiquetas de producto con codigo de barras. **Recomendacion de formato**: estandarizar en **CODE-128** (denso, alfanumerico, con digito verificador — el tipico para codigos internos) o **EAN-13** si se quieren "estilo producto". El escaner del POS ya lee CODE-128/CODE-39 ademas de EAN/UPC (ver entrada de escaner hibrido en deploy), asi que el formato que se elija debe estar en esa lista. Definir: contenido del codigo (¿el `code` del producto?), tamaño de etiqueta, impresora (termica de etiquetas tipo Zebra/rollo), y si se imprime por lote o por producto.
- [ ] **Facturas anuladas en el libro de ventas** (mostrar con monto 0 / marca ANULADA).
- [ ] **XML de retenciones de ISLR en compras** para el portal SENIAT (equivalente al TXT de IVA pero para ISLR, en formato XML). FALTA generarlo.
- [ ] **Backups automaticos de la BD de produccion (PENDIENTE — profundizar mas adelante)**: hoy (2026-06-21) se hizo una copia **manual** de la BD de prod para traerla a local (ver nota abajo), pero NO hay respaldo periodico automatico. Objetivo a futuro: (1) cron diario en el server con `pg_dump | gzip` + rotacion (borrar >N dias); (2) copia **fuera del droplet** (scp a otra maquina / DigitalOcean Spaces / S3) porque un backup en el mismo server no protege si se pierde el droplet; (3) idealmente snapshot semanal del droplet en el panel de DO como complemento; (4) **probar un restore** para validar que el backup sirve (paso que casi nadie hace). Decidir frecuencia, retencion y destino off-site con Diego. Comando base de dump (solo lectura) ya validado: `pg_dump "${DATABASE_URL%%\?*}" --clean --if-exists --no-owner --no-acl | gzip > backup.sql.gz`.

### Nota — copia manual prod→local (2026-06-21)
- Se trajo la BD de produccion a local para pruebas. **Respaldo de seguridad de prod quedo EN el server** antes de bajarla: `/opt/Trinity/backups/prod-20260621-154811.dump` (custom -Fc) y `/opt/Trinity/backups/prod-plain-20260621-154911.sql.gz` (SQL plano). A prod **solo se le hizo `pg_dump` (lectura)**, nunca nada destructivo.
- Detalle de versiones: prod server es **PostgreSQL 15.17**, pero su binario `pg_dump` genera header de formato **1.15** (PG16+) que el `pg_restore` del contenedor local (postgres:15) **no lee** → por eso se uso **dump en SQL plano** (`-Fp`, agnostico de version) restaurado con `psql`. El `-Fc` (custom) fallo con "unsupported version (1.15)".
- Restore local: `gunzip -c prod.sql.gz | docker exec -i trinity-postgres-1 psql -U trebol -d trebol_db` (0 errores). Datos cargados: 2368 productos, 614 facturas, 15 clientes, 8 usuarios, 17 metodos de pago. Para repetir: detener la API local (`npx kill-port 4000`) antes del restore y reiniciarla despues.
- [ ] **Desglose por alicuota** 8%/31% en libros (hoy todo 16%) — deuda tecnica.
- [ ] **Ventas automaticas** (post-produccion): catalogo web, chatbot WhatsApp/Instagram, tienda online, difusion de ofertas.
- [ ] **Refresh deslizante en middleware** (opcional): reabrir tras >1h sin re-login. Hoy el trabajo activo ya esta cubierto.
- [ ] **Importaciones** en libro de compras (DUA / IVA de aduana) — solo si importan directo.
- [ ] **Compras sin derecho a credito fiscal** como columna separada de exentas.
- [ ] **Toggle para ocultar lineas ISLR** al exportar el libro de IVA "legal".

> Nota local: Web http://localhost:3000 (admin@trinity.com) · API :4000. **La BD local es copia de prod (2026-06-21), por eso la clave del admin LOCAL se reseteo a `Test1234!` en sesion 63 para poder probar — solo afecta local, nunca prod.** Si no levanta: `pnpm -C apps/api start:prod` y `pnpm -C apps/web dev`. El fix de login local (`apps/web/.env.local`) es SOLO local, no se commitea.

---

## ✅ Auditoria libros fiscales (sesion 50-52) — CONCLUIDA
Resuelto y deployado: NCC/NDC de compras entran al libro de compras (heredan serie, fix sesion 52);
NCV/NDV generan linea en el libro de ventas detallado; fix del bug de retencion en Reportes Z;
columnas SENIAT completas en el detallado + PDF apaisado.
Lo que la auditoria dejo abierto ya esta listado arriba en **🔨 PENDIENTE** (facturas anuladas,
desglose por alicuota, TXT de retenciones, importaciones, compras sin credito fiscal, toggle ISLR).

---

## Sesion 52 — Correlativo por tipo de documento + serie en notas de compra + fecha editable

### Problema detectado
- Las notas (NCV/NDV/NCC/NDC) compartian el contador `Serie.lastNumber` con las facturas: si la factura iba en 80, una nota salia 81 y la siguiente factura 82. Cada tipo debe tener su propio correlativo dentro de la serie.
- Las NCC/NDC de compra no heredaban serie → nunca entraban al libro de compras (ver auditoria).
- La fecha de las notas no era editable (siempre hoy).

### Base de datos
- **Serie**: nuevos contadores por tipo `lastInvoiceNumber`, `lastCreditNoteNumber`, `lastDebitNoteNumber` (el viejo `lastNumber` queda deprecado; backfill: `lastInvoiceNumber = lastNumber`).
- **CreditDebitNote**: nuevo campo `documentDate` (fecha editable del documento).
- **Migracion**: `20260613100000_per_type_serie_correlatives` (IF NOT EXISTS + backfill). Replicada en `deploy/fix-schema.sql`.

### Backend
- **credit-debit-notes.service.create()**:
  - Hereda `serieId` de la factura (NCV/NDV) **o de la orden de compra** (NCC/NDC).
  - Numeracion por tipo: `{prefijoSerie}-{NC|ND}-{año}-{correlativo8}` (ej. `VF-NC-26-00000001`). NC = credito (NCV/NCC), ND = debito (NDV/NDC). Cada tipo incrementa su propio contador con SELECT FOR UPDATE.
  - `documentDate` editable (DTO `date`); rige la fecha del libro (`entryDate`) y la tasa de cambio aplicada.
  - Fallback `nextSequentialNoteNumber()` (`TIPO-0001`) solo si el padre no tiene serie.
- **invoices.service** y **quotations.service**: las facturas usan `lastInvoiceNumber`.
- **import.service** y `scripts/clean-sales-data.sql`: reset de los 3 contadores.

### Frontend
- `/credit-debit-notes/new`: selector "Fecha del documento" (default hoy) enviado como `date`.

### Verificado E2E (local)
- NCV → `VF-NC-26-00000001`, NDV → `VF-ND-26-00000001`, contador de facturas intacto en 2.
- NCC sobre compra fiscal (serie CMP) → `CMP-NC-26-00000001` → linea negativa en libro de compras.
- Notas con fecha del documento reflejada en el libro.
- **PENDIENTE DEPLOY** (lo hace Diego): la migracion corre sola con backfill. Serie de compra fiscal "CMP" creada en local para pruebas de UI.

---

## Sesion 50 — Retenciones de IVA en ventas (retenciones sufridas de clientes)

### Base de datos
- **Modelo CustomerIvaRetention**: Retenciones de IVA que clientes contribuyentes especiales aplican a facturas de venta
  - `number` (unique, correlativo `RVC-0001`), `invoiceId`, `customerId`
  - `taxableBase/ivaAmount/retention` en USD y Bs + `retentionPct` (75/100) + `exchangeRate`
  - Comprobante del cliente: `voucherNumber` (14 dígitos), `voucherDate`, `voucherReceivedAt`
  - Ciclo de vida: `appliedAt` (cruzada en recibo), `cancelledAt`, `salesBookEntryId?` (unique, línea del libro)
- **Customer.isSpecialTaxpayer**: flag de contribuyente especial (default false)
- **ReceiptItemType**: nuevo valor `SALES_IVA_RETENTION` + FK `customerIvaRetentionId` en ReceiptItem
- **Migracion**: `20260612000000_add_customer_iva_retentions` con IF NOT EXISTS (replicada en deploy/fix-schema.sql)

### Backend (NestJS)
- **CustomerIvaRetentionsModule**: nuevo modulo
  - `POST /customer-iva-retentions` — crear contra factura (valida serie fiscal, IVA > 0, suma de retenciones ≤ IVA, tolerancia ±1 Bs vs % teorico); acepta comprobante inline (caso reintegro)
  - `GET /customer-iva-retentions?status=pending-voucher|voucher-received|cancelled&search&from&to`
  - `GET /customer-iva-retentions/pending-count` — para alertas
  - `PATCH /:id/voucher` — registra comprobante (14 dígitos) + crea SalesBookEntry con isRetentionLine=true y numero de comprobante en notes (fecha del comprobante como entryDate)
  - `PATCH /:id/cancel` — solo ADMIN, solo si no aplicada; elimina la linea del libro si existia
- **InvoicesService.pay()**: al facturar a credito a cliente con isSpecialTaxpayer + serie fiscal + IVA > 0, auto-crea la retencion (75% del IVA o ivaRetentionPct de config) dentro de la transaccion
- **ReceiptsService**:
  - `getPendingDocuments` (modo cobro) devuelve array `retentions` con sign -1 (appliedAt null, no anuladas)
  - `create()` acepta `customerIvaRetentionId` en itemIds (valida no aplicada/no anulada)
  - `post()` marca `appliedAt`; si el recibo de cobro queda con total negativo y tiene cashSessionId, crea CashMovement tipo EXPENSE "Reintegro recibo RCB-XXXX" (salida de caja justificada)
- **SalesBookService.findAll()**: excluye lineas isRetentionLine de los totales (el IVA retenido no es debito fiscal)

### Frontend (Next.js)
- **POS**: toggle "Contribuyente especial" junto al cliente seleccionado (desktop y movil); PATCH directo al cliente; oculto para el cliente default de factura
- **Recibos de cobro** (`/receipts/new`): retenciones del cliente aparecen como documentos cruzables (moradas, sign -1); nota de reintegro cuando el total es negativo; detalle del recibo muestra "Ret. IVA Cliente"
- **Nueva pagina `/sales/customer-retentions`** (sidebar VENTAS → "Retenciones clientes"):
  - Tabs: Pendientes de comprobante / Con comprobante / Anuladas / Todas
  - Alerta ambar con contador de retenciones sin comprobante; columna de dias transcurridos (rojo > 7 dias)
  - Modal "Registrar comprobante": 14 dígitos + fecha + monto ajustable (tolerancia ±1 Bs)
  - Modal "Nueva retencion (reintegro)": busca factura pagada fiscal con IVA, % 75/100, comprobante opcional inline
  - Anulacion con confirmacion (solo no aplicadas)

### Flujos de negocio cubiertos
1. **Cliente conocido / credito**: factura a credito → retencion auto-creada → recibo de cobro cruza CxC (+) y retencion (−) → cobra neto → comprobante llega despues → se registra → linea en libro de ventas
2. **Cliente pago completo (reintegro)**: trae comprobante → "Nueva retencion" con comprobante → recibo de cobro solo con la retencion (total negativo) → salida de dinero registrada en sesion de caja
3. **Alerta**: retenciones descontadas sin comprobante visibles con dias transcurridos para exigirlo al cliente

### Verificacion E2E (local)
- Creacion con validaciones (serie no fiscal rechazada, monto fuera de tolerancia rechazado), correlativo RVC-0001, 75% del IVA correcto
- Recibo de cobro con total negativo posteado OK; retencion marcada aplicada y fuera de pendientes
- Comprobante registrado con ajuste de monto (120 → 120.50 dentro de tolerancia); SalesBookEntry creada con numero en notes; totales del libro la excluyen

## Sesion 49 — Libro de ventas editable, ticket de devolucion y correcciones fiscales

### Base de datos
- **Modelo SalesBookEntry**: Nuevo modelo para registros editables del libro de ventas
  - `invoiceId?`, `entryDate`, `invoiceNumber`, `controlNumber?`, `customerName`, `customerRif?`
  - `exemptAmountBs`, `taxableBaseBs`, `ivaAmountBs`, `igtfAmountBs`, `totalBs`
  - `isManual`, `isRetentionLine`, `notes?`, `createdById`
  - Relaciones con Invoice y User
- **Migracion**: `20260526020000_add_sales_book_entry` con IF NOT EXISTS

### Backend (NestJS)
- **SalesBookModule**: Nuevo modulo CRUD para el libro de ventas (patron identico a PurchaseBookModule)
  - `GET /sales-book?from&to` — lista entradas por rango de fechas
  - `GET /sales-book/pdf?from&to` — datos para PDF con resumen fiscal
  - `POST /sales-book` — crear entrada manual
  - `PATCH /sales-book/:id` — editar entrada
  - `DELETE /sales-book/:id` — solo ADMIN
- **InvoicesService.pay()**: Al pagar factura fiscal, crea automaticamente SalesBookEntry
  - Calcula montos en Bs por tipo IVA (exento, base imponible, IVA, IGTF)
  - No falla el pago si la creacion del entry falla (try/catch)
- **DTOs**: create-sales-book-entry.dto.ts, update-sales-book-entry.dto.ts

### Frontend (Next.js)
- **Pagina `/fiscal/libro-ventas`**: Reescrita completamente
  - Reemplaza selector mes/año por date pickers "Desde" y "Hasta"
  - Botones rapidos: "Este mes", "Quincena 1 (1-15)", "Quincena 2 (16-fin)", "Mes anterior"
  - Tabla editable con columnas: N° | Fecha | N° Control | N° Factura | Cliente | RIF | Exento Bs | Base Imp Bs | IVA Bs | IGTF Bs | Total Bs
  - Cada fila con boton editar (lapiz) y eliminar
  - Badges "MANUAL" (amber) y "AUTO" (sky) para distinguir origen
  - Fila de totales al pie en negrita
  - Modal editar/crear con todos los campos + nota "Los cambios no afectan la factura original"
  - Boton "+ Agregar entrada manual"
  - Exportar PDF con segunda pagina de resumen fiscal
- **Pagina `/credit-debit-notes/[id]`**: Ticket de devolucion no fiscal
  - Al confirmar NCV MERCHANDISE no fiscal, imprime ticket via Trinity Agent
  - Nuevo boton "Imprimir Ticket" (verde) para reimpresion manual
- **print-receipt.ts**: Nuevas funciones exportadas
  - `buildReturnReceiptText(note, invoice, company)` — formato ESC/POS para devolucion
  - `printReturnReceipt(note, invoice, company)` — envia ticket via Trinity Agent

### Archivos creados
- `apps/api/src/modules/sales-book/sales-book.module.ts`
- `apps/api/src/modules/sales-book/sales-book.controller.ts`
- `apps/api/src/modules/sales-book/sales-book.service.ts`
- `apps/api/src/modules/sales-book/dto/create-sales-book-entry.dto.ts`
- `apps/api/src/modules/sales-book/dto/update-sales-book-entry.dto.ts`
- `packages/database/prisma/migrations/20260526020000_add_sales_book_entry/migration.sql`

### Archivos modificados
- `packages/database/prisma/schema.prisma` — SalesBookEntry model, relacion en Invoice y User
- `apps/api/src/app.module.ts` — Registro de SalesBookModule
- `apps/api/src/modules/invoices/invoices.service.ts` — Auto-crear SalesBookEntry al pagar
- `apps/web/src/app/(dashboard)/fiscal/libro-ventas/page.tsx` — Reescrito con entradas editables
- `apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx` — Ticket no fiscal + boton reimprimir
- `apps/web/src/lib/print-receipt.ts` — buildReturnReceiptText + printReturnReceipt

---

## Sesion 48 — Modelo Serie para configuracion de documentos fiscales

### Base de datos
- **Modelo Serie**: Nuevo modelo que centraliza la configuracion fiscal de documentos
  - `name` (unique), `prefix`, `isFiscal`, `isVatExempt`, `lastNumber`, `isActive`
  - Relacion 1:1 con CashRegister via `cashRegisterId` (unique)
  - Relaciones con Invoice, CreditDebitNote, RetentionVoucher
- **CashRegister**: Eliminados campos `isFiscal` y `lastInvoiceNumber` — ahora viven en Serie
- **Invoice**: Agregado `serieId` con relacion a Serie
- **CreditDebitNote**: Agregado `serieId` con relacion a Serie
- **RetentionVoucher**: Agregado `serieId` con relacion a Serie
- **Migracion**: `20260526000000_add_serie_model` con IF NOT EXISTS para seguridad
- **Limpieza**: Script SQL para limpiar datos de prueba y resetear correlativos

### Backend (NestJS)
- **SeriesModule**: Nuevo modulo con CRUD completo
  - `GET /series` — lista todas las series con caja vinculada
  - `GET /series/:id` — detalle
  - `POST /series` — crear (solo ADMIN)
  - `PATCH /series/:id` — editar (solo ADMIN)
  - `PATCH /series/:id/toggle-active` — activar/desactivar
- **InvoicesService**: Correlativos ahora usan Serie
  - Obtiene serie de la caja seleccionada, error si no tiene serie
  - Numero de factura: `{prefix}-{year2}-{correlativo8}` (ej: VTA-26-00000001)
  - SELECT FOR UPDATE en Serie para incrementar lastNumber
  - Si serie.isVatExempt = true, fuerza IVA 0% en todos los items
- **CreditDebitNotesService**: Hereda serieId de la factura origen
  - Notas de venta usan la serie de la factura padre para generar numero
  - Notas de compra mantienen numeracion secuencial por tipo
- **QuotationsService**: Conversion cotizacion->factura usa serie de la caja
- **FiscalService**: Libro de ventas solo incluye facturas con serie fiscal
- **CashRegistersService**: Eliminado isFiscal del create/update, incluye serie en queries

### Frontend (Next.js)
- **Nueva pagina `/settings/series`**: Tabla con nombre, prefijo, fiscal (badge), exenta IVA (badge), caja vinculada, ultimo numero, estado. Modal crear/editar con nombre, prefijo, caja, checkboxes fiscal y exenta IVA
- **Sidebar**: Agregado "Series" bajo CONFIGURACION con icono Layers
- **POS**: `selectedCashRegister?.serie?.isFiscal` reemplaza `selectedCashRegister?.isFiscal`. Badge "Sin serie" para cajas sin serie
- **Invoices list/detail**: Muestra serie con badge Fiscal/No Fiscal
- **Credit/Debit notes**: Muestra serie heredada con badge fiscal
- **Cash register pages**: isFiscal removido, ahora muestra info de serie
- **fiscal-printer.ts**: NO modificado (verificado)

### Series iniciales (seed)
- Serie NE: prefix NE, no fiscal, vinculada a Caja Notas
- Serie VTA: prefix VTA, fiscal, vinculada a Fiscal 1
- Serie VF: prefix VF, fiscal, vinculada a Fiscal 2

### Archivos creados
- `apps/api/src/modules/series/series.module.ts`
- `apps/api/src/modules/series/series.controller.ts`
- `apps/api/src/modules/series/series.service.ts`
- `apps/api/src/modules/series/dto/create-serie.dto.ts`
- `apps/web/src/app/(dashboard)/settings/series/page.tsx`
- `packages/database/prisma/migrations/20260526000000_add_serie_model/migration.sql`
- `scripts/clean-test-data.sql`

### Archivos modificados
- `packages/database/prisma/schema.prisma` — Serie model, serieId en Invoice/CreditDebitNote/RetentionVoucher, CashRegister sin isFiscal/lastInvoiceNumber
- `packages/database/prisma/seed.ts` — Series iniciales, cajas sin isFiscal
- `apps/api/src/app.module.ts` — Registro de SeriesModule
- `apps/api/src/modules/invoices/invoices.service.ts` — Correlativos con Serie, VAT exempt
- `apps/api/src/modules/credit-debit-notes/credit-debit-notes.service.ts` — Herencia de serieId, includes
- `apps/api/src/modules/quotations/quotations.service.ts` — Conversion con Serie
- `apps/api/src/modules/fiscal/fiscal.service.ts` — Filtro serie fiscal en libro de ventas
- `apps/api/src/modules/cash-registers/cash-registers.service.ts` — Sin isFiscal, include serie
- `apps/api/src/modules/cash-registers/dto/create-cash-register.dto.ts` — Sin isFiscal
- `apps/web/src/components/sidebar.tsx` — Series en CONFIGURACION
- `apps/web/src/app/(dashboard)/sales/pos/page.tsx` — serie.isFiscal
- `apps/web/src/app/(dashboard)/sales/invoices/page.tsx` — serie.isFiscal
- `apps/web/src/app/(dashboard)/sales/invoices/[id]/page.tsx` — serie info y badge
- `apps/web/src/app/(dashboard)/credit-debit-notes/page.tsx` — serie.isFiscal
- `apps/web/src/app/(dashboard)/credit-debit-notes/[id]/page.tsx` — serie info y badge
- `apps/web/src/app/(dashboard)/cash/page.tsx` — serie.isFiscal
- `apps/web/src/app/(dashboard)/cash/[id]/page.tsx` — serie.isFiscal
- `apps/web/src/app/(dashboard)/settings/cash-registers/page.tsx` — serie info
- `apps/web/src/app/(dashboard)/settings/cash-registers/[id]/page.tsx` — serie info

## Sesion 47 — Modulo completo de reportes de ventas con PDF

### Backend (NestJS)
- **ReportsModule**: Nuevo modulo con 9 endpoints GET para reportes de ventas
  - `GET /reports/sales-by-period?from=&to=&groupBy=` — Ventas agrupadas por hora/dia/semana/mes con KPIs
  - `GET /reports/sales-by-seller?from=&to=&sellerId=` — Ventas por vendedor con top productos
  - `GET /reports/sales-by-customer?from=&to=&customerId=` — Ventas por cliente con CxC pendiente
  - `GET /reports/sales-by-product?from=&to=&categoryId=` — Ventas por producto con costo y margen
  - `GET /reports/comparison?period1From=&period1To=&period2From=&period2To=` — Comparativo entre 2 periodos
  - `GET /reports/profit-margin?from=&to=&categoryId=` — Margen de ganancia por producto
  - `GET /reports/top-customers?from=&to=&limit=` — Top clientes por monto
  - `GET /reports/peak-hours?from=&to=` — Horas pico de ventas (24 horas)
  - `GET /reports/sales-by-cash-register?from=&to=` — Ventas por caja registradora
  - PDF export para 5 reportes: sales-by-period, sales-by-seller, sales-by-customer, sales-by-product, profit-margin
  - PDFKit con layout landscape A4, header con nombre empresa y periodo, tablas formateadas

- **ReportsPdfService**: Servicio de generacion PDF con helpers reutilizables
  - `createDoc()`, `drawHeader()`, `drawTableHeader()`, `drawTableRow()`, `checkPage()`, `toBuffer()`
  - Columnas con alineacion derecha para montos, paginacion automatica

### Frontend (Next.js)
- **9 paginas de reportes** bajo `/reports/`:
  - `/reports/sales-period` — AreaChart con filtro groupBy, tabla 7 columnas, KPIs
  - `/reports/sales-seller` — BarChart por vendedor, dropdown de vendedores, tabla con devoluciones
  - `/reports/sales-customer` — Tabla ordenable con CxC pendiente, filtro por cliente
  - `/reports/sales-product` — BarChart horizontal top 10, margen% con colores (verde >30%, amarillo >15%, rojo)
  - `/reports/comparison` — Dos periodos lado a lado, BarChart comparativo, badges de variacion %
  - `/reports/profit-margin` — BarChart horizontal por margen%, celdas color-coded
  - `/reports/top-customers` — Tabla rankeada con selector de limite (10/20/50/100)
  - `/reports/peak-hours` — BarChart 24 horas con horas pico resaltadas en verde
  - `/reports/sales-cash` — BarChart por caja, badges de metodos de pago
  - Todas con: filtros de fecha, boton PDF, loading states, KPI cards
  - Graficos recharts con tema oscuro (tooltips slate-800, grids slate-700)

- **Sidebar**: 9 nuevos items bajo seccion REPORTES

### Archivos creados
- `apps/api/src/modules/reports/reports.module.ts`
- `apps/api/src/modules/reports/reports.controller.ts`
- `apps/api/src/modules/reports/reports.service.ts`
- `apps/api/src/modules/reports/reports-pdf.service.ts`
- `apps/web/src/app/(dashboard)/reports/sales-period/page.tsx`
- `apps/web/src/app/(dashboard)/reports/sales-seller/page.tsx`
- `apps/web/src/app/(dashboard)/reports/sales-customer/page.tsx`
- `apps/web/src/app/(dashboard)/reports/sales-product/page.tsx`
- `apps/web/src/app/(dashboard)/reports/comparison/page.tsx`
- `apps/web/src/app/(dashboard)/reports/profit-margin/page.tsx`
- `apps/web/src/app/(dashboard)/reports/top-customers/page.tsx`
- `apps/web/src/app/(dashboard)/reports/peak-hours/page.tsx`
- `apps/web/src/app/(dashboard)/reports/sales-cash/page.tsx`

### Archivos modificados
- `apps/api/src/app.module.ts` — Registro de ReportsModule
- `apps/web/src/components/sidebar.tsx` — 9 items de reportes en sidebar

## Sesion 46 — POS Mobile-first y vistas responsive

### Frontend (Next.js)
- **POS Mobile** (`/sales/pos`): Vista mobile completa detectada automaticamente en <768px
  - Vista Busqueda: header compacto con boton opciones, barra de busqueda prominente, grid 2 columnas de productos con stock check, boton flotante "Ver carrito" con conteo de items
  - Vista Carrito: seccion de cliente, items con controles [-/+] y eliminar, totales fijos en footer, boton "Cobrar $XX.XX" (o solo "Guardar pre-factura" para SELLER)
  - Bottom sheet de opciones: cliente, facturas en espera, cotizacion, caja, vendedor (solo ADMIN/SUPERVISOR)
  - Modales compartidos (renderSharedModals): Payment, Credit, Client, Pending Drawer, SeniatModal — todos full-screen en mobile, centrados en desktop
  - Deteccion via useState + resize listener, threshold 768px
  - NO crea URL separada — mismo /sales/pos renderiza version correcta

- **Bottom Navigation Mobile**: Barra de navegacion inferior para pantallas <768px
  - SELLER: POS, Facturas, Cotizaciones, Clientes, Mas
  - CASHIER: POS, Facturas, Pendientes, Caja, Mas
  - ADMIN/SUPERVISOR: Dashboard, POS, Facturas, Inventario, Mas
  - "Mas" abre el sidebar como drawer via CustomEvent
  - Boton hamburguesa oculto en mobile (reemplazado por bottom nav)
  - Integrado en dashboard layout, padding bottom ajustado

- **Listas mobile-friendly**: Invoices, Quotations, Customers
  - Cards en lugar de tabla en <768px con info clave (numero, cliente, total, estado, fecha)
  - Tabla original oculta con `hidden md:block`
  - Modales de detalle full-screen en mobile
  - Paginacion incluida en vista cards

- **Layout responsive**: Padding reducido en mobile (p-4 vs p-6/p-8), pb-20 para no ocultar contenido tras bottom nav

### Archivos modificados
- `apps/web/src/app/(dashboard)/sales/pos/page.tsx` — Mobile POS + shared modals
- `apps/web/src/components/mobile-bottom-nav.tsx` — NUEVO: bottom navigation mobile
- `apps/web/src/components/sidebar.tsx` — Escucha evento para abrir drawer, hamburguesa oculta en mobile
- `apps/web/src/app/(dashboard)/layout.tsx` — Bottom nav + padding responsive
- `apps/web/src/app/(dashboard)/sales/invoices/page.tsx` — Cards mobile + modal fullscreen
- `apps/web/src/app/(dashboard)/quotations/page.tsx` — Cards mobile + modal fullscreen
- `apps/web/src/app/(dashboard)/sales/customers/page.tsx` — Cards mobile

## Sesion 45 — Pagina de inicio para roles secundarios con accesos directos

### Backend (NestJS)
- **DashboardService.getHome()**: Nuevo metodo que retorna info rapida segun rol del usuario
  - `GET /dashboard/home`: Retorna tasa BCV del dia + datos especificos del rol
  - CASHIER: cajas abiertas (nombre, quien abrio, hora)
  - WAREHOUSE: top 5 productos bajo stock minimo, cantidad de transferencias pendientes
  - BUYER: total CxP vencidas con monto, pagos por vencer esta semana
  - ACCOUNTANT: totales CxC y CxP pendientes con conteo
  - AUDITOR: top 5 productos bajo stock minimo, ultimos 5 ajustes de inventario
  - Query raw SQL para low stock con HAVING para eficiencia

### Frontend (Next.js)
- **Pagina de inicio** (`/dashboard/home`): Nueva pagina para roles secundarios
  - Header con saludo personalizado, fecha actual, badge de rol coloreado, tasa BCV
  - Grid de 4 tarjetas de acceso rapido por rol con iconos, titulos, descripciones
    - CASHIER: POS, Facturas de hoy, Cajas, CxC
    - WAREHOUSE: Stock, Movimientos, Transferencias, Conteo fisico
    - BUYER: Facturas de compra, CxP, Programacion de pagos, Proveedores
    - ACCOUNTANT: CxC, CxP, Libro de ventas, Libro de compras
    - AUDITOR: Stock, Movimientos, Analisis ABC, Conteo fisico
  - Seccion inferior con info relevante por rol
  - Hover con efecto de escala, gradientes por rol, responsive grid
- **Dashboard principal** (`/dashboard`): Redireccion actualizada
  - ADMIN/SUPERVISOR → /dashboard (gerencial)
  - SELLER → /dashboard/seller
  - CASHIER, WAREHOUSE, BUYER, ACCOUNTANT, AUDITOR → /dashboard/home

## Sesion 44 — Dashboard del Vendedor mobile-first

### Backend (NestJS)
- **DashboardService.getVendedor()**: Nuevo metodo que retorna datos exclusivos del vendedor actual
  - `GET /dashboard/vendedor?from&to`: Busca Seller vinculado al userId del JWT, retorna 404 si no tiene
  - Datos: sales (con vsLastPeriod), pendingInvoices (pre-facturas sin cobrar), returns (NCVs del vendedor), topProducts (5 mas vendidos), salesTimeline (por hora/dia), receivables (CxC de facturas del vendedor)
  - Todas las queries filtradas por sellerId
  - Receivables se filtran via relacion Invoice.sellerId

### Frontend (Next.js)
- **Dashboard del Vendedor** (`/dashboard/seller`): Pagina mobile-first nueva
  - Header con saludo personalizado (Buenos dias/tardes/noches + nombre) y fecha actual
  - Selector de periodo compacto: Hoy / Semana / Mes (pills)
  - 2 tarjetas KPI: Mis Ventas (con gradiente esmeralda y vsLastPeriod), Facturas (con ticket promedio)
  - 2 tarjetas info: Pendientes (pre-facturas), Devoluciones (NCVs)
  - Grafico de area (recharts) ventas por hora/dia, altura 200px en movil
  - Tarjeta CxC con alerta de vencidas y boton "Ver detalle" a /receivables
  - Top 5 productos como lista con barras de progreso (sin grafico complejo en movil)
  - Responsive: columna unica en movil, max-w-3xl centrado
- **Dashboard Gerencial** (`/dashboard`): Agregada redireccion automatica
  - Si usuario es SELLER, redirige a /dashboard/seller via fetch /api/auth/me

## Sesion 43 — Dashboard Gerencial con KPIs, graficos y selector de periodo

### Backend (NestJS)
- **DashboardModule**: Nuevo modulo con controller y service
  - `GET /dashboard/gerencial?from&to`: Endpoint unico que retorna datos agregados del periodo
  - Comparacion automatica con periodo anterior de igual duracion (vsLastPeriod)
  - Queries en paralelo con Promise.all para performance
  - Secciones: sales, returns, salesBySeller, topProducts, cashSummary, expenses, receivables, payables, salesTimeline
  - Timeline inteligente: agrupa por hora (dia unico) o por dia (multiples dias)
  - CxC y CxP siempre retorna datos actuales, independiente del periodo seleccionado

### Frontend (Next.js)
- **Dashboard Gerencial** (`/dashboard`): Pagina completa reescrita
  - Selector de periodo: Hoy, Esta semana, Este mes, Personalizado (con date pickers)
  - 4 tarjetas KPI principales: Ventas USD, Facturas, Devoluciones, Ticket Promedio
  - Flechas de comparacion vs periodo anterior (verde arriba / rojo abajo)
  - Tarjetas CxC y CxP con badge "TIEMPO REAL" y alertas de vencidos
  - Grafico de ventas (AreaChart recharts): por hora o por dia segun periodo
  - Tabla de vendedores con barras de progreso y porcentaje de participacion
  - Top 5 productos (BarChart horizontal) con colores por producto
  - Resumen de caja: Ingresos, Egresos, Neto con desglose por metodo de pago
  - Seccion de gastos con barras por categoria y grafico comparativo Ingresos vs Gastos
  - Estados de carga (skeleton) y error con boton de reintento

### Correccion formato correlativo retenciones
- Cambiado de `RET-XXXX` a formato `YYYYMM` + 8 digitos secuenciales globales
- Ejemplo: `20260500000001`, `20260500000002`, etc.
- Secuencia global continua desde `CompanyConfig.retentionNextNumber`
- El prefijo YYYYMM cambia con el mes pero el correlativo nunca se reinicia

## Sesion 42 — Modulo de Comprobantes de Retencion IVA con integracion al Libro de Compras

### Migracion de base de datos
- `20260524200000_add_retention_voucher_module`: Crea enum RetentionStatus (PENDING/ISSUED/CANCELLED), tabla RetentionVoucher con campos id, number (unique), purchaseOrderId (unique FK), status, issueDate, retentionAmountUsd, retentionAmountBs, exchangeRate, notes, createdById (FK a User), timestamps. Agrega isRetentionLine (Boolean default false) y retentionVoucherId (FK opcional) a PurchaseBookEntry.

### Schema
- RetentionVoucher: nuevo modelo — comprobantes de retencion IVA vinculados 1:1 a PurchaseOrder
- RetentionStatus: nuevo enum (PENDING, ISSUED, CANCELLED)
- PurchaseBookEntry: nuevos campos isRetentionLine y retentionVoucherId para lineas de retencion
- PurchaseOrder: nueva relacion retentionVoucher (1:1)
- User: nueva relacion retentionVouchers

### Backend (NestJS)
- **RetentionVouchersModule**: Nuevo modulo con controller y service
  - `GET /retention-vouchers`: Lista comprobantes con filtros status, supplierId, from, to, paginacion
  - `GET /retention-vouchers/:id`: Detalle de un comprobante con relaciones
  - `PATCH /retention-vouchers/:id/issue`: Emite comprobante (cambia a ISSUED, crea PurchaseBookEntry con isRetentionLine=true y totalBs negativo)
  - `PATCH /retention-vouchers/:id/cancel`: Anula comprobante (elimina linea del libro si existia, cambia a CANCELLED)
  - `GET /retention-vouchers/:id/pdf`: Datos para PDF del comprobante
- **PurchaseOrdersService.process()**: Al procesar factura fiscal de proveedor agente de retencion, crea automaticamente RetentionVoucher en estado PENDING con monto calculado (75% del IVA por defecto). La retencion NO se agrega al libro hasta ser emitida.

### Frontend (Next.js)
- **Retenciones IVA** (`/purchases/retentions`): Nueva pagina
  - Contadores de estado: pendientes (amarillo), emitidos (verde), anulados (rojo)
  - Filtros: estado, fecha desde/hasta
  - Tabla: N° Retencion, Factura, Proveedor, Monto USD, Monto Bs, Fecha emision, Estado, Acciones
  - Modal de emision con selector de fecha
  - Modal de detalle con datos completos
  - Accion de anulacion con confirmacion
- **Detalle de compra** (`/purchases/[id]`): Seccion de retencion actualizada
  - Muestra datos del RetentionVoucher (numero, monto USD/Bs, fecha emision, estado)
  - Boton "Emitir" si estado PENDING, con modal para seleccionar fecha
  - Boton "Anular" si estado ISSUED
  - Estados con badges coloreados: Pendiente (amarillo), Emitido (verde), Anulado (rojo)
- **Libro de compras** (`/fiscal/libro-compras`): Lineas de retencion diferenciadas
  - Entradas con isRetentionLine=true se muestran con fondo purpura sutil
  - Sin datos de proveedor repetidos, solo muestra "↳ Retencion IVA" en columna proveedor
  - N° comprobante en color purpura, total en purpura (negativo)
  - Sin botones de editar/eliminar en lineas de retencion
  - PDF exportado tambien diferencia lineas de retencion visualmente
- **Sidebar**: Agregada entrada "Retenciones IVA" bajo seccion COMPRAS con icono Shield

## Sesion 41 — Libro de Compras con entradas editables, filtro por rango de fechas y resumen fiscal PDF

### Migracion de base de datos
- `20260524100000_add_purchase_book_entries`: Crea tabla PurchaseBookEntry con campos id, purchaseOrderId (FK opcional a PurchaseOrder), entryDate, supplierControlNumber, supplierInvoiceNumber, supplierName, supplierRif, exemptAmountBs, taxableBaseBs, ivaAmountBs, retentionVoucherNumber, retentionAmountBs, totalBs, isManual, notes, createdById (FK a User), timestamps

### Schema
- PurchaseBookEntry: nuevo modelo — registros independientes del libro de compras, vinculados opcionalmente a PurchaseOrder
- User: nueva relacion purchaseBookEntries
- PurchaseOrder: nueva relacion purchaseBookEntries

### Backend (NestJS)
- **PurchaseBookModule**: Nuevo modulo con controller y service
  - `GET /purchase-book?from&to`: Lista entradas del libro filtradas por rango de fechas en entryDate, ordenadas ASC, con totales agregados
  - `POST /purchase-book`: Crear entrada manual (isManual=true) para facturas que el contador agrega directamente sin factura de compra
  - `PATCH /purchase-book/:id`: Editar cualquier campo de una entrada, no afecta la factura de compra original
  - `DELETE /purchase-book/:id`: Eliminar entrada (solo ADMIN)
  - `GET /purchase-book/pdf?from&to`: Genera datos para PDF con tabla completa + resumen fiscal del periodo
- **PurchaseOrdersService.process()**: Al procesar una factura de compra fiscal, crea automaticamente un PurchaseBookEntry con los datos de la factura convertidos a Bs usando la tasa de la factura. Incluye retencion IVA calculada de IvaRetention documents.
- **FiscalService.libroCompras()**: Actualizado para leer desde PurchaseBookEntry en vez de PurchaseOrder directamente, manteniendo compatibilidad con el resumen fiscal existente

### Frontend (Next.js)
- **Libro de compras** (`/fiscal/libro-compras`): Rediseno completo
  - Filtros: Date pickers "Desde" y "Hasta" reemplazan selector mes/ano
  - Botones rapidos: "Este mes", "Quincena 1 (1-15)", "Quincena 2 (16-fin)", "Mes anterior"
  - Tabla: columnas N°, Fecha, N° Control, N° Factura, Proveedor, RIF, Exento Bs, Base Imp. Bs, Cred. Fiscal Bs, N° Comp., Ret. IVA Bs, Total Bs, Acciones
  - Badges: MANUAL (amarillo) para entradas creadas manualmente, AUTO (azul) para entradas desde facturas de compra
  - Fila de totales al pie con sumas de cada columna numerica
  - Boton editar (lapiz) por fila, abre modal de edicion con todos los campos
  - Boton eliminar (basura) por fila con confirmacion
  - Boton "+ Agregar entrada manual" abre modal vacio para crear entrada directa
  - Modal con campos: fecha, N° control, N° factura, proveedor, RIF, exento Bs, base imponible Bs, credito fiscal Bs, N° comprobante retencion, retencion Bs, total Bs, notas
  - Nota al pie del modal: "Los cambios en el libro no afectan la factura de compra original"
  - Boton "Exportar PDF": genera PDF con tabla completa + segunda pagina con resumen fiscal del periodo (compras exentas, base imponible, credito fiscal, retenciones IVA, credito fiscal neto, total compras)

## Sesion 40 — Rediseno modulo de compras como Facturas de Compra

### Migracion de base de datos
- `20260522200000_redesign_purchase_bill_module`: Recrea enum PurchaseStatus (PENDING/PROCESSED/CANCELLED reemplaza DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED), agrega 18 campos a PurchaseOrder (purchaseNumber, supplierSerialNumber, supplierInvoiceNumber, discountGlobal%, subtotal, exemptAmount, taxableBase, totalIva, totalSurcharge, retentionVoucherNumber, responsibleId, processedAt, warehouseId), agrega 5 campos a PurchaseOrderItem (discountPct, discountUsd, discountBs, netCostUsd, netCostBs), backfill de datos existentes

### Schema
- PurchaseStatus: cambia de DRAFT/SENT/PARTIAL/RECEIVED/CANCELLED a PENDING/PROCESSED/CANCELLED
- PurchaseOrder: nuevos campos purchaseNumber (Int, correlativo), supplierSerialNumber, supplierInvoiceNumber, discountGlobalPct/Usd/Bs, subtotalUsd/Bs, exemptAmountUsd/Bs, taxableBaseUsd/Bs, totalIvaUsd/Bs, totalSurchargeUsd/Bs, retentionVoucherNumber, responsibleId (relacion User), processedAt, warehouseId (relacion Warehouse)
- PurchaseOrderItem: nuevos campos discountPct, discountUsd, discountBs, netCostUsd, netCostBs
- User: nueva relacion purchaseBills
- Warehouse: nueva relacion purchaseBills

### Backend (NestJS)
- **PurchaseOrdersController**: Ruta cambia de `/purchase-orders` a `/purchases`, nuevos endpoints POST `:id/process` y PATCH `:id/cancel`, eliminados changeStatus y receive
- **PurchaseOrdersService**: Reescritura completa
  - `generatePurchaseNumber(tx)`: Correlativo FC-XXXXX con SELECT FOR UPDATE
  - `calculateItemValues()`: Calcula descuentos por linea, neto USD/Bs
  - `calculateFiscalTotals()`: Subtotal, descuento global prorrateado, exento, base imponible, IVA total, recargo, total con conversion dual USD/Bs
  - `create()`: Transaccion con purchaseNumber, items con descuentos, distribucion de recargos, totales fiscales precalculados, status PENDING
  - `process()`: Verifica PENDING, actualiza inventario (skip servicios), crea StockMovement, actualiza costo/precios producto, crea Payable si credito (con retenciones IVA/ISLR)
  - `cancel()`: Solo permite cancelar PENDING
  - `findAll()`: Filtra por invoiceDate, incluye responsible y payables
  - `update()`: Recalcula items y totales fiscales
  - `getSuggestedPrices()`: Usa netCostUsd en vez de costUsd
- **CreatePurchaseOrderDto**: Nuevos campos supplierSerialNumber, supplierInvoiceNumber, receivedDate, warehouseId, discountGlobalPct, retentionVoucherNumber, discountPct en items
- **ProcessPurchaseBillDto**: Reemplaza ReceivePurchaseOrderDto, contiene opcional priceUpdates[]
- **FiscalService.libroCompras()**: Filtra por PROCESSED y invoiceDate, usa campos precalculados (exemptAmountUsd, taxableBaseUsd, totalIvaUsd), retorna purchaseNumber, comprasExentas, baseImponible, creditoFiscal, comprobanteRetencion, retencionIva
- **FiscalService.resumen()**: Actualizado para usar nuevos nombres de campos

### Frontend (Next.js)
- **Sidebar**: "Ordenes de compra" renombrado a "Facturas de compra"
- **Lista compras** (`/purchases`): Nuevas columnas (N° Doc, N° Factura prov., Proveedor, Fecha, Total USD, Estado), badges PENDING/PROCESSED/CANCELLED, accion cancelar via PATCH
- **Nueva factura** (`/purchases/new`): Grid 3x4 header (proveedor, moneda, tasa, almacen, fechas, credito, numeros fiscales, responsable), tabla items con descuento por linea + IVA + badge servicio, footer fiscal (descuento global, recargo, exento, base imponible, IVA, total USD/Bs, retenciones), modal actualizacion precios, botones guardar/procesar/cancelar
- **Detalle factura** (`/purchases/[id]`): 3 tabs (Informacion General con items y totales fiscales, Cuenta por pagar lazy, Notas Cr/Db lazy), modal procesar con comparacion precios
- **Libro de compras** (`/fiscal/libro-compras`): Columnas actualizadas a nuevo formato (N° Doc, N° Factura Prov., Compras Exentas, Base Imponible, Credito Fiscal, Comp. Retencion, Ret. IVA)
- **Pagina edit eliminada**: `/purchases/[id]/edit` removida (edicion se hace desde detalle)
- **Referencias actualizadas**: Todas las paginas que referenciaban `/api/proxy/purchase-orders` actualizadas a `/api/proxy/purchases`, labels actualizados en suppliers, payables, credit-debit-notes, config, products

## Sesion 39 — Analisis de Inventario ABC con rotacion, rentabilidad y sugerencias de compra

### Backend (NestJS)
- **InventoryAnalysisModule**: Nuevo modulo con controller y service
  - `GET /inventory-analysis/abc?from&to`: Clasificacion ABC — calcula ventas por producto en el periodo, ordena por ventas DESC, clasifica A (80%), B (95%), C (resto), incluye stock, costo, margen, valor inventario
  - `GET /inventory-analysis/rotation?from&to`: Rotacion de inventario — rotationRate, daysOfInventory, dailySalesAvg, alertas (stock bajo, stock muerto, exceso >180 dias)
  - `GET /inventory-analysis/profitability?from&to`: Rentabilidad — revenue, cost, grossProfit, grossMarginPct por producto
  - `GET /inventory-analysis/summary?from&to`: Resumen ejecutivo — totales por clase ABC, valor inventario, alertas, top producto, mas rentable
  - `GET /inventory-analysis/purchase-suggestions?from&to`: Sugerencias de compra — productos bajo minStock, cantidad sugerida (30 dias), agrupado por proveedor
- **StockMovementsController**: Nuevo endpoint `GET /stock-movements/kardex/:productId` con balance acumulado computado

### Frontend (Next.js)
- **Analisis de inventario** (`/purchases/analysis`):
  - Selector de periodo: 30/60/90 dias o personalizado con date pickers
  - 4 tarjetas resumen: productos analizados, valor inventario, alertas stock, stock muerto
  - Tab "Clasificacion ABC": grafico barras + pie chart distribucion, tabla con clase/codigo/producto/ventas/margen, filtro por clase
  - Tab "Rotacion": tabla con stock/ventas/rotacion/dias inventario/alertas, badges de alerta (Stock bajo, Exceso, Sin movimiento), filtro solo alertas
  - Tab "Rentabilidad": grafico barras horizontal top 10, tabla con ventas/costo/ganancia/margen con totales al pie
  - Tab "Sugerencias de compra": agrupado por proveedor, boton "Crear orden" por proveedor, total inversion estimada
- **Sidebar**: Entrada "Analisis ABC" bajo COMPRAS con icono BarChart3

## Sesion 38 — Mejoras modulo de compras: recargos, servicios, precios editables y kardex

### Migracion de base de datos
- `20260521200000_improve_purchase_order_module`: Agrega `isService` a Product, nuevos campos a PurchaseOrder (invoiceDate, receivedDate, currency, surchargeUsd, surchargeDistribution, totalWithSurchargeUsd), cambia exchangeRate default a 1, agrega stockAfter y costUsd no-nullable a StockMovement

### Schema
- Product: nuevo campo `isService Boolean @default(false)` — productos tipo servicio no manejan inventario
- PurchaseOrder: nuevos campos `invoiceDate DateTime?`, `receivedDate DateTime?`, `currency String @default("USD")`, `surchargeUsd Float @default(0)`, `surchargeDistribution String @default("PROPORTIONAL")`, `totalWithSurchargeUsd Float @default(0)`, `exchangeRate` cambia default de 0 a 1
- StockMovement: `costUsd` cambia de `Float?` a `Float @default(0)`, nuevo campo `stockAfter Float @default(0)`

### Backend (NestJS)
- **ProductsService.search()**: Incluye `isService` en query y response
- **CreateProductDto**: Nuevo campo `isService?: boolean`
- **CreatePurchaseOrderDto**: Nuevos campos `invoiceDate`, `currency` (USD/BS), `exchangeRate`, `surchargeUsd`, `surchargeDistribution` (PROPORTIONAL/EQUAL)
- **ReceivePurchaseOrderDto**: Nuevo campo `receivedDate?: string`
- **PurchaseOrdersService.create()**: Soporta moneda BS (convierte a USD dividiendo por tasa), calcula y distribuye recargos (proporcional o equitativo, excluyendo servicios)
- **PurchaseOrdersService.update()**: Misma logica de conversion y recargos que create
- **PurchaseOrdersService.findOne()**: Incluye isService, gananciaPct, gananciaMayorPct, ivaType, bregaApplies del producto
- **PurchaseOrdersService.findAll()**: Incluye isService en producto
- **PurchaseOrdersService.receive()**: Usa receivedDate, busca tasa para esa fecha, skip stock/movements para isService, calcula stockAfter (suma total entre almacenes), guarda receivedDate
- **PurchaseOrdersService.getSuggestedPrices()**: Nuevo endpoint — retorna comparacion de costos y precios sugeridos para items no-servicio
- **PurchaseOrdersService.updatePrices()**: Nuevo endpoint — actualiza ganancia% y recalcula precios por producto
- **PurchaseOrdersController**: Nuevos endpoints `GET :id/suggested-prices`, `PATCH :id/update-prices`
- **StockMovementsService**: Ordena ASC cuando filtra por productId (kardex), DESC para listado general

### Frontend (Next.js)
- **Nuevo producto** (`/catalog/products/new`): Toggle `isService` con descripcion explicativa
- **Detalle producto** (`/catalog/products/[code]`):
  - Info tab: toggle isService, badge SERVICIO en header
  - Movimientos tab (Kardex): nuevas columnas "Costo unit." y "Stock despues", colores verde/rojo para entradas/salidas, totales de pagina al pie
  - Precios tab: completamente rediseñada — editable con ganancia% ↔ precio bidireccional, formula inversa, boton "Guardar precios"
- **Nueva compra** (`/purchases/new`): Fecha factura, selector moneda USD/BS, tasa de cambio, conversion automatica, seccion de recargos (monto + distribucion), items muestran badge SERVICIO, recargo por item y costo final
- **Editar compra** (`/purchases/[id]/edit`): Reescrita con mismos campos que nueva compra, carga valores existentes
- **Detalle compra** (`/purchases/[id]`):
  - Info tab: muestra fecha factura, fecha recepcion, moneda, tasa, info de recargos, badges servicio
  - Recepciones tab: columna "Stock despues"
  - Modal recepcion rediseñado con dos tabs: "Confirmar recepcion" (almacen + fecha + items) y "Actualizar precios de venta" (tabla comparativa con ganancia%/precio editable bidireccional)
  - Dos botones: "Recibir sin actualizar precios" y "Aplicar precios y recibir"

## Sesion 37 — Movimientos manuales de caja con clave dinamica y gastos desde caja

### Migracion de base de datos
- `20260521100000_add_cash_movements_and_expense_payment`: Agrega enum `CashMovementType` (INCOME, EXPENSE), modelo `CashMovement` con relaciones a CashSession/User/Expense, agrega `MANUAL_CASH_MOVEMENT` a DynamicKeyPerm, agrega campos `cashSessionId`, `methodId`, `cashMovement` a Expense

### Schema
- CashMovement: nuevo modelo con id, cashSessionId, type, amountUsd, amountBs, exchangeRate, currency, reason, isManual, expenseId (unique), dynamicKeyId, createdById, createdAt
- Expense: nuevos campos opcionales `cashSessionId`, `methodId`, relacion `cashMovement`
- CashSession: nueva relacion `cashMovements[]` y `expenses[]`

### Backend (NestJS)
- **CashMovementsModule**: Nuevo modulo con controller, service y DTO
  - `GET /cash-movements?cashSessionId=`: Lista movimientos de una sesion
  - `POST /cash-movements`: Crea movimiento manual con validacion de clave dinamica (MANUAL_CASH_MOVEMENT), verificacion de sesion abierta, calculo dual USD/Bs
- **ExpensesService.create()**: Si se recibe `cashSessionId`, valida sesion abierta y crea CashMovement de tipo EXPENSE con `isManual=false` vinculado al gasto (transaccion Prisma)
- **CashRegistersService.getSessionSalesData()**: Ahora incluye movimientos de caja en el resumen: `cashMovements[]`, `movementsIncomeUsd/Bs`, `movementsExpenseUsd/Bs`, `salesTotalUsd/Bs` separado del `totalUsd/Bs` neto

### Frontend (Next.js)
- **Sesion de caja** (`/cash/[id]`):
  - Boton "Movimiento manual" en barra de acciones
  - Modal con selector Ingreso/Egreso, monto + moneda, razon, y campo de clave dinamica
  - Tabla de movimientos con badges de color: MANUAL (amarillo), GASTO (naranja)
  - Resumen actualizado: "Ventas del dia" separado de "Movimientos de caja" y "Balance neto"
- **Gastos** (`/expenses`):
  - Modal rediseñado con tabs: "Informacion" (campos existentes) y "Pago desde caja" (selector de sesion abierta + metodo de pago)
  - Al vincular gasto a caja, se crea movimiento de egreso automatico
- **Claves dinamicas** (`/settings/dynamic-keys`): Agregado label `MANUAL_CASH_MOVEMENT: 'Movimiento manual caja'`

## Sesion 36 — Consulta SENIAT automatica via proxy backend

### Backend (NestJS)
- **CustomersService.getSeniatCaptcha()**: Endpoint proxy que hace GET a SENIAT para obtener cookie de sesion, luego descarga la imagen del captcha con esa cookie. Almacena la cookie en un Map en memoria (auto-limpieza 5min). Retorna `{ sessionId, captchaBase64 }`.
- **CustomersService.lookupSeniat()**: Recibe sessionId + RIF + captcha, recupera la cookie almacenada, hace POST a SENIAT con los datos del formulario, parsea el HTML de respuesta con `parseSeniatHtml()`. Retorna datos estructurados (name, documentType, documentNumber).
- **CustomersController**: Nuevos endpoints `GET /customers/seniat-captcha` y `POST /customers/seniat-lookup`
- Usa modulo `http` de Node.js para las peticiones (SENIAT es HTTP, no HTTPS)
- Decodifica respuesta como latin1 (windows-1252) ya que SENIAT usa ese charset

### Frontend (Next.js)
- **SeniatModal** (`/components/seniat-modal.tsx`): Componente reutilizable con:
  - Campo RIF con pre-llenado desde el formulario padre
  - Imagen de captcha cargada via proxy backend
  - Boton de recarga de captcha
  - Busqueda que llama al backend y auto-llena el formulario padre con los datos
  - Manejo de errores con recarga automatica de captcha para reintentar
- **Nuevo cliente** (`/sales/customers/new`): Reemplazado popup SENIAT + polling localStorage por SeniatModal
- **Detalle cliente** (`/sales/customers/[id]`): Mismo cambio
- **POS** (`/sales/pos`): Mismo cambio — openSeniatFromPos() reemplazado por SeniatModal

### Eliminado
- Toda la logica de `window.open()` + `localStorage.setItem('seniat_result')` + `setInterval` polling que nunca funcionaba (problema de cross-origin entre SENIAT y localhost)

## Sesion 35 — Manejo de vuelto en pagos USD con cambio en Bs (Completada)

### Migracion de base de datos
- `20260521000000_add_change_management_to_payments`: Agrega `totalPaidUsd` y `changeBs` a Invoice, `changeAmountBs` y `changeMethodId` a Payment con relacion a PaymentMethod

### Schema
- Invoice: nuevos campos `totalPaidUsd Float @default(0)`, `changeBs Float @default(0)`
- Payment: nuevos campos `changeAmountBs Float @default(0)`, `changeMethodId String?`, relacion `changeMethod PaymentMethod?`
- PaymentMethod: nueva relacion `changePayments Payment[] @relation("ChangeMethod")`

### Backend (NestJS)
- **InvoicesService.pay()**: Calcula vuelto cuando pagos en divisas (isDivisa=true) exceden el total de la factura. changeUsd = totalPaidDivisaUsd - totalFactura, changeBs = changeUsd × tasa. Valida que changeMethodId sea proporcionado y no sea divisa. Guarda totalPaidUsd y changeBs en Invoice, changeAmountBs y changeMethodId en Payment. Omite ajuste de ultimo pago cuando hay sobrepago.
- **PayInvoiceDto**: Nuevo campo opcional `changeMethodId?: string`
- **InvoicesService.findOne()**: Include de payments actualizado para cargar relacion `changeMethod`
- **CashRegistersService.getSessionSalesData()**: Agrega tracking de vueltos (changeOutflows) con numero de factura, monto y metodo. Retorna `changeOutflows[]` y `totalChangeBs` en el summary de sesion.

### Frontend (Next.js)
- **POS** (`/sales/pos`):
  - Calculo en tiempo real de vuelto: totalPaidDivisaUsd vs grandTotalUsd
  - Seccion "Vuelto" con fondo amarillo mostrando: $X.XX × tasa Bs/$ = Bs X.XX
  - Selector de metodo de vuelto (solo metodos isDivisa=false)
  - Boton confirmar deshabilitado si hay vuelto y no se selecciono metodo
  - Envia changeMethodId al backend en el body del pago
- **Detalle factura** (`/sales/invoices/[id]`):
  - Si changeBs > 0, muestra barra amarilla en tab Pagos con "Total recibido USD" y "Vuelto dado: Bs X.XX (metodo)"
  - Interfaces actualizadas con totalPaidUsd, changeBs, changeAmountBs, changeMethod
- **Arqueo de caja** (`/cash/[id]`):
  - Seccion "Vueltos (egresos)" en el sidebar de resumen de sesion
  - Lista cada vuelto con numero de factura y monto negativo en Bs
  - Total de vueltos al final de la seccion

## Sesion 34 — Integración fiscal directa por Web Serial (Completada)

### Mejoras en apps/web/src/lib/fiscal-printer.ts
- **MEJORA 1 — Leer S1 directo del puerto serial:** Nueva función `readStatusS1()` lee el número fiscal, serial de máquina y RIF directamente del puerto serial después de imprimir, eliminando la dependencia de `C:/IntTFHKA/Status.txt`
- **MEJORA 2 — Detectar modelo con SV:** Nueva función `detectPrinterModel()` identifica automáticamente el modelo de impresora (HKA80, HKA112, SRP-350, etc.) y su familia (A o B) al conectar
- **MEJORA 3 — Validar LRC:** Nueva función `validateLRC()` verifica la integridad de todas las tramas recibidas, con reintento automático (NAK + retry) en caso de corrupción
- **MEJORA 4 — Polling con ENQ:** Nueva función `waitForReady()` verifica que la impresora esté lista antes de cada operación, con detección de errores (sin papel, error mecánico, memoria llena)
- **MEJORA 5 — Detección de navegador:** Nueva función `isFiscalPrinterSupported()` verifica Web Serial API y contexto seguro (HTTPS/localhost)
- Nueva clase `SerialIO` con buffer para lectura robusta de bytes fragmentados del puerto serial
- Nueva función `sendReadCommand()` implementa flujo tipo 2 (comando de lectura simple) del protocolo The Factory
- `sendToFiscalPrinter()` ahora retorna `FiscalStatusResult | null` con los datos fiscales leídos del S1

### Integración en frontend
- **POS** (`/sales/pos`): 2 puntos de integración actualizados — ya no llaman a `readFiscalStatus()` del trinity-agent, usan directamente el retorno de `sendToFiscalPrinter(commands, comPort, true)`
- **Notas de crédito** (`/credit-debit-notes/[id]`): 2 puntos de integración actualizados — mismo cambio
- `trinity-agent.ts`: eliminada la función `readFiscalStatus()` — solo queda `isAgentRunning()` y `printTicket()` para tickets térmicos

### Limpieza del agent
- `apps/agent/src/fiscal.ts`: eliminada la lógica de lectura de `Status.txt`
- `apps/agent/src/server.ts`: eliminado endpoint `GET /status`, eliminada importación de `readFiscalStatus`, versión actualizada a 1.1.0
- `apps/agent/src/config.ts`: eliminados campos `fiscalEnabled` y `fiscalStatusPath` del tipo `AgentConfig`
- `apps/agent/config.json`: eliminados campos `fiscalEnabled` y `fiscalStatusPath`
- `apps/agent/README.md`: actualizado para reflejar que la comunicación fiscal es via Web Serial

## Sesion 33 — Cliente por defecto, notas en recibos y saldo a favor (Completada)

### Migracion de base de datos
- `20260516250000_add_missing_tables`: Crea tablas faltantes (CreditDebitNote, CreditDebitNoteItem, PrintArea, PrintJob, PriceAdjustmentLog) que existian via db push pero sin migracion
- `20260517200000_add_default_customer_config`: Agrega `isDefault` a Customer y `defaultCustomerId` a CompanyConfig

### Schema
- Customer: nuevo campo `isDefault Boolean @default(false)`
- CompanyConfig: nuevo campo `defaultCustomerId String?`

### Backend (NestJS)
- **InvoicesService.create()**: Auto-asigna `defaultCustomerId` de CompanyConfig cuando no se proporciona cliente
- **InvoicesService.pay()**: Soporte para metodo `pm_saldo_favor` — consume NCV (notas de credito venta) no aplicadas del cliente, marcando `appliedAt`
- **CustomersService.getCreditBalance()**: Nuevo metodo que calcula saldo a favor del cliente basado en NCV POSTED sin aplicar
- **CustomersController**: Nuevo endpoint `GET /customers/:id/credit-balance`
- **UpdateCompanyConfigDto**: Nuevo campo `defaultCustomerId?: string | null`

### Frontend (Next.js)
- **Config page** (`/config`):
  - Nueva seccion "Cliente por defecto" con combobox de busqueda
  - Muestra cliente seleccionado con badge verde
  - Busqueda con debounce y dropdown de resultados
  - Guarda `defaultCustomerId` en CompanyConfig
- **Receipts** (`/receipts/new`):
  - Fix: NCV/NDV ahora aparecen en documentos pendientes al crear recibo
  - Merge de `json.notes` con `json.receivables` en fetchPendingDocs
  - Correccion de logica de signo para notas (NCV=-1, NDV=+1)
  - Inclusion de `creditDebitNoteId` en payload de creacion
- **POS** (`/sales/pos`):
  - Fetch automatico de saldo a favor al seleccionar cliente
  - Badge verde junto al nombre del cliente mostrando saldo disponible
  - Banner en modal de pago con boton "Usar saldo" que agrega pago tipo `pm_saldo_favor`
  - Monto auto-calculado como minimo entre saldo y monto pendiente

### Seed
- Nuevo cliente por defecto: `***CLIENTE FINAL***` (isDefault: true)
- CompanyConfig actualizado con `defaultCustomerId`
- Nuevo metodo de pago: "Saldo a Favor" (id: `pm_saldo_favor`, sortOrder: 99)

## Sesion 32 — Sistema de Claves Dinamicas de Autorizacion (Completada)

### Migracion de base de datos
- Nuevo enum: `DynamicKeyPerm` (13 permisos: DELETE_CREDIT_NOTE_SALE, DELETE_DEBIT_NOTE_SALE, DELETE_CREDIT_NOTE_PURCHASE, DELETE_DEBIT_NOTE_PURCHASE, DELETE_RECEIPT_COLLECTION, DELETE_RECEIPT_PAYMENT, DELETE_EXPENSE, MODIFY_PRODUCT_PRICE, CANCEL_CASH_SESSION, CHANGE_EXCHANGE_RATE, MANUAL_STOCK_ADJUSTMENT, GIVE_DISCOUNT, ALLOW_CREDIT_INVOICE)
- Nuevos modelos: `DynamicKey`, `DynamicKeyPermission`, `DynamicKeyLog`
- DynamicKey: name, keyHash (bcrypt), isActive, relacion con User
- DynamicKeyPermission: dynamicKeyId + permission (DynamicKeyPerm), unique constraint
- DynamicKeyLog: dynamicKeyId, permission, action, entityType, entityId, createdAt
- Relacion: User → dynamicKeys
- Migracion: `add_dynamic_keys_system`

### Backend (NestJS)
- Nuevo modulo: `DynamicKeysModule` con controller, service, DTOs
- DTOs: CreateDynamicKeyDto, UpdateDynamicKeyDto, ValidateKeyDto
- Endpoints (solo ADMIN excepto validate):
  - `GET /dynamic-keys` — lista claves con permisos, logCount, createdBy (sin hash)
  - `GET /dynamic-keys/:id/logs` — historial de uso con filtros from/to, paginacion
  - `POST /dynamic-keys` — crear clave (hashea con bcrypt, crea permisos en transaccion)
  - `PATCH /dynamic-keys/:id` — editar nombre, permisos, clave opcional (transaccion: borra permisos viejos + recrea)
  - `PATCH /dynamic-keys/:id/toggle-active` — activar/desactivar
  - `DELETE /dynamic-keys/:id` — eliminar clave
  - `POST /dynamic-keys/validate` — validar clave (abierto a autenticados): itera claves activas, bcrypt.compare, verifica permiso, crea log, retorna { authorized, keyName } o 401
- Registrado en AppModule

### Frontend (Next.js)
- Componente reutilizable: `DynamicKeyModal` (apps/web/src/components/dynamic-key-modal.tsx)
  - Props: isOpen, onClose, onAuthorized, permission, title, description, entityType, entityId, action
  - Campo password con toggle mostrar/ocultar, autoFocus
  - Llama POST /dynamic-keys/validate, ejecuta onAuthorized() si autorizado
  - Muestra error y limpia campo si falla
- Pagina `/settings/dynamic-keys` — Gestion de claves:
  - Tabla: Nombre, Permisos (badges), Estado (Activa/Inactiva), Creada por, Usos, Acciones
  - Acciones: Editar, Activar/Desactivar, Ver logs, Eliminar
  - Modal crear/editar: nombre, clave (password, opcional en edicion), grid checkboxes permisos en espanol
- Pagina `/settings/dynamic-keys/[id]/logs` — Historial de uso:
  - Filtros: rango de fechas
  - Tabla: Fecha, Permiso usado, Accion, Tipo registro, ID registro
  - Paginacion 20 por pagina
- Sidebar: nueva entrada "Claves de autorizacion" (KeyRound) bajo CONFIGURACION
- Integracion del modal en acciones protegidas:
  - `/credit-debit-notes/[id]`: boton "Anular" abre DynamicKeyModal con permiso segun tipo (NCV→DELETE_CREDIT_NOTE_SALE, NDV→DELETE_DEBIT_NOTE_SALE, NCC→DELETE_CREDIT_NOTE_PURCHASE, NDC→DELETE_DEBIT_NOTE_PURCHASE)
  - `/receipts/[id]`: boton "Cancelar" abre DynamicKeyModal con DELETE_RECEIPT_COLLECTION o DELETE_RECEIPT_PAYMENT segun tipo
  - `/expenses`: boton "Eliminar" abre DynamicKeyModal con DELETE_EXPENSE

## Sesion 31 — Separar tipo de pago del estado en facturas (Completada)

### Migracion de base de datos
- Nuevo enum: `InvoicePaymentType` (CASH, CREDIT)
- Nuevo campo: `Invoice.paymentType` con default CASH
- Enum `InvoiceStatus` actualizado: eliminados DRAFT, PARTIAL, CREDIT; renombrado PARTIALLY_RETURNED a PARTIAL_RETURN
- Estados finales: PENDING, PAID, PARTIAL_RETURN, RETURNED, CANCELLED
- Migracion de datos existentes:
  - CREDIT → PAID + paymentType=CREDIT
  - DRAFT → PENDING
  - PARTIALLY_RETURNED → PARTIAL_RETURN
  - PARTIAL → PENDING
- Migracion: `separate_invoice_payment_type_from_status`

### Backend (NestJS)
- `InvoicesService`:
  - `create()`: siempre status=PENDING (eliminado DRAFT)
  - `pay()`: status=PAID + paymentType=CASH/CREDIT (ya no usa status=CREDIT)
  - `cancel()`: valida solo PENDING (eliminado DRAFT)
  - `retake()`, `updateItems()`, `delete()`: valida solo PENDING
  - `findAll()`: nuevo filtro `?paymentType=`
  - `findPending()`: solo filtra PENDING
- `InvoicesController`: nuevo query param `paymentType`
- `CreditDebitNotesService`:
  - NCV MANUAL y NDV: valida `paymentType=CREDIT` en vez de `status=CREDIT`
  - NCV MERCHANDISE: permite PAID y PARTIAL_RETURN
  - Post: actualiza a RETURNED o PARTIAL_RETURN
- `CashRegistersService`: filtros cambiados de `{ in: ['PAID','CREDIT'] }` a `'PAID'`
- `FiscalService`: libro de ventas filtra `status='PAID'`, incluye `tipoPago` en response
- `CustomersService`: filtro de facturas activas actualizado
- `QuotationsService`: conversion a factura siempre status=PENDING

### Frontend (Next.js)
- `/sales/invoices` (lista):
  - Nuevos STATUS_COLORS/LABELS: PENDING=amarillo, PAID=verde, PARTIAL_RETURN=naranja, RETURNED=rojo, CANCELLED=gris
  - Nuevo badge de tipo de pago separado: CASH=azul "Contado", CREDIT=morado "Credito"
  - Ambos badges mostrados juntos en tabla
  - Nuevo filtro dropdown "Tipo de pago" (CASH/CREDIT) separado del filtro de estado
- `/sales/invoices/[id]` (detalle):
  - Badges de estado y tipo de pago separados en header
  - Botones actualizados:
    - "Devolver factura" → status=PAID + paymentType=CASH
    - "Devolver mercancia" → status=PAID + paymentType=CREDIT
    - "Nota de credito" → paymentType=CREDIT
    - "Nota de debito" → paymentType=CREDIT
- `/sales/customers/[id]`: badges actualizados con nuevos estados
- `/fiscal/libro-ventas`: nueva columna "Tipo" (Contado/Credito) en tabla y PDF

## Sesion 30 — Modulo de Programacion de Pagos (Completada)

### Migracion de base de datos
- Nuevos modelos: `PaymentSchedule`, `PaymentScheduleItem`
- Nuevo enum: `PaymentScheduleStatus` (DRAFT, APPROVED, EXECUTED, CANCELLED)
- Campo `budgetCurrency` para seleccion USD/Bs del presupuesto
- Relaciones: User → paymentSchedules, Payable → paymentScheduleItems, CreditDebitNote → paymentScheduleItems
- Migracion: `add_payment_schedule_module`

### Backend (NestJS)
- Nuevo modulo: `PaymentSchedulesModule` con controller, service, PDF service
- Endpoints:
  - `GET /payment-schedules` — lista con filtros (status, from, to, search, page, limit)
  - `GET /payment-schedules/:id` — detalle con items agrupados por proveedor
  - `POST /payment-schedules` — crear programacion (numeracion PSC-0001, tasa del dia, presupuesto USD/Bs)
  - `POST /payment-schedules/:id/items` — agregar CxP o NDC a la programacion
  - `DELETE /payment-schedules/:id/items/:itemId` — eliminar item (solo DRAFT/APPROVED)
  - `PATCH /payment-schedules/:id/items/:itemId` — editar monto planificado
  - `PATCH /payment-schedules/:id/status` — cambiar estado (DRAFT→APPROVED→EXECUTED, solo ADMIN/SUPERVISOR)
  - `GET /payment-schedules/:id/pdf` — generar PDF A4 agrupado por proveedor
  - `GET /payment-schedules/pending-payables` — documentos disponibles (CxP PENDING/PARTIAL + NDC POSTED sin aplicar)
- Validaciones: monto no excede saldo, documento no duplicado, transiciones de estado validas
- Recalculo automatico de totales USD/Bs al agregar/editar/eliminar items
- Presupuesto en USD o Bs con conversion automatica usando tasa del dia

### Frontend (Next.js)
- Nueva entrada en sidebar bajo CxP: "Programacion de pagos" → /payment-schedules
- Pagina `/payment-schedules` — Lista:
  - Tabla: Numero, Titulo, Total USD, Total Bs, Presupuesto, Estado (badge coloreado), Creado por, Fecha, Items
  - Filtros: estado, busqueda por numero/titulo
  - Paginacion, click en fila navega al detalle
- Pagina `/payment-schedules/new` — Crear:
  - Campo titulo, presupuesto con toggle USD/Bs y conversion automatica, notas
  - Muestra tasa del dia y equivalente en la otra moneda
- Pagina `/payment-schedules/[id]` — Detalle:
  - Header: numero, titulo, estado badge, botones segun estado (Aprobar, Ejecutar, Cancelar, PDF)
  - Panel informativo: fecha, tasa, creador, cantidad de documentos
  - Panel resumen: presupuesto (moneda elegida + equivalente), total a pagar, diferencia con alerta roja si excedido
  - Documentos agrupados por proveedor con subtotales
  - Cada item muestra tipo (CxP/NDC), referencia, vencimiento, saldo, monto a pagar USD/Bs
  - Edicion inline del monto a pagar por item
  - Filas vencidas con fondo rojo, items pagados con fondo verde
  - Panel colapsable "Agregar documentos" con filtros (proveedor, fecha vencimiento, busqueda)
  - Documentos disponibles con campo monto editable pre-llenado con saldo pendiente

### PDF (PDFKit)
- Formato A4 con header empresa, titulo "PROGRAMACION DE PAGOS", numero, fecha, tasa
- Seccion presupuesto vs total con diferencia
- Items agrupados por proveedor con tabla: referencia, tipo, vencimiento, saldo, monto USD, monto Bs
- Subtotal por proveedor, gran total USD y Bs al final
- Footer con creador y datos empresa

### Permisos
- Modulo `payment-schedules` agregado a VALID_MODULES
- Defaults: ADMIN (*), SUPERVISOR, BUYER, ACCOUNTANT tienen acceso
- Middleware de ruta: /payment-schedules → permission 'payment-schedules'
- Pagina role-permissions: nuevo item en "Acceso a Modulos"

## Sesion 29 — Modulo de Control de Gastos (Completada)

### Migracion de base de datos
- Nuevos modelos: `ExpenseCategory`, `Expense`
- Nuevo valor en `PermissionKey`: `MANAGE_EXPENSES`
- Relacion `expenses Expense[]` en User
- Migracion: `add_expenses_module`
- 10 categorias predefinidas seeded via migracion (isDefault=true)

### Backend (NestJS)
- Nuevo modulo: `ExpensesModule` con controller y service
- Endpoints de categorias:
  - `GET /expense-categories` — todas las categorias
  - `GET /expense-categories/active` — solo activas
  - `POST /expense-categories` — crear (solo ADMIN)
  - `PATCH /expense-categories/:id` — editar (solo ADMIN)
  - `PATCH /expense-categories/:id/toggle-active` — activar/desactivar (solo ADMIN)
- Endpoints de gastos:
  - `GET /expenses` — lista con filtros (categoryId, from, to, search, page, limit), ordenado por date DESC
  - `GET /expenses/summary?from&to` — resumen con totalUsd, totalBs, byCategory, byMonth
  - `GET /expenses/:id` — detalle
  - `POST /expenses` — crear (requiere MANAGE_EXPENSES). Calcula Bs o USD automaticamente con tasa del dia
  - `PATCH /expenses/:id` — editar (creador o ADMIN)
  - `DELETE /expenses/:id` — eliminar (solo ADMIN)
- `VALID_MODULES` actualizado con 'expenses' y 'MANAGE_EXPENSES'
- Defaults: ADMIN (*), SUPERVISOR: expenses + MANAGE_EXPENSES

### Frontend (Next.js)
- Nueva seccion en sidebar: GASTOS (icono Wallet) con items Gastos y Categorias
- Pagina `/expenses`:
  - 3 tarjetas resumen (Total USD rojo, Total Bs rojo, Cantidad gris)
  - Filtros: categoria, rango de fechas (default mes actual), busqueda por descripcion/referencia
  - Tabla: Fecha, Categoria (badge), Descripcion, Referencia, USD, Bs, Registrado por, Acciones
  - Boton "+ Registrar gasto" (solo con permiso MANAGE_EXPENSES)
  - Modal crear/editar con conversion automatica USD<>Bs usando tasa del dia
  - Grafico de barras horizontal por categoria (recharts) mostrando total USD del periodo
- Pagina `/expenses/categories`:
  - Solo visible para ADMIN
  - Tabla: Nombre, Descripcion, Predefinida (badge), Estado, Acciones
  - Toggle activar/desactivar, Editar
  - Modal crear/editar categoria
- Pagina `/settings/role-permissions`: nuevo grupo "Administracion" con MANAGE_EXPENSES
- Modulo 'expenses' agregado al grupo "Acceso a Modulos"

### Dependencias
- `recharts` agregado a apps/web

## Sesion 28b — Notas de Credito/Debito como Documentos Independientes (Completada)

### Cambio de arquitectura
- Las notas de credito/debito ya NO modifican CxC/CxP automaticamente al confirmarse
- Son documentos independientes que se aplican a traves del recibo de cobro/pago
- Al confirmar (post): solo hacen movimientos de inventario (RETURN_IN/RETURN_OUT) y cambian status a POSTED

### Schema
- Nuevos valores en `ReceiptItemType`: CREDIT_NOTE, DEBIT_NOTE
- Campo `creditDebitNoteId` en ReceiptItem (relacion con CreditDebitNote)
- Campo `appliedAt DateTime?` en CreditDebitNote (marca cuando fue aplicada en un recibo)
- Migracion: `fix_credit_debit_notes_receipt_integration`

### Backend
- `CreditDebitNotesService.post()`: eliminada toda logica de CxC/CxP (Receivable/Payable)
- `ReceiptsService.getPendingDocuments()`:
  - Para clientes: retorna notas NCV (sign -1) y NDV (sign +1) como documentos seleccionables
  - Para proveedores: retorna notas NCC (sign -1) y NDC (sign +1) como documentos seleccionables
  - Solo notas con status POSTED y appliedAt null
- `ReceiptsService.create()`: acepta items con creditDebitNoteId
- `ReceiptsService.post()`: marca notas como aplicadas (appliedAt = now)
- `CreateReceiptDto`: campo creditDebitNoteId en ReceiptItemDto

## Sesion 28 — Permisos Granulares para Notas y Devoluciones + Logo + Ticket POS (Completada)

### Permisos granulares para notas de credito/debito
- Nuevos valores en `PermissionKey` enum: RETURN_INVOICE, CREDIT_NOTE_SALE, DEBIT_NOTE_SALE, RETURN_PURCHASE, CREDIT_NOTE_PURCHASE, DEBIT_NOTE_PURCHASE
- Migracion: `add_credit_debit_note_permissions`
- Permisos por defecto en `role-permissions.ts`: ADMIN/SUPERVISOR todos, CASHIER/SELLER solo RETURN_INVOICE, BUYER: RETURN_PURCHASE + notas compra, WAREHOUSE: RETURN_PURCHASE, ACCOUNTANT: todos
- VALID_MODULES actualizado en `role-permissions.service.ts`
- Pagina `/settings/role-permissions`: nuevo grupo visual "Notas y Devoluciones"

### Factura de venta — botones corregidos
- Eliminado boton "Anular" (las facturas no se anulan)
- Status PAID: solo muestra "Devolver factura" (permiso RETURN_INVOICE) → navega a `/credit-debit-notes/new?type=NCV&origin=MERCHANDISE&invoiceId=x`
- Status CREDIT: muestra "Devolver mercancia" (RETURN_INVOICE), "Nota de credito" (CREDIT_NOTE_SALE, origin=MANUAL), "Nota de debito" (DEBIT_NOTE_SALE, origin=MANUAL)
- Permisos verificados via fetch `/api/auth/me`

### Orden de compra — botones corregidos
- Status RECEIVED: "Devolver mercancia" (RETURN_PURCHASE), "Nota de credito" (CREDIT_NOTE_PURCHASE, origin=MANUAL), "Nota de debito" (DEBIT_NOTE_PURCHASE, origin=MANUAL)

### Pagina crear nota — query param origin
- Lee `origin` de la URL: si MERCHANDISE solo muestra tab devolucion, si MANUAL solo muestra tab ajuste manual
- Sin origin: muestra ambos tabs (acceso directo desde menu)
- NDV/NDC siempre forzados a MANUAL

### Validacion backend
- `CreditDebitNotesService.create()`: NCV con origin=MANUAL solo aplica a facturas CREDIT
- NDV solo aplica a facturas CREDIT
- NCV con origin=MERCHANDISE aplica a PAID y CREDIT

### Logo de empresa en reportes PDF
- Campo `logo String? @db.Text` en CompanyConfig (base64)
- UI de upload en `/config` con preview, limite 500KB
- 4 PDF services (factura, cotizacion, recibo, notas) muestran solo logo sin texto cuando existe

### Ticket POS 80mm
- Precios incluyen IVA, no se muestra desglose IVA/IGTF al cliente
- IGTF solo se aplica cuando `cashRegister.isFiscal === true`

### Body parser
- Aumentado limite a 2MB en main.ts via NestExpressApplication.useBodyParser()

## Sesion 27 — Notas de Crédito y Débito (Completada)

### Migracion de base de datos
- Nuevos enums: `NoteType` (NCV, NDV, NCC, NDC), `NoteOrigin` (MERCHANDISE, MANUAL), `NoteStatus` (DRAFT, POSTED, CANCELLED)
- Agregado `RETURN_IN`, `RETURN_OUT` a `MovementType`
- Nuevo modelo `CreditDebitNote`: numero, tipo, origen, status, factura/OC vinculada, subtotales/IVA/total en USD y Bs, tasa, monto manual o porcentaje
- Nuevo modelo `CreditDebitNoteItem`: producto, cantidad, precios unitarios, IVA, totales
- Relaciones: `creditDebitNotes` en Invoice, PurchaseOrder y CashRegister

### Backend (NestJS)
- Nuevo modulo `CreditDebitNotesModule` con endpoints:
  - `GET /credit-debit-notes` — lista con filtros: type, status, invoiceId, purchaseOrderId, search, from, to, page, limit
  - `GET /credit-debit-notes/:id` — detalle con items y documento vinculado
  - `POST /credit-debit-notes` — crear nota en DRAFT:
    - MERCHANDISE: valida items originales, calcula precios sin IVA, IVA, totales
    - MANUAL: monto fijo o porcentaje del documento padre, IVA proporcional
    - Genera correlativo: NCV-0001, NDV-0001, NCC-0001, NDC-0001
  - `POST /credit-debit-notes/:id/post` — confirmar nota (transaccion):
    - NCV: RETURN_IN inventario + reduce CxC
    - NDV: crea nueva CxC al cliente
    - NCC: RETURN_OUT inventario + reduce CxP
    - NDC: crea nueva CxP al proveedor
  - `PATCH /credit-debit-notes/:id/cancel` — anular nota DRAFT
  - `GET /credit-debit-notes/:id/pdf` — PDF con PDFKit
- DTOs: CreateNoteDto (type, origin, items, manualAmountUsd, manualPct), QueryNotesDto

### Frontend (Next.js)
- Sidebar: "Notas Cr/Db" en seccion VENTAS con icono FileX2
- `/credit-debit-notes` — lista con filtros tipo, estado, fecha, busqueda por numero, paginacion
- `/credit-debit-notes/new?type=NCV&invoiceId=xxx` — crear nota:
  - Muestra datos del documento origen (factura/OC)
  - Tab "Devolucion de mercancia": tabla items con cantidad editable, totales en tiempo real
  - Tab "Ajuste manual": monto fijo o porcentaje con calculo automatico
  - Resumen con subtotal, IVA, total USD/Bs
  - Botones: "Guardar borrador" y "Crear y confirmar"
- `/credit-debit-notes/[id]` — detalle:
  - Tab "Informacion General": tipo, origen, documento vinculado, items o detalle manual, totales
  - Tab "Efectos contables": muestra efectos en inventario y CxC/CxP segun tipo
  - Botones: Confirmar (DRAFT), Anular (DRAFT), Imprimir PDF (POSTED)
- Factura detalle (`/sales/invoices/[id]`): botones "Nota de credito"/"Nota de debito" + tab "Notas Cr/Db"
- OC detalle (`/purchases/[id]`): botones "Nota de credito"/"Nota de debito" + tab "Notas Cr/Db"

### Pendientes para futuras sesiones
- Validacion IGTF: si NCV y factura tiene IGTF, total debe == factura.totalUsd (solo reversal completo)
- Fiscal: enviar a impresora fiscal al confirmar
- Acumular notas: validar que suma de notas previas + nueva no exceda total del documento

## Sesion 26 — Recibos de Cobro y Pago con Diferencial Cambiario (Completada)

### Migracion de base de datos
- Nuevos enums: `ReceiptType` (COLLECTION, PAYMENT), `ReceiptStatus` (DRAFT, POSTED, CANCELLED), `ReceiptItemType` (RECEIVABLE, PAYABLE, DIFFERENTIAL)
- Nuevo modelo `Receipt`: numero, tipo, cliente/proveedor, totales USD/Bs historico/Bs hoy, tasa del dia, diferencial cambiario, items, pagos
- Nuevo modelo `ReceiptItem`: tipo documento (CxC/CxP/Diferencial), montos USD y Bs, signo (+1/-1)
- Nuevo modelo `ReceiptPayment`: metodo de pago, montos USD/Bs, referencia
- Relaciones agregadas: `receiptItems` en Receivable y Payable, `receipts` en Customer y Supplier, `receiptPayments` en PaymentMethod
- Migracion: `20260516000000_add_receipts_module`

### Backend (NestJS)
- Nuevo modulo `ReceiptsModule` con endpoints:
  - `GET /receipts` — lista con filtros: type, status, customerId, supplierId, from, to, page, limit
  - `GET /receipts/pending-documents?type&entityId` — documentos pendientes (CxC o CxP) de un cliente/proveedor
  - `GET /receipts/:id` — detalle completo con items, pagos, cliente/proveedor
  - `POST /receipts` — crear recibo en borrador:
    - Obtiene tasa del dia (error si no existe)
    - Por cada item: calcula amountBsHistoric (proporcional al original) y amountBsToday (USD x tasa hoy)
    - Calcula totales y diferencial cambiario (totalBsToday - totalBsHistoric)
    - Si diferencial != 0 → crea item adicional tipo DIFFERENTIAL
    - Genera numero correlativo: RCB-XXXX (cobro) o RPG-XXXX (pago)
  - `POST /receipts/:id/post` — confirmar y procesar recibo:
    - Valida que suma de pagos >= saldo neto
    - Por cada item RECEIVABLE → crea ReceivablePayment y actualiza estado
    - Por cada item PAYABLE → crea PayablePayment y actualiza estado
    - Items DIFFERENTIAL no generan movimiento en CxC/CxP
    - Registra pagos del recibo, cambia status a POSTED
    - Todo en transaccion Prisma
  - `PATCH /receipts/:id/cancel` — cancelar recibo DRAFT unicamente

### Frontend (Next.js)
- Sidebar: "Recibos de cobro" bajo CxC, "Recibos de pago" bajo CxP
- `/receipts/collection` — lista recibos de cobro con filtros, paginacion
- `/receipts/payment` — lista recibos de pago con filtros, paginacion
- `/receipts/new?type=COLLECTION|PAYMENT` — crear recibo:
  - Seccion 1: selector de cliente/proveedor con busqueda
  - Seccion 2: dos listas lado a lado (pendientes ← → seleccionados)
    - CxC con fondo verde, CxP con fondo rojo
    - Monto editable para abonos parciales
    - Columna "Bs a tasa hoy" en seleccionados
  - Seccion 3: resumen con totales USD, Bs historico, tasa, Bs hoy, diferencial cambiario
    - Indicador "SE COBRA" (verde) o "SE PAGA" (rojo)
    - Botones "Guardar borrador" y "Procesar recibo"
  - Modal de cobro/pago: multiples metodos, monto pre-llenado, referencia
- `/receipts/[id]` — detalle con tabs:
  - Tab "Informacion General": datos recibo, tabla documentos (con fila diferencial en amarillo), totales
  - Tab "Pagos registrados": tabla metodos de pago usados
  - Botones: Procesar (DRAFT), Cancelar (DRAFT)

## Sesion 25 — Rediseno modulo de cajas con sesiones compartidas/exclusivas (Completada)

### Migracion de base de datos
- Agregado campo `isShared` a CashRegister (Boolean, default false)
- Split de balances en CashSession: `openingBalance` → `openingBalanceUsd` + `openingBalanceBs`, `closingBalance` → `closingBalanceUsd` + `closingBalanceBs`
- Migracion SQL preserva datos existentes (copia openingBalance a openingBalanceUsd, etc.)

### Backend (NestJS)
- Rediseño completo de CashRegistersModule:
  - `GET /cash-registers` — lista todas las cajas con sesion activa
  - `GET /cash-registers/available` — cajas disponibles para el usuario (propias + compartidas abiertas)
  - `GET /cash-registers/:id` — detalle de caja con sesion activa
  - `POST /cash-registers` — crear caja (ADMIN)
  - `PATCH /cash-registers/:id` — editar caja con isShared (ADMIN)
  - `PATCH /cash-registers/:id/toggle-active` — activar/desactivar
  - `POST /cash-registers/:id/open` — abrir sesion con balanceUsd y balanceBs
  - `POST /cash-sessions/:id/close` — cerrar sesion con conteo fisico USD y Bs
  - `GET /cash-sessions/:id/summary` — resumen detallado con diferencias USD/Bs
  - `GET /cash-registers/:id/sessions` — historial de sesiones de una caja
  - `GET /cash-sessions` — historial global con filtros (caja, usuario, estado, rango fechas)
  - `GET /cash-sessions/:id/payments` — pagos de una sesion con paginacion 20/pagina y filtro por metodo
- Una caja solo puede tener UNA sesion OPEN a la vez
- DTOs actualizados: OpenSessionDto (balanceUsd, balanceBs), CloseSessionDto (balanceUsd, balanceBs), CreateCashRegisterDto (isShared)

### Frontend (Next.js)
- `/cash` — Lista de cajas en tabla: nombre, codigo, tipo (Fiscal/Normal), compartida (Si/No), estado (Abierta/Cerrada), abierta por, hora apertura. Click navega a detalle. Boton abrir caja con modal USD/Bs.
- `/cash/[id]` — Detalle de caja con tabs:
  - Tab "Sesion actual": layout 2 columnas (30% resumen fondos/totales/metodos + 70% tabla pagos paginada con filtro por metodo). Botones Reporte X/Z (solo fiscal), Cerrar caja.
  - Tab "Historial de cierres": tabla de sesiones pasadas, click abre modal con detalle completo.
  - Modal cerrar caja: resumen ventas, campos conteo fisico USD/Bs, diferencia automatica (verde/rojo), notas.
- `/cash/sessions` — Historial global con filtros: caja, estado, rango de fechas.
- POS: selector de caja usa endpoint `/available` (solo cajas propias + compartidas). SELLERs no ven selector ni boton cobrar. Si no hay cajas disponibles muestra boton "Ir a cajas".
- Sidebar: seccion CAJA con items "Cajas" y "Sesiones".

## Sesion 24 — Migracion metodos de pago de enum a tabla dinamica (Completada)

### Migracion de base de datos
- Eliminado enum `PaymentMethod` de Prisma, reemplazado por modelo `PaymentMethod` (tabla)
- Modelo soporta jerarquia padre/hijo (grupos y variantes): ej. "Punto de Venta" > "PDV Banesco", "PDV Mercantil"
- Campos: `name`, `isDivisa`, `createsReceivable`, `isActive`, `sortOrder`, `fiscalCode`, `parentId`
- Migracion SQL: convierte columnas enum a FK `methodId` en Payment, ReceivablePayment, PayablePayment preservando datos existentes
- Eliminado modelo `FiscalPaymentMethod` (reemplazado por campo `fiscalCode` en PaymentMethod)
- Seed actualizado con metodos por defecto y variantes iniciales (PDV Banesco/Mercantil/Provincial, PM Banesco/Mercantil)

### Backend (NestJS)
- Nuevo modulo `PaymentMethodsModule` con CRUD completo:
  - `GET /payment-methods` — lista padres con hijos anidados
  - `GET /payment-methods/flat` — lista plana de metodos seleccionables (hojas activas)
  - `POST /payment-methods` — crear (ADMIN)
  - `PATCH /payment-methods/:id` — editar (ADMIN)
  - `PATCH /payment-methods/:id/toggle-active` — activar/desactivar (ADMIN)
  - `DELETE /payment-methods/:id` — eliminar si no tiene pagos ni hijos activos (ADMIN)
- `InvoicesService.pay()`: IGTF ahora usa `paymentMethod.isDivisa` en vez de lista hardcodeada; CxC usa `paymentMethod.createsReceivable`; pagos usan `methodId`
- `ReceivablesService` y `PayablesService`: pagos usan `methodId`, incluyen relacion `method` en queries
- `CashRegistersService`: resumen de sesion agrupa por `method.name` (dinamico)
- `InvoicePdfService`: labels de metodos vienen de relacion `payment.method.name`
- Eliminado modulo `FiscalPaymentMethodsModule` (redundante)

### Frontend (Next.js)
- POS — modal de cobro rediseñado:
  - Metodos de pago cargados desde API (`GET /payment-methods`)
  - Padres sin hijos: boton directo
  - Padres con hijos: desplegable con submenu de variantes
  - `isDivisa` determina campo principal (USD vs Bs) y calculo IGTF
  - Envio de pagos usa `methodId` en vez de enum
- Eliminados TODOS los diccionarios hardcodeados `PAYMENT_LABELS`/`METHOD_LABELS` de:
  - `sales/pos/page.tsx`, `sales/invoices/[id]/page.tsx`
  - `receivables/page.tsx`, `receivables/[id]/page.tsx`, `receivables/platforms/page.tsx`
  - `payables/page.tsx`, `payables/[id]/page.tsx`
  - `cash/sessions/page.tsx`
  - `lib/print-receipt.ts`, `lib/fiscal-printer.ts`
- Dropdowns de metodo de pago en CxC y CxP ahora cargan desde API (`/payment-methods/flat`)
- Nueva pagina `/settings/payment-methods` (solo ADMIN):
  - Lista metodos padres con hijos anidados (estilo arbol)
  - Badges: Divisa/Bolivares, Genera CxC, Codigo Fiscal
  - Acciones: crear, editar, activar/desactivar, eliminar, agregar variante
  - Modal de creacion/edicion con todos los campos
- `fiscal-printer.ts`: obtiene `fiscalCode` de `payment.method.fiscalCode` (relacion) — codigo de impresion NO modificado
- `print-receipt.ts`: obtiene nombre de `payment.method.name` y moneda de `payment.method.isDivisa`
- Sidebar: agregado enlace "Metodos de pago" en seccion CONFIGURACION

## Sesion 19 — Auto-impresion ticket 80mm al cobrar (Completada)

### Auto-impresion de ticket al cobrar en POS
- Backend: `invoices.pay()` ahora incluye seller, cashier y cashRegister en la respuesta
- Nuevo archivo `apps/web/src/lib/print-receipt.ts`: genera ticket HTML 80mm e imprime via iframe aislado (evita conflicto CSS con print-monitor de comandas)
- Ticket incluye: encabezado empresa (nombre, RIF, direccion, telefono), numero factura, fecha/hora, caja, vendedor, cajero, cliente, items detallados, subtotal, IVA desglosado, IGTF, totales USD/Bs, tasa de cambio, metodos de pago, badge credito si aplica
- POS: companyConfig ampliado para guardar datos de empresa (companyName, rif, address, phone)
- Solo imprime en cajas NO fiscales (`isFiscal === false`)
- Import dinamico de print-receipt para no afectar el bundle

### Pendiente para sesion futura
- **QZ Tray (impresion silenciosa)**: instalar QZ Tray en cada PC para imprimir directo a impresora termica sin dialogo del navegador. Configuracion por PC (localStorage) para seleccionar impresora. Aplica tanto para tickets de venta como para comandas de despacho.

## Sesion 18 — Rol Auditor, Scraping BCV y Consulta SENIAT (Completada)

### Rol AUDITOR
- Nuevo valor `AUDITOR` en enum `UserRole` de Prisma
- Migracion: `20260513000000_add_auditor_role`
- Permisos por defecto: `dashboard`, `inventory`
- ROLE_LABELS en espanol en toda la interfaz:
  - Tabla de usuarios, selectores de rol, pagina de permisos por rol, sidebar
  - ADMIN=Administrador, SUPERVISOR=Supervisor, CASHIER=Cajero, SELLER=Vendedor, WAREHOUSE=Almacenista, BUYER=Comprador, ACCOUNTANT=Contador, AUDITOR=Auditor
- Color del badge AUDITOR: cyan

### Scraping BCV
- Endpoint `GET /exchange-rate/fetch-bcv` mejorado con `cheerio` para parseo robusto de la pagina del BCV
- Selector: `#dolar strong` para obtener la tasa del dolar
- User-Agent configurado para evitar bloqueo
- Respuesta mejorada: incluye rate, source, date; o error descriptivo si falla
- Frontend: boton "Obtener del BCV" en pagina de config y en banner de tasa faltante
- Flujo: fetch → muestra tasa obtenida en campo editable → usuario confirma con "Confirmar y guardar"
- Si falla el scraping: mensaje de error con opcion de ingresar manualmente
- Source se guarda correctamente como 'BCV' cuando viene del scraping

### Consulta SENIAT
- Backend: `POST /customers/seniat-parse` parsea HTML de respuesta del SENIAT
  - Extrae: documentType, documentNumber, name, commercialName, fiscalName
  - Usa regex + cheerio como fallback para multiples patrones del SENIAT
- Frontend: boton "SENIAT" junto al campo RIF en:
  - `/sales/customers/new` (crear cliente)
  - `/sales/customers/[id]` (editar cliente)
- Flujo: window.open() al SENIAT → usuario completa formulario y captcha → app hace polling de localStorage cada 500ms → parsea y pre-llena campos

## Sesion 17 — Vendedores, Comisiones, CRUD Cajas, Campos Factura (Completada)

### Migracion Prisma
- Nuevo modelo `Seller` (code, name, phone, isActive, userId unico vinculado a User)
- `commissionPct Float @default(0)` en Category para calculo de comisiones
- Invoice: `sellerId` ahora apunta a Seller (no a User), nuevo `cashierId` apunta a User
- InvoiceItem: +unitPriceWithoutIva, +unitPriceWithoutIvaBs, +costUsd, +costBs
- Migracion: `20260512210000_add_sellers_commissions_and_invoice_fields`

### Backend (NestJS)
- **SellersModule** completo: CRUD, toggle-active, assign-user, generateCode (VEN-001, VEN-002...)
- **Reporte de comisiones**: `GET /sellers/:id/commission-report?from&to` calcula comision por categoria usando unitPriceWithoutIva × cantidad × commissionPct/100 sobre facturas PAID
- **InvoicesService**: auto-asigna seller desde user.seller al crear, guarda cashierId al cobrar, calcula nuevos campos InvoiceItem (unitPriceWithoutIva, costUsd con brega)
- **QuotationsService**: convertToInvoice actualizado con misma logica de seller y campos nuevos
- **CashRegistersService**: CRUD admin completo (findAllAdmin, createRegister, updateRegister, toggleActiveRegister)
- **CategoriesService**: DTO actualizado para incluir commissionPct
- **UsersService**: findOne incluye seller vinculado

### Frontend
- `/settings/sellers` — CRUD vendedores con modal crear/editar/vincular usuario
- `/settings/cash-registers` — CRUD cajas con toggle fiscal y activar/desactivar
- `/reports/commissions` — Reporte de comisiones por vendedor con desglose por categoria
- **POS**: selector de vendedor (dropdown para ADMIN/SUPERVISOR, solo lectura para SELLER/CASHIER)
- **Categorias**: campo commissionPct en formularios inline de crear/editar, badge visual
- **Sidebar**: seccion REPORTES (ADMIN/SUPERVISOR), items Vendedores y Cajas en CONFIGURACION

### Datos de prueba
- Vendedor VEN-001 (Carlos Mendez) vinculado a seller@trinity.com
- Vendedor VEN-002 (Ana Rodriguez) sin vincular

## Sesion 16 — Lazy Loading Tabs + Montos Bs estandarizados (Completada)

### Lazy Loading en Tabs
- Todas las paginas de detalle ahora cargan datos de cada tab solo cuando el usuario hace clic (lazy loading)
- Paginas corregidas: Producto, Cliente, Proveedor, Orden de Compra
- Implementado via `onValueChange` de Radix Tabs + useEffect condicional por tab activa

### Paginacion estandarizada (20 por pagina)
- Movimientos de producto: 10 → 20 por pagina
- Historial compras producto: sin paginacion → 20 por pagina (backend + frontend)
- Facturas de cliente: 10 client-side → 20 server-side via `/invoices?customerId=`
- CxC de cliente: sin paginacion → 20 por pagina (client-side)
- Compras de proveedor: 10 → 20 por pagina
- CxP de proveedor: sin paginacion → 20 por pagina (client-side)

### Ordenamiento
- Todas las listas en tabs ya estaban ordenadas por `createdAt DESC` — verificado sin cambios

### Montos Bs estandarizados en todos los modelos monetarios
- Migracion `add_bs_amounts_to_all_models` agrega campos Bs faltantes
- Modelos actualizados:
  - `PurchaseOrder`: +totalBs, +exchangeRate
  - `PurchaseOrderItem`: +costBs, +totalBs
  - `Payable`: +netPayableBs, +paidAmountBs
  - `Receivable`: +paidAmountBs
  - `Quotation`: +subtotalBs, +ivaBs, +totalBs, +exchangeRate
  - `QuotationItem`: +unitPriceBs, +ivaAmountBs, +totalBs
  - `PayablePayment` y `ReceivablePayment`: ya tenian amountBs — sin cambios
- Servicios actualizados para calcular y guardar Bs al crear/actualizar:
  - `purchase-orders.service.ts` (create, update, receive)
  - `payables.service.ts` (pay → paidAmountBs)
  - `receivables.service.ts` (pay → paidAmountBs)
  - `quotations.service.ts` (create, update)

### Regla agregada a CLAUDE.md
- "Todo campo monetario en USD debe tener su campo equivalente en Bs. Los montos en Bs se calculan y guardan al momento de crear/actualizar usando la tasa del dia. Nunca calcular Bs en tiempo de ejecucion."

## Sesion 15 — UX Correctiva: Paginas dedicadas con tabs (Completada)

### Concepto
Conversion de CRUD basado en modales a paginas dedicadas con URLs navegables y componente Tabs (Radix UI). Los modales solo se usan para confirmaciones rapidas. Cada entidad tiene pagina de listado, detalle con tabs, y formulario de creacion.

### Componente Tabs
- `apps/web/src/components/ui/tabs.tsx` — componente shadcn/ui con estilos dark theme
- Basado en `@radix-ui/react-tabs`

### Backend (NestJS)
- `GET /products/by-code/:code` — buscar producto por codigo (para URL `/catalog/products/[code]`)
- `GET /products/:id/purchases` — historial de compras de un producto (PurchaseOrderItems con PO y proveedor)

### Modulo 1: Productos
- `/catalog/products` — listado sin modales, nombres son Links al detalle
- `/catalog/products/new` — formulario de creacion, redirige al detalle al crear
- `/catalog/products/[code]` — detalle con 5 tabs:
  - Info General (formulario editable), Existencias (stock por almacen), Movimientos (paginado con badges por tipo), Historial de compras, Precios (formula paso a paso)

### Modulo 2: Ordenes de Compra
- `/purchases` — listado sin modales, numeros de orden son Links
- `/purchases/new` — formulario con busqueda de productos, proveedor, items
- `/purchases/[id]` — detalle con 3 tabs + modal de recepcion:
  - Info General (resumen + items), Recepciones (movimientos filtrados), CxP (si es credito)
- `/purchases/[id]/edit` — edicion de orden en borrador/enviada

### Modulo 3: Clientes
- `/sales/customers` — listado con busqueda y paginacion, sin modales
- `/sales/customers/new` — formulario de creacion
- `/sales/customers/[id]` — detalle con 3 tabs:
  - Info General (formulario editable), Ventas (facturas paginadas), CxC (resumen de deuda + cobro inline)

### Modulo 4: Proveedores
- `/catalog/suppliers` — listado sin modales
- `/catalog/suppliers/new` — formulario de creacion
- `/catalog/suppliers/[id]` — detalle con 3 tabs:
  - Info General (formulario editable), Compras (ordenes paginadas), CxP (resumen + tabla de pagares)

## Sesion 14 — IGTF y Estandarizacion de Montos en Bs (Completada)

### Migracion de Base de Datos
- Campos IGTF en CompanyConfig: `isIGTFContributor`, `igtfPct`
- Campos IGTF en Invoice: `igtfUsd`, `igtfBs`, `subtotalBs`, `ivaBs`
- Campos Bs en InvoiceItem: `unitPriceBs`, `ivaAmountBs`, `totalBs`
- Campos IGTF en Payment: `igtfUsd`, `igtfBs`
- Migracion: `add_igtf_and_bs_amounts`

### Backend (NestJS)
- DTO de CompanyConfig actualizado con campos IGTF (`isIGTFContributor`, `igtfPct`)
- Servicio de facturas guarda montos en Bs al crear y actualizar (InvoiceItem y Invoice)
- Calculo automatico de IGTF al procesar pago:
  - Solo aplica si `isIGTFContributor = true`
  - Solo en metodos de pago en divisas: `CASH_USD`, `ZELLE`
  - Se calcula una sola vez por factura
  - IGTF se registra por payment y en el total de la factura
- PDF de factura muestra linea de IGTF entre IVA y Total
- Libro de ventas fiscal incluye columna IGTF

### Frontend (Next.js)
- Pagina de configuracion: toggle "Contribuyente IGTF" con porcentaje configurable
- Modal de cobro POS:
  - Calculo en tiempo real del IGTF segun metodos de pago seleccionados
  - Resumen de factura con Subtotal, IVA, IGTF y Total en USD y Bs
  - Total y pendiente se actualizan automaticamente con IGTF
- Detalle de factura: muestra IGTF si aplica
- Libro de ventas: columna IGTF en tabla y exportacion PDF

### Mejora adicional
- Escaner de camara del POS: mensajes de error mejorados (detecta contexto inseguro HTTP, permisos denegados, camara no encontrada)

## Sesion 1 — Setup, Auth y Configuracion Base (Completada)
- Scaffold monorepo pnpm + Turborepo
- Docker Compose (PostgreSQL 15 + Redis 7)
- NestJS base con Swagger, ValidationPipe, CORS
- PrismaModule/Service global
- AuthModule: login, refresh, JWT strategy, get profile
- UsersModule: CRUD con roles
- CompanyConfigModule: GET y PATCH /config (singleton)
- Next.js 14 App Router con layout autenticado
- Sidebar colapsable con navegacion
- Pagina de login con cookies httpOnly
- Pagina de configuracion de empresa
- Prisma schema completo Fase 1
- Seed con datos iniciales (3 usuarios, 5 categorias, 3 marcas, 2 proveedores, 10 productos)

## Sesion 2 — Catalogo de Productos (Completada)
### Backend
- **CategoriesModule**: CRUD completo con soporte arbol 2 niveles (padre + subcategorias)
- **BrandsModule**: CRUD simple con conteo de productos
- **SuppliersModule**: CRUD completo con RIF, telefono, email, direccion, contacto, isRetentionAgent
- **ProductsModule**:
  - CRUD completo con todos los campos del schema
  - Trigger PostgreSQL para searchVector (tsvector) al crear/actualizar producto
  - `GET /products` con filtros: categoryId, brandId, supplierId, search (full-text), lowStock, isActive, page, limit
  - `GET /products/search?q=` — busqueda rapida para POS, top 20 con id, code, name, priceDetal, priceMayor, stock total
  - `POST /products/import` — importacion masiva desde JSON
  - Recalculo automatico de priceDetal y priceMayor usando formula de precios

### Frontend
- Seccion CATALOGO en sidebar con items: Productos, Categorias, Marcas, Proveedores
- Pagina `/catalog/products`: tabla con columnas (Codigo, Nombre, Categoria, Marca, Proveedor, Precio USD, Precio Bs, Stock, Estado), filtros, busqueda, paginacion
- Modal crear/editar producto con todos los campos y vista previa de precio en tiempo real
- Pagina `/catalog/categories`: arbol visual con categorias y subcategorias, CRUD inline
- Pagina `/catalog/brands`: tabla simple con CRUD inline
- Pagina `/catalog/suppliers`: tabla con todos los campos, modal crear/editar

### Migraciones
- `20260510000000_add_product_search_vector`: columna tsvector, indice GIN, trigger para busqueda full-text

### Verificaciones
- Busqueda full-text funciona por nombre ("martillo" -> PROD-001) y por codigo ("PROD-003" -> Taladro DeWalt)
- Formula de precios verificada: Martillo costUsd=12, ganancia=35%, IVA=16% -> priceDetal=$18.79
- 15 productos de prueba con diferentes categorias, marcas e IVA types (GENERAL, EXEMPT, REDUCED, SPECIAL)

## Sesion 3 — Inventario y Almacenes (Completada)
### Backend
- **WarehousesModule**: CRUD completo con toggle isDefault (transaccion para unset previo), ADMIN-only para escritura
- **StockModule**:
  - `GET /stock?warehouseId` — stock por almacen con info de producto y almacen
  - `GET /stock/global` — stock agregado por producto con totalStock y minStock
  - `GET /stock/low` — productos bajo stock minimo
  - `POST /stock/adjust` — ajuste manual en transaccion Prisma (SUPERVISOR/ADMIN para salidas)
- **TransfersModule**:
  - `POST /transfers` — crear solicitud con items
  - `GET /transfers` — listar con filtro por status
  - `PATCH /transfers/:id/approve` — aprobar y mover stock en transaccion (ADMIN/SUPERVISOR)
  - `PATCH /transfers/:id/cancel` — cancelar transferencia pendiente
- **InventoryCountsModule**:
  - `POST /inventory-counts` — crear sesion de conteo (carga productos del almacen)
  - `GET /inventory-counts` — listar sesiones con conteo de items
  - `GET /inventory-counts/:id` — detalle con items, cantidades sistema y contadas
  - `PATCH /inventory-counts/:id/items` — registrar cantidades contadas (cambia a IN_PROGRESS)
  - `PATCH /inventory-counts/:id/approve` — aprobar y ajustar stock automaticamente (ADMIN/SUPERVISOR)
- **StockMovementsModule**: `GET /stock-movements` con filtros (productId, warehouseId, type, from, to) y paginacion

### Frontend
- Seccion INVENTARIO en sidebar con 5 items: Stock, Almacenes, Transferencias, Conteo Fisico, Movimientos
- Pagina `/inventory/stock`: vista de stock por almacen con tabs, tabla con producto/cantidad/min/estado, resumen valorizado, modal de ajuste rapido
- Pagina `/inventory/warehouses`: tabla con nombre/ubicacion/por defecto/estado, CRUD con modal, toggle default
- Pagina `/inventory/transfers`: lista con filtros por estado, modal crear con selector origen/destino y productos multiples, acciones aprobar/cancelar
- Pagina `/inventory/count`: sesiones de conteo fisico, modal crear, detalle con tabla de conteo inline, aprobar con ajuste automatico
- Pagina `/inventory/movements`: historial con filtros por fecha (hoy/semana/mes/custom), almacen, tipo, producto; paginacion; badges por tipo

### Schema (Prisma)
- Enums: `TransferStatus` (PENDING, APPROVED, CANCELLED), `CountStatus` (DRAFT, IN_PROGRESS, APPROVED, CANCELLED)
- Modelos: `Transfer`, `TransferItem`, `InventoryCount`, `InventoryCountItem`
- Migracion: `20260509235441_add_transfers_and_inventory_counts`

### Verificaciones
- Login y autenticacion JWT funcionan correctamente
- `GET /warehouses` retorna almacen principal con stockCount
- `GET /stock?warehouseId=default-warehouse` retorna 15 productos con cantidades
- `GET /stock/global` retorna stock agregado por producto
- `POST /stock/adjust` ADJUSTMENT_IN +5 unidades → stock actualizado de 80 a 85
- `GET /stock-movements` muestra el movimiento generado con tipo, cantidad y razon
- Flujo completo verificado: ajustar stock → movimiento creado → stock actualizado

## Sesion 4 — Compras (Completada)
### Backend
- **PurchaseOrdersModule**:
  - `POST /purchase-orders` — crear orden con numeracion automatica PO-0001 correlativa
  - `GET /purchase-orders` — lista con filtros: supplierId, status, from, to, page, limit (usa setUTCHours para rangos de fecha)
  - `GET /purchase-orders/:id` — detalle con items, proveedor y producto info
  - `PATCH /purchase-orders/:id` — editar solo si status es DRAFT (elimina y recrea items)
  - `PATCH /purchase-orders/:id/status` — cambiar a SENT o CANCELLED (valida transiciones)
  - `PATCH /purchase-orders/:id/receive` — recibir orden en transaccion Prisma:
    - Actualiza receivedQty en PurchaseOrderItem
    - Actualiza stock (upsert) en almacen seleccionado
    - Actualiza costUsd del producto con el nuevo costo
    - Recalcula priceDetal y priceMayor usando formula (costo × brecha × ganancia × IVA)
    - Crea StockMovement tipo PURCHASE con referencia al numero de orden
    - Si todos items recibidos completamente → RECEIVED, sino → PARTIAL
  - `GET /purchase-orders/reorder-suggestions` — productos donde stock total <= minStock, ordenados por criticidad

### Frontend
- Seccion COMPRAS en sidebar con 2 items: Ordenes de Compra, Sugerencias de Reorden
- Pagina `/purchases`:
  - Tabla con columnas: Numero, Proveedor, Items, Total USD, Estado, Fecha, Acciones
  - Filtros por proveedor y estado
  - Badge de estado: gris DRAFT, azul SENT, amarillo PARTIAL, verde RECEIVED, rojo CANCELLED
  - Acciones: Ver detalle, Editar (solo DRAFT), Enviar (solo DRAFT), Recibir (SENT/PARTIAL), Cancelar (DRAFT/SENT)
  - Modal crear/editar con busqueda de producto full-text, selector proveedor, items con cantidad y costo
  - Modal recibir: selector almacen, tabla con cantidades a recibir y costos editables, badge "Precio actualizado" si cambia
  - Modal detalle: tabla completa con recibido vs pedido
- Pagina `/purchases/reorder`:
  - Tabla: Producto, Categoria, Proveedor, Stock actual, Minimo, Diferencia, Costo USD
  - Filas con fondo rojo si stock = 0
  - Boton "Crear orden" por fila que crea orden pre-llenada

### Verificaciones
- Flujo completo verificado: crear PO-0001 → marcar enviada → recibir 10 unidades con costo $15 (antes $5)
- Stock actualizado: 92 → 102 (+10 unidades)
- Costo producto actualizado: $5 → $15
- Precio recalculado: priceDetal $8.12 → $24.36, priceMayor $7.25 → $21.75
- StockMovement tipo PURCHASE creado con referencia PO-0001
- Status transiciono correctamente: DRAFT → SENT → RECEIVED

## Sesion 4b — Tasa de Cambio (Completada)
### Migracion
- Modelo `ExchangeRate` con campos: rate, date (unique, tipo DATE), source (BCV/MANUAL), createdById
- Enum `ExchangeRateSource` (BCV, MANUAL)
- Eliminados campos `exchangeRate` y `exchangeRateUpdatedAt` de CompanyConfig

### Backend
- **ExchangeRateModule**:
  - `GET /exchange-rate/today` — retorna tasa del dia actual (UTC) o null
  - `GET /exchange-rate` — historial de tasas (ultimas 60 entradas), filtrable por from/to
  - `GET /exchange-rate/by-date?date=` — obtener tasa de fecha especifica
  - `GET /exchange-rate/fetch-bcv` — intento de scraping de bcv.org.ve
  - `POST /exchange-rate` — registrar/actualizar tasa del dia (solo ADMIN), con source BCV o MANUAL
  - Usa upsert por date para evitar duplicados

### Frontend
- Banner amarillo prominente en layout cuando no hay tasa para hoy: "No hay tasa BCV registrada para hoy. Sin tasa no se puede facturar." con boton "Registrar tasa"
- Modal de registro rapido con campo de monto y boton "Obtener del BCV"
- Pagina `/config` actualizada: seccion "Tasa de Cambio" con tasa de hoy, formulario de registro, e historial reciente
- Paginas de productos y stock actualizadas para obtener tasa desde `/exchange-rate/today` en vez de CompanyConfig
- Eliminado campo exchangeRate del DTO de CompanyConfig

### Verificaciones
- `GET /exchange-rate/today` retorna null cuando no hay tasa
- `POST /exchange-rate` con rate=36.50 → registra correctamente con fecha UTC del dia
- `GET /exchange-rate/today` retorna la tasa registrada
- `GET /exchange-rate/by-date?date=2026-05-10` retorna la tasa correcta
- `GET /exchange-rate/fetch-bcv` endpoint funciona (retorna null si BCV no disponible)
- Historial muestra todas las tasas registradas ordenadas desc

## Sesion 5 — Ventas y POS (Completada)
### Schema Prisma
- Enums: `CustomerType`, `SessionStatus`, `InvoiceStatus`, `InvoiceType`, `PaymentMethod`, `ReceivableType`, `ReceivableStatus`
- Modelos: `Customer`, `CashRegister`, `CashSession`, `Invoice`, `InvoiceItem`, `Payment`, `Receivable`
- Migracion: `20260510020000_add_receivable`

### Backend
- **CustomersModule**:
  - `GET /customers` — lista con filtros: search, isActive, page, limit
  - `GET /customers/:id` — detalle con ultimas 10 facturas, receivables pendientes, deuda y credito disponible calculados
  - `POST /customers` — crear con name, rif, phone, email, address, type, creditLimit, creditDays
  - `PATCH /customers/:id` — editar cualquier campo
  - `DELETE /customers/:id` — soft delete (solo si no tiene facturas activas)

- **CashRegistersModule**:
  - `GET /cash-registers` — lista de cajas con sesion activa
  - `GET /cash-registers/active-session` — sesion activa del usuario actual
  - `POST /cash-registers/:id/open` — abrir turno con openingBalance, valida que no haya sesion activa
  - `POST /cash-registers/:id/close` — cerrar turno con resumen de ventas del turno desglosado por metodo de pago

- **InvoicesModule**:
  - `GET /invoices` — lista con filtros: status, customerId, cashRegisterId, from, to, page, limit (usa setUTCHours)
  - `GET /invoices/pending` — pre-facturas con status PENDING
  - `GET /invoices/:id` — detalle completo con items, pagos, cliente y receivables
  - `POST /invoices` — crear factura:
    - Obtiene tasa del dia de ExchangeRate (error 400 si no existe)
    - Calcula subtotalUsd, IVA desglosado por tipo, totalUsd, totalBs
    - Genera numero con SELECT FOR UPDATE: FAC-{code}-{year}-{correlativo8}
    - SELLER crea → status PENDING; CASHIER/ADMIN → status DRAFT
  - `PATCH /invoices/:id/pay` — cobro completo en transaccion:
    - Valida suma de pagos >= totalUsd (tolerancia 0.01)
    - Si isCredit → valida creditAuthPassword contra hash bcrypt, verifica cupo
    - Cashea/Crediagro → crea Receivable tipo FINANCING_PLATFORM
    - isCredit → crea Receivable tipo CUSTOMER_CREDIT con dueDate
    - Descuenta stock por cada item del almacen por defecto
    - Crea StockMovements tipo SALE
    - Status final: PAID o CREDIT
  - `PATCH /invoices/:id/cancel` — solo ADMIN/SUPERVISOR, solo PENDING/DRAFT
  - `GET /invoices/:id/pdf` — genera PDF con pdfkit

- **InvoicePdfService**: genera PDF A4 con:
  - Header: nombre empresa, RIF, direccion, telefono
  - Numero de factura, numero de control, fecha, tasa del dia
  - Datos del cliente
  - Tabla de items: producto, cantidad, precio unitario, tipo IVA, total
  - Desglose IVA por tipo, subtotal, total USD, total Bs
  - Metodos de pago utilizados
  - Footer con datos empresa

### Frontend
- Seccion VENTAS en sidebar con 4 items: POS, Pre-facturas, Facturas, Clientes

- Pagina `/sales/pos` — POS principal:
  - Layout dos paneles: izquierdo catalogo/busqueda, derecho carrito
  - Busqueda full-text de productos con debounce 300ms
  - Boton escaner codigo de barras con BarcodeDetector API
  - Resultados: codigo, nombre, precio USD/Bs, stock
  - Click agrega al carrito con cantidades editables
  - Selector de cliente con busqueda
  - Solo ADMIN puede modificar precio unitario
  - Desglose IVA por tipo en tiempo real
  - Boton "Guardar pre-factura" (SELLER) o "Cobrar" (CASHIER/ADMIN)
  - Carga pre-factura existente via query param ?invoiceId=

- Modal de cobro:
  - Total USD y Bs con tasa del dia
  - 8 metodos de pago: Efectivo USD/Bs, Punto de Venta, Pago Movil, Zelle, Transferencia, Cashea, Crediagro
  - Mezcla multiples metodos
  - Conversion automatica USD<->Bs segun metodo
  - Pendiente por cobrar en tiempo real
  - Toggle "Factura a credito" con clave de autorizacion y dias de credito

- Pagina `/sales/pending` — Pre-facturas pendientes:
  - Cards con numero, cliente, items resumidos, total, tiempo transcurrido
  - Boton "Cobrar" redirige al POS con la pre-factura cargada
  - Auto-refresh cada 30 segundos

- Pagina `/sales/invoices` — Historial de facturas:
  - Tabla con filtros: estado, rango de fechas
  - Acciones: ver detalle, imprimir PDF, cancelar
  - Modal detalle con items, totales y pagos

- Pagina `/sales/customers` — Clientes:
  - Tabla con busqueda, tipo, credito
  - Modal crear/editar con todos los campos
  - Vista detalle: datos, limite credito, deuda pendiente, credito disponible, ultimas facturas

## Sesion 5b — Importacion masiva, codigos de categoria y areas de impresion (Completada)
### Migracion Prisma
- Modelo `PrintArea`: id, name, description, isActive, categories[], printJobs[]
- Modelo `PrintJob`: id, invoiceId, printAreaId, status (PENDING/PRINTED/FAILED), items (Json)
- Modelo `PriceAdjustmentLog`: id, filters (Json), adjustmentType, gananciaPct, gananciaMayorPct, productsAffected, createdById
- Enum `PrintStatus`: PENDING, PRINTED, FAILED
- Category actualizada: `code String? @unique`, `lastProductNumber Int @default(0)`, `printAreaId String?`, `printArea PrintArea?`
- Invoice actualizada: `printJobs PrintJob[]`

### Migracion de datos
- Asignacion de codigos 3 letras a categorias raiz: HER (Herramientas), PIN (Pinturas), ELE (Electricidad), PLO (Plomeria), FER (Ferreteria General)
- Reasignacion de codigos de productos de PROD-XXX a nuevo formato: HER00001, PIN00001, ELE00001, etc.
- Actualizacion de lastProductNumber por categoria
- Limpieza de categorias duplicadas del seed multiple
- Regeneracion de searchVector para todos los productos

### Backend
- **PrintAreasModule**: CRUD completo (GET/POST/PATCH/DELETE /print-areas) con conteo de categorias, validacion de borrado
- **ImportModule**:
  - `POST /import/validate` — validacion sin insertar, retorna preview de creados/saltados/errores
  - `POST /import` — importacion real en transaccion con timeout 60s
  - Orden de importacion: categorias -> marcas -> proveedores -> productos
  - Soporta creacion de categorias con subcategorias, marcas y proveedores si no existen
  - DTO con ImportCategoryDto, ImportBrandDto, ImportSupplierDto, ImportProductDto
- **PrintJobsModule**:
  - `GET /print-jobs/pending?printAreaId=` — trabajos pendientes por area
  - `PATCH /print-jobs/:id/printed` — marcar como impreso
- **CategoriesService** actualizado:
  - Validacion de codigo: 3 letras, uppercase, unico
  - Soporte printAreaId en create/update
  - Subcategorias no requieren codigo
- **ProductsService** actualizado:
  - `generateCodeFromCategory()` con UPDATE...RETURNING atomico para incremento seguro del correlativo
  - Si no se proporciona code, se genera automaticamente desde la categoria
  - Si se proporciona code, se valida unicidad
  - Include de printArea en relacion category en todas las queries
- **InvoicesService.pay()** actualizado:
  - Al cobrar, agrupa items por area de impresion de su categoria
  - Crea PrintJob por cada area con items JSON: [{code, supplierRef, name, quantity}]

### Frontend
- Pagina `/catalog/categories` actualizada:
  - Campo codigo (3 letras, uppercase) para categorias raiz
  - Selector de area de impresion
  - Display formato "HER — Herramientas" con badge area de impresion
- Pagina `/settings/print-areas` (nueva):
  - CRUD de areas de impresion con tabla, modal crear/editar, toggle activo, eliminar
- Pagina `/import` (nueva):
  - Zona drag&drop para archivos JSON
  - Textarea para pegar JSON manualmente
  - Boton Validar (preview) y boton Importar
  - Reporte de resultados: creados, saltados, errores
- Componente `PrintMonitor` (nuevo):
  - Polling /print-jobs/pending cada 5 segundos
  - Usa localStorage 'printAreaId' para filtrar por area
  - Abre window.print() con formato ticket 80mm (codigo, ref proveedor, nombre, cantidad)
  - Marca automaticamente como PRINTED despues de imprimir
- Pagina `/catalog/products` actualizada:
  - Columna "Area de impresion" (readonly, desde category.printArea.name)
  - Placeholder de codigo: "Auto (segun categoria)"
- Sidebar: 2 nuevos items — "Areas de Impresion" y "Importacion Masiva"
- Layout: PrintMonitor agregado como componente global
- Pagina `/config` actualizada: seccion "Area de Impresion de esta PC" con dropdown guardado en localStorage

### Verificaciones
- Codigo de producto HER00007 generado correctamente al crear producto en categoria "Herramientas"
- Importacion JSON valida y ejecuta correctamente (validate retorna preview, import crea productos)
- Endpoint /print-jobs/pending funcional
- Print areas CRUD funcional
- API compila sin errores

## Sesion 5c — Ajuste masivo de precios (Completada)
### Backend
- **ProductsModule** — 3 nuevos endpoints:
  - `GET /products/price-adjustment` — lista productos con filtros combinables (categoryId, subcategoryId, brandId, supplierId, costMin, costMax), maximo 500 resultados, incluye category/brand/supplier
  - `POST /products/price-adjustment` — aplica ajuste masivo en transaccion Prisma:
    - adjustmentType: REPLACE (reemplaza ganancia) o ADD (suma/resta al existente)
    - Recalcula priceDetal y priceMayor con formula completa (costo × brega × ganancia × IVA)
    - Crea PriceAdjustmentLog con filtros, tipo, valores y productos afectados
    - Solo ADMIN (RolesGuard)
    - Timeout transaccion 60s
  - `GET /products/price-adjustment/history` — historial de ajustes con nombre de usuario enriquecido, ultimos 50 ordenados por fecha DESC
- DTOs: `PriceAdjustmentQueryDto` (con Transform para parseo de query params), `ApplyPriceAdjustmentDto` (con ValidateNested para filtros)

### Frontend
- Pagina `/catalog/price-adjustment` — layout 3 paneles:
  - Panel izquierdo — Filtros: selectores categoria (con subcategoria dinamica), marca, proveedor, rango costo USD, boton "Ver productos afectados"
  - Panel central — Preview: tabla con codigo, nombre, categoria, marca, costo, ganancia%, precios; muestra nuevos valores en tiempo real (flechas con color verde/rojo); contador "X productos seran afectados"
  - Panel derecho — Configuracion: toggle REPLACE/ADD, inputs ganancia detal% y mayor% con preview del primer producto, boton "Aplicar cambio"
  - Modal de confirmacion: resumen de productos afectados, tipo de ajuste, valores, advertencia "no se puede deshacer", botones cancelar/confirmar
  - Banner de exito con link a historial
  - Seccion historial al final: tabla con fecha, filtros (texto legible), tipo (badge color), ganancia%, productos afectados, usuario
- Sidebar actualizado: "Ajuste de precios" con icono SlidersHorizontal bajo seccion CATALOGO

### Verificaciones
- GET /products/price-adjustment?categoryId=HER retorna 7 productos con todos los campos requeridos
- POST /products/price-adjustment REPLACE gananciaPct=45 → 7 productos actualizados, precios recalculados correctamente
- Verificacion post-ajuste: gananciaPct cambio de 40% a 45%, priceDetal de Martillo cambio de $19.49 a $20.18
- GET /products/price-adjustment/history retorna logs con createdByName "Administrador"
- TypeScript compila sin errores en ambos apps (api y web)
- API levanta correctamente con todos los endpoints mapeados

## Sesion 6d — Estados de factura en español y eliminacion de pendientes (Completada)
### Backend
- **InvoicesService**:
  - `cancel()` restringido a PENDING/DRAFT solamente — PAID/CREDIT retorna 400 "Las facturas pagadas no pueden cancelarse. Emite una nota de credito."
  - TODO comment: facturas PAID se cancelaran via Notas de Credito en futuras sesiones
  - `delete()` nuevo metodo: hard-delete de facturas PENDING/DRAFT (elimina items, payments e invoice en transaccion)
- **InvoicesController**: nuevo endpoint `DELETE /invoices/:id`

### Frontend
- Pagina `/sales/invoices`:
  - STATUS_LABELS en español: DRAFT/PENDING="En Espera", PAID="Procesado", CREDIT="Credito", CANCELLED="Cancelado"
  - STATUS_COLORS: En Espera (amarillo), Procesado (verde), Credito (azul), Cancelado (rojo)
  - Boton eliminar (Trash2) para facturas PENDING/DRAFT
  - Eliminado boton cancelar de facturas PAID/CREDIT
- Pagina `/sales/customers`: estados en español con colores actualizados (CREDIT ahora azul)

## Sesion 7 — Modulo de Cotizaciones (Completada)
### Migracion Prisma
- Enum `QuotationStatus`: DRAFT, SENT, APPROVED, REJECTED, EXPIRED
- Modelo `Quotation`: id, number (unique), customerId?, status, subtotalUsd, ivaUsd, totalUsd, notes, expiresAt, convertedToInvoiceId?, items[], createdById, timestamps
- Modelo `QuotationItem`: id, quotationId, productId, productName, productCode, quantity, unitPriceUsd, ivaType, ivaAmount, totalUsd (onDelete: Cascade)
- CompanyConfig: campo `quotationValidityDays Int @default(30)`
- Customer: relacion `quotations Quotation[]`
- Migracion: `20260510180000_add_quotations_module`

### Backend
- **QuotationsModule** con controller, service, PDF service y cron service
- **QuotationsService**:
  - `findAll()` — paginado con filtros: status, customerId, from, to, search
  - `findOne()` — detalle con items, customer, createdBy
  - `create()` — numeracion automatica COT-XXXX (correlativo global), calcula IVA extraido de priceDetal, fecha expiracion segun quotationValidityDays
  - `update()` — solo DRAFT, actualiza items y totales
  - `changeStatus()` — transiciones validas: DRAFT→SENT, SENT→APPROVED/REJECTED, cualquiera→EXPIRED
  - `convertToInvoice()` — obtiene tasa del dia, crea factura con SELECT FOR UPDATE para numero, copia items, marca quotation con convertedToInvoiceId
  - `expireOldQuotations()` — marca expiradas las que pasaron expiresAt
  - `cancelOldPendingInvoices()` — cancela facturas PENDING de dias anteriores
- **QuotationPdfService**: PDF con pdfkit — header empresa, datos cotizacion/cliente, tabla items con codigos, desglose IVA, totales USD, nota sobre tasa BCV
- **QuotationsCronService**: cron diario a medianoche (@Cron EVERY_DAY_AT_MIDNIGHT) — expira cotizaciones y cancela facturas pendientes
- **QuotationsController**: GET /, GET /:id, POST /, PATCH /:id, PATCH /:id/status, POST /:id/convert, GET /:id/pdf
- AppModule: agregado ScheduleModule.forRoot() y QuotationsModule

### Frontend
- Pagina `/quotations`:
  - Tabla con filtros: status, rango de fechas
  - Badges de estado con colores: Borrador (gris), Enviada (azul), Aprobada (verde), Rechazada (rojo), Expirada (amarillo)
  - Modal detalle con items, totales, acciones por estado
  - Botones contextuales: Marcar Enviada (DRAFT), Aprobar/Rechazar (SENT), Convertir a Factura (APPROVED)
  - Boton imprimir PDF
  - Paginacion
- POS `/sales/pos`:
  - Boton "Guardar cotizacion" (icono FileCheck) visible para todos los roles
  - POST /quotations con items del carrito y cliente seleccionado
  - Dialogo post-guardado: "¿Limpiar carrito para nueva venta?"
- Sidebar: seccion COTIZACIONES con enlace a /quotations
- Config `/config`: campo "Validez de cotizaciones (dias)" en seccion parametros financieros

### Verificaciones
- Cotizacion creada: COT-0001 status=DRAFT total=$10.22
- Cambio de estado: DRAFT → SENT → APPROVED
- Conversion a factura: COT-0001 → FAC-02-26-00000007 status=DRAFT total=$10.22 totalBs=Bs5110.00
- PDF generado: 200 OK, content-type=application/pdf, size=2235 bytes
- TypeScript compila sin errores en ambos apps

## Sesion 6 — POS Improvements (Completada)
### Migracion Prisma
- Enum `PermissionKey` con valor `OVERRIDE_PRICE`
- Modelo `UserPermission`: id, userId, permissionKey, createdAt, @@unique([userId, permissionKey])
- Customer: eliminado enum `CustomerType`, campo `type` reemplazado por `documentType String @default("V")` (V, E, J, G, C, P)
- Migracion: `20260510140000_add_override_price_permission`

### Backend
- **AuthModule**:
  - `GET /auth/me` ahora retorna `permissions: string[]` del usuario
  - Fix: `@CurrentUser('id')` en vez de `@CurrentUser('sub')` (JWT strategy retorna `{id, email, role}`)
- **UsersModule**:
  - `PATCH /users/:id/permissions` — asignar permisos granulares (ADMIN-only)
  - `findAll()` y `findOne()` incluyen permissions en response
- **CustomersModule**:
  - DTO actualizado: `documentType` con `@IsIn(['V', 'E', 'J', 'G', 'C', 'P'])` reemplaza `type`
- **InvoicesModule**:
  - `GET /invoices/pending?today=true` — filtra por fecha UTC del dia actual
  - Response incluye `customer.documentType`, primeros 3 items, y `totalItems` count

### Frontend
- Pagina `/sales/pos` — mejoras completas:
  - **Modal cliente inline**: crear/editar cliente directamente desde POS con selector documentType (V/E/J/G/C/P)
  - **Override de precio**: boton ⋯ en items del carrito, edicion inline con badge "Precio modificado", solo visible si `canOverridePrice` (ADMIN o permiso OVERRIDE_PRICE)
  - **Dos botones de guardado**: "En espera" (guarda sin limpiar carrito, status DRAFT) y "Pre-factura" (guarda y limpia, status depende de rol)
  - **Drawer de facturas pendientes**: panel derecho con polling 30s, muestra facturas PENDING de hoy, acciones Retomar (carga en POS) y Cancelar (con confirmacion)
  - **Badge contador**: boton "En espera" en header muestra count de pendientes
  - Fetch de permisos del usuario via `/auth/me` al cargar
- Pagina `/sales/customers` — actualizada:
  - Selector documentType (V/E/J/G/C/P) reemplaza selector tipo NATURAL/JURIDICA
  - Display en tabla con formato "{documentType}-{rif}"

### Verificaciones
- Login retorna permissions correctamente
- `PATCH /users/:id/permissions` asigna OVERRIDE_PRICE
- `GET /auth/me` retorna profile con permissions array
- Customers CRUD con documentType funciona (crear J, actualizar a V)
- `GET /invoices/pending?today=true` filtra correctamente
- Invoices se crean con customer asociado y numero correlativo
- TypeScript compila sin errores

## Sesion 6b — POS Buttons Simplification & Invoice Lock System (Completada)
### Migracion Prisma
- Invoice: campos `lockedById String?` y `lockedAt DateTime?`
- Migracion: `20260510160000_add_invoice_lock`

### Backend
- **InvoicesModule**:
  - `PATCH /invoices/:id/retake` — bloquea factura para el usuario actual. Si ya esta bloqueada por otro (y no expirada), retorna 409 Conflict con nombre del usuario que la tiene
  - `PATCH /invoices/:id/update-items` — actualiza items de factura existente (recalcula totales), libera bloqueo
  - `findPending()` ahora incluye facturas DRAFT y PENDING, muestra `lockedById`, `lockedAt`, `lockedByName`
  - Auto-expiracion de bloqueos > 10 minutos (verificado al consultar, no con cron)
  - `pay()` y `cancel()` liberan bloqueo automaticamente

### Frontend
- Pagina `/sales/pos` — botones simplificados:
  - **SELLER**: un solo boton "Guardar pre-factura" (guarda + limpia carrito)
  - **CASHIER/ADMIN**: "En espera" (guarda + limpia) + "Cobrar" (pago directo)
  - Eliminado boton duplicado "Pre-factura" de la vista CASHIER/ADMIN
  - Al guardar factura retomada: llama `PATCH /update-items` en vez de crear nueva (actualiza + libera bloqueo)
  - Al retomar: llama `PATCH /retake` para bloquear antes de cargar
- Drawer de pendientes — sistema de bloqueo visual:
  - Factura bloqueada por otro: opacidad reducida, badge rojo "Editando: {nombre}", botones deshabilitados
  - Factura bloqueada por mi: badge azul "Editando por ti", permitido retomar
  - Error 409 mostrado como mensaje si alguien mas la tomo primero

### Verificaciones
- Retake bloquea correctamente (lockedById se setea)
- Update-items actualiza totales y libera bloqueo
- Mismo usuario puede retomar su propio bloqueo
- Cancel libera bloqueo
- findPending incluye DRAFT y PENDING con info de bloqueo
- Auto-expiracion: bloqueos > 10min se ignoran en la respuesta
- TypeScript compila sin errores en ambos apps

## Sesion 6c — Fix IVA Double Calculation & Default Profit Margins (Completada)
### Migracion Prisma
- CompanyConfig: campos `defaultGananciaPct Float @default(0)` y `defaultGananciaMayorPct Float @default(0)`
- Migracion: `20260510170000_add_default_ganancia_to_config`

### Backend
- **InvoicesService** — fix calculo IVA:
  - Bug: `priceDetal` ya incluye IVA (formula: costo × brecha × ganancia × IVA), pero al facturar se aplicaba IVA otra vez sobre ese precio
  - Fix: extraer precio base con `baseUnitPrice = priceWithIva / (1 + ivaRate)` antes de calcular IVA
  - Aplicado en `create()` y `updateItems()`
  - IVA rates mapeados: EXEMPT=0, REDUCED=0.08, GENERAL=0.16, SPECIAL=0.31
- **ProductsService** — defaults de ganancia:
  - `create()` ahora consulta CompanyConfig para obtener defaults
  - Si `gananciaPct` o `gananciaMayorPct` no se proveen en el DTO, usa los valores de config
  - Almacena los valores resueltos en el producto creado
- **CompanyConfigDto** — nuevos campos opcionales: `defaultGananciaPct`, `defaultGananciaMayorPct`

### Frontend
- Pagina `/sales/pos` — fix calculo IVA frontend:
  - Misma logica: extrae base price antes de calcular desglose IVA en tiempo real
  - Subtotal + IVA = total correcto sin doble aplicacion
- Pagina `/config` — seccion "Precios por defecto":
  - Inputs para ganancia detal y mayor por defecto (%)
  - Descripcion: "Se aplicara automaticamente a los productos nuevos que no tengan ganancia configurada"
  - Se guarda con el resto de la configuracion
- Pagina `/catalog/products` — pre-llenado:
  - Al abrir modal de crear producto, se pre-llenan gananciaPct y gananciaMayorPct con los defaults de config
  - El usuario puede sobreescribirlos manualmente

### Verificaciones
- Test con producto existente: priceDetal=$1.22 → subtotal=$1.05, IVA=$0.17, total=$1.22 (correcto, sin doble IVA)
- Test ejemplo del prompt: costo $25.99, brecha 50%, ganancia 30%, IVA 16% → priceDetal=$58.79, subtotal=$50.68, IVA=$8.11, total=$58.79
- Config defaults: defaultGananciaPct=35, defaultGananciaMayorPct=25 se guardan y cargan correctamente
- TypeScript compila sin errores en ambos apps

## Sesion 8 — Caja y Arqueo (Completada)
### Migracion Prisma
- CashRegister: eliminados campos `currentUserId` y `openedAt`, agregado `isFiscal Boolean @default(false)`
- CashSession: renombrado `userId` a `openedById`, agregado `closedById String?`, relaciones `openedBy` y `closedBy` con User
- User: agregadas relaciones `sessionsOpened` y `sessionsClosed`
- Migracion: `20260510190000_update_cash_register_sessions`

### Backend
- **CashRegistersService** — reescrito completo:
  - `findAll()` — lista cajas activas con sesiones OPEN y openedBy
  - `findOpen()` — solo cajas con al menos una sesion activa
  - `findOne(id)` — detalle con sesiones activas + resumen de ventas del dia
  - `openSession()` — abre nueva sesion, multiples sesiones por caja permitidas
  - `closeSession()` — cierra sesion por sessionId, calcula resumen y diferencia
  - `getSessionSummary()` — resumen detallado: ventas por metodo de pago, totales, balance esperado, diferencia
  - `findAllSessions()` — lista todas las sesiones con filtros (cashRegisterId, status)
  - Helper `getSessionSalesData()` — agrupa pagos de facturas PAID/CREDIT del periodo de la sesion
- **CashRegistersController** — endpoints:
  - `GET /cash-registers` — todas las cajas
  - `GET /cash-registers/open` — cajas con sesion activa
  - `GET /cash-registers/:id` — detalle con todaySummary
  - `POST /cash-registers/:id/open-session` — abrir sesion
  - `GET /cash-sessions` — historial de sesiones (filtrable por caja y estado)
  - `GET /cash-sessions/:id/summary` — arqueo detallado
  - `POST /cash-sessions/:id/close` — cerrar sesion con closingBalance
- Fix: `InvoicesService` y `QuotationsService` — cambiado `userId` a `openedById` en queries de CashSession

### Seed
- 3 cajas: Caja Notas (01, isFiscal:false), Fiscal 1 (02, isFiscal:true), Fiscal 2 (03, isFiscal:true)

### Frontend
- **POS `/sales/pos`** — modal de seleccion de caja:
  - Al entrar al POS verifica localStorage `selectedCashRegisterId`
  - Si no hay caja → modal fullscreen no-dismissable con lista de cajas
  - Cajas con sesion activa: card con nombre, codigo, fiscal badge, sesiones activas, boton "Usar esta caja"
  - Cajas cerradas: boton "Abrir caja" con input de fondo inicial
  - Header del POS muestra caja seleccionada + boton "Cambiar caja"
  - cashRegisterId incluido en creacion de facturas y cobros
- **Pagina `/cash`** — gestion de cajas:
  - Tabla de cajas con nombre, codigo, tipo fiscal, sesiones activas
  - Boton "Abrir sesion" con modal (monto apertura + notas)
  - Indicador visual de estado (verde si activa, gris si cerrada)
- **Pagina `/cash/sessions`** — historial de sesiones:
  - Filtros por caja y estado (OPEN/CLOSED)
  - Tabla: caja, abierta por, fechas, montos, estado (badge verde/gris)
  - Boton "Ver arqueo" → modal detallado
  - Modal de arqueo: datos sesion, tabla ventas por metodo de pago, totales USD/Bs, balance esperado vs fisico, diferencia
  - Si sesion abierta: campo monto fisico + boton "Cerrar sesion"
- **Sidebar**: seccion CAJA con 2 items (Gestion de cajas, Sesiones)

### Verificaciones
- GET /cash-registers retorna 3 cajas con datos correctos (Caja Notas, Fiscal 1, Fiscal 2)
- POST /cash-registers/:id/open-session crea sesion con openingBalance=$50
- GET /cash-registers/open retorna solo cajas con sesiones activas
- GET /cash-sessions/:id/summary retorna resumen correcto (openingBalance, expectedBalance, difference)
- POST /cash-sessions/:id/close cierra sesion con closingBalance, calcula diferencia=$0 (cuadra)
- GET /cash-sessions retorna historial con cashRegister, openedBy, closedBy
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 7 — Cuentas por Cobrar (Completada)
### Migracion Prisma
- Receivable: agregado campo `paidAmountUsd Float @default(0)`
- Modelo `ReceivablePayment`: id, receivableId, amountUsd, amountBs, exchangeRate, method, reference, cashSessionId, notes, createdById, createdAt
- CompanyConfig: agregado `overdueWarningDays Int @default(3)`
- Migracion: `20260510200000_update_receivables_module`

### Backend
- **ReceivablesModule** completo con controller, service, cron:
  - `GET /receivables` — lista con filtros: type, status, customerId, platformName, from, to, overdue, page, limit. Retorna balanceUsd calculado
  - `GET /receivables/summary` — resumen global: totalPendingUsd, totalOverdueUsd, byPlatform (Cashea/Crediagro), byStatus
  - `GET /receivables/:id` — detalle con historial de pagos completo
  - `POST /receivables/:id/pay` — registrar cobro parcial o total en transaccion:
    - Calcula amountBs con tasa del dia
    - Crea ReceivablePayment
    - Actualiza paidAmountUsd
    - Si completado → status PAID + paidAt
    - Si parcial → status PARTIAL
    - Valida que monto no exceda saldo
  - `GET /receivables/customer/:customerId` — estado de cuenta: deuda total, vencida, credito disponible, lista de CxC
- **ReceivablesCronService**: cron diario a las 00:01 — marca como OVERDUE receivables con dueDate < hoy y status PENDING/PARTIAL
- CompanyConfig DTO: agregado campo `overdueWarningDays`

### Frontend
- **Sidebar**: nueva seccion CXC con 2 items (Cuentas por cobrar, Por plataforma)
- **Pagina `/receivables`** — Cuentas por cobrar:
  - 4 tarjetas resumen: Total por cobrar (azul), Vencidas (rojo), Cashea pendiente (verde), Crediagro pendiente (verde)
  - Filtros: tipo, estado, desde, hasta, toggle solo vencidas
  - Tabla con columnas: Tipo (badge), Cliente/Plataforma, Factura, Monto USD, Cobrado USD, Saldo USD, Vence, Estado, Acciones
  - Badges de estado: Pendiente (amarillo), Parcial (azul), Pagado (verde), Vencido (rojo)
  - Filas vencidas con fondo rojo, proximas a vencer con fondo amarillo (segun overdueWarningDays)
  - Modal "Registrar cobro": info CxC, monto editable, metodo pago, referencia, tasa del dia, monto Bs
  - Modal "Ver detalle": info completa + tabla historial de pagos (fecha, USD, Bs, metodo, ref)
  - Paginacion
- **Pagina `/receivables/platforms`** — Por plataforma:
  - Tabs: Cashea | Crediagro
  - Tarjetas resumen por plataforma (pendiente, cobros completados)
  - Tabla filtrada por plataforma con acciones cobrar/detalle
  - Modales de cobro y detalle
- **Pagina `/sales/customers`** — Estado de cuenta agregado:
  - Seccion "Estado de Cuenta" en modal detalle del cliente
  - 3 tarjetas: Deuda Total, Vencido, Credito Disponible
  - Lista de CxC pendientes con boton "Cobrar" inline (expansion con input monto, metodo, boton confirmar)
- **Pagina `/config`** — nuevo campo:
  - "Alerta de vencimiento CxC (dias antes)" con descripcion

### Verificaciones
- Flujo credito completo: crear factura credito → CxC generada (PENDING, $13.95) → cobro parcial ($6.97, PARTIAL) → cobro total ($6.98, PAID, balance=$0) → credito disponible restaurado ($500)
- Flujo Cashea completo: factura pagada con Cashea → CxC a plataforma generada ($4.65) → cobro registrado → status PAID
- GET /receivables/summary retorna totalPendingUsd y byPlatform correctos
- GET /receivables/customer/:id retorna estado de cuenta con deuda y credito
- Detalle con historial de 2 pagos (TRANSFERENCIA ref=REF-001, PAGO_MOVIL ref=REF-002)
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 8 — Cuentas por Pagar con Retencion IVA (Completada)
### Migracion Prisma
- Enum `PayableStatus`: PENDING, PARTIAL, PAID, OVERDUE
- Modelo `Payable`: id, supplierId, purchaseOrderId, amountUsd, amountBs, exchangeRate, retentionUsd, retentionBs, netPayableUsd, dueDate, status, paidAmountUsd, paidAt, notes, payments[], timestamps
- Modelo `PayablePayment`: id, payableId, amountUsd, amountBs, exchangeRate, method, reference, notes, createdById, createdAt
- PurchaseOrder: agregados `isCredit Boolean @default(false)`, `creditDays Int @default(0)`, relacion `payables Payable[]`
- CompanyConfig: agregado `ivaRetentionPct Float @default(75)`
- Supplier: agregada relacion `payables Payable[]`
- Migracion: `20260510210000_add_payables_module`

### Backend
- **PayablesModule** completo con controller, service, cron:
  - `GET /payables` — lista con filtros: supplierId, status, from, to, overdue, page, limit. Retorna balanceUsd calculado (netPayableUsd - paidAmountUsd)
  - `GET /payables/summary` — resumen global: totalPendingUsd, totalOverdueUsd, totalRetentionUsd, supplierCount, bySupplier
  - `GET /payables/:id` — detalle con historial de pagos, proveedor y orden vinculada
  - `POST /payables/:id/pay` — registrar pago parcial o total en transaccion:
    - Calcula amountBs con tasa del dia
    - Crea PayablePayment
    - Actualiza paidAmountUsd
    - Si completado → status PAID + paidAt
    - Si parcial → status PARTIAL
  - `GET /payables/supplier/:supplierId` — estado de cuenta: totalDebt, totalOverdue, totalRetention, lista de CxP
- **PayablesCronService**: cron diario a las 00:02 — marca como OVERDUE payables con dueDate < hoy y status PENDING/PARTIAL
- **PurchaseOrdersService** actualizado:
  - CreatePurchaseOrderDto: agregados `isCredit` y `creditDays`
  - `create()` guarda isCredit y creditDays
  - `receive()` al recibir orden completa con isCredit=true:
    - Obtiene tasa del dia
    - Calcula IVA total de los items recibidos
    - Si supplier.isRetentionAgent → calcula retencion IVA (ivaRetentionPct% del IVA total)
    - Crea Payable con amountUsd, retentionUsd, netPayableUsd, dueDate (receivedAt + creditDays)
- CompanyConfig DTO: agregado campo `ivaRetentionPct`

### Frontend
- **Sidebar**: nueva seccion CXP con item "Cuentas por pagar" (icono Receipt)
- **Pagina `/payables`** — Cuentas por pagar:
  - 4 tarjetas resumen: Total por pagar (rojo), Vencidas (rojo oscuro), Retenciones IVA (naranja), Proveedores con deuda (azul)
  - Filtros: proveedor, estado, rango de fechas, toggle solo vencidas
  - Tabla: Proveedor, Orden, Monto USD, Retencion, Neto USD, Pagado, Saldo, Vence, Estado, Acciones
  - Filas vencidas con fondo rojo, proximas a vencer con fondo amarillo
  - Modal "Registrar pago": info CxP con retencion desglosada, monto editable, metodo, referencia, tasa del dia
  - Modal "Ver detalle": info completa, seccion Retencion IVA (si aplica), tabla historial de pagos
  - Paginacion
- **Pagina `/purchases`** — actualizada:
  - Toggle "Compra a credito" en modal crear/editar
  - Campo "Dias de credito" cuando isCredit=true
  - Badge "Se generara CxP al recibir" + "Aplicara retencion IVA" si proveedor es agente de retencion
- **Pagina `/catalog/suppliers`** — Estado de cuenta agregado:
  - Boton "Estado de cuenta" (icono Receipt) en acciones
  - Modal con 3 tarjetas: Total adeudado, Vencido, Retenciones
  - Lista de CxP pendientes con orden, neto, saldo, vencimiento, estado
- **Pagina `/config`** — nuevo campo:
  - "Retencion IVA (%)" con default 75 y descripcion de ley venezolana

### Verificaciones
- Flujo completo: crear PO credito con proveedor agente de retencion → enviar → recibir → CxP generada con retencion calculada (amountUsd=$100, retentionUsd=$6, netPayableUsd=$94) → pago parcial $30 (PARTIAL) → pago total $64 (PAID, balance=$0)
- GET /payables/summary: totalPendingUsd, totalRetentionUsd, supplierCount correctos
- GET /payables/supplier/:id: estado de cuenta con deuda $0 despues de pago completo
- ivaRetentionPct=75 en config (configurable)
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 9 — Documentos Fiscales Venezolanos (Completada)
### Migracion Prisma
- PurchaseOrder: agregados `supplierControlNumber String?`, `islrRetentionPct Float?`, `islrRetentionUsd Float?`, `islrRetentionBs Float?`
- CompanyConfig: agregado `islrRetentionPct Float @default(0)`
- Invoice: campo `controlNumber` ya existia del schema original
- Migracion: `20260510220000_add_fiscal_documents_fields`

### Backend
- **FiscalModule** nuevo con controller y service:
  - `GET /fiscal/libro-ventas?from&to` — Libro de Ventas formato SENIAT:
    - Filtra facturas PAID y CREDIT en el periodo con setUTCHours
    - Por cada factura: fecha, numero, control, RIF/nombre cliente, bases imponibles (exenta, reducida, general, especial), IVA desglosado (8%, 16%, 31%), total
    - Totales del periodo
  - `GET /fiscal/libro-compras?from&to` — Libro de Compras formato SENIAT:
    - Filtra PurchaseOrders RECEIVED en el periodo
    - Por cada orden: fecha, numero proveedor, control proveedor, RIF/nombre proveedor, bases imponibles, IVA desglosado, retencion IVA, retencion ISLR, total
    - Totales del periodo
  - `GET /fiscal/resumen?from&to` — Resumen fiscal:
    - Ventas: totalFacturas, baseImponibleTotal, ivaTotal, totalVentas
    - Compras: totalOrdenes, baseImponibleTotal, ivaTotal, retencionesIva, retencionesIslr, totalCompras
    - Balance IVA: debito fiscal, credito fiscal, IVA por pagar/recuperar
- **InvoicesModule** actualizado:
  - `PATCH /invoices/:id/control-number` — actualizar numero de control (solo ADMIN)
- **PurchaseOrdersModule** actualizado:
  - CreatePurchaseOrderDto: agregados `supplierControlNumber`, `applyIslr`, `islrRetentionPct`
  - `create()` calcula ISLR si aplica
  - `update()` recalcula ISLR y permite editar supplierControlNumber
  - `receive()` calcula ISLR final sobre monto recibido, descuenta del netPayableUsd en el Payable
- **CompanyConfigDto**: agregado campo `islrRetentionPct`

### Frontend
- **Sidebar**: nueva seccion FISCAL con 3 items: Libro de Ventas, Libro de Compras, Resumen Fiscal
- **Pagina `/fiscal/libro-ventas`**:
  - Selector periodo (mes/ano), boton Generar y Exportar PDF
  - Tabla SENIAT: N, Fecha, Factura, Control, RIF, Cliente, Base Exenta/Reducida/General/Especial, IVA 8%/16%/31%, Total
  - Fila totales en negrita, formato numerico venezolano
  - Exportar PDF A4 horizontal formato SENIAT
- **Pagina `/fiscal/libro-compras`**:
  - Mismo formato con columnas adicionales: Ret. IVA (naranja), Ret. ISLR (purpura)
  - Exportar PDF horizontal
- **Pagina `/fiscal/resumen`**:
  - 2 cards: Ventas (verde) y Compras (azul)
  - Tabla balance IVA: debito vs credito = IVA por pagar/recuperar
  - Seccion retenciones del periodo
- **Pagina `/purchases`** — modal crear/editar:
  - Campo "N Control del proveedor"
  - Toggle "Aplica retencion ISLR" con porcentaje pre-llenado desde config
  - Calculo ISLR en tiempo real
- **Pagina `/config`**: campo "Retencion ISLR por defecto (%)"

### Verificaciones
- 5 facturas de venta con diferentes IVA types (EXEMPT, REDUCED, GENERAL, mixtas)
- Numeros de control asignados: 00-001234, 00-001235, 00-001236
- Libro de ventas: 12 facturas con desglose correcto por tipo IVA
- 2 ordenes de compra: PO-0004 con IVA+ISLR (retIVA=$16.20, retISLR=$2.70), PO-0005 sin retenciones
- Libro de compras: 5 ordenes, retenciones IVA=$22.20, ISLR=$2.70
- Resumen fiscal: IVA debito=$61.64, credito=$96.78, saldo a recuperar=-$35.14
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 12 — Gestion de Usuarios y Menu Colapsable (Completada)
### Backend
- **Role Permissions** (`apps/api/src/modules/auth/role-permissions.ts`):
  - Mapa fijo ROLE_PERMISSIONS por rol: ADMIN=['*'], SUPERVISOR=[dashboard,sales,quotations,catalog,inventory,purchases,cash,receivables,payables,fiscal], CASHIER=[dashboard,sales,quotations,cash,receivables], SELLER=[dashboard,sales,quotations], WAREHOUSE=[dashboard,inventory,purchases], BUYER=[dashboard,catalog,purchases,payables], ACCOUNTANT=[dashboard,receivables,payables,fiscal]
  - Permisos incluidos en JWT payload al hacer login y refresh
- **AuthModule** actualizado:
  - JWT payload expandido: sub, name, email, role, permissions, mustChangePassword
  - Login: retorna 403 "Usuario inactivo" si isActive=false (antes retornaba 401 generico)
  - Login: actualiza lastLoginAt
  - Login: retorna permissions y mustChangePassword en response body
  - `PATCH /auth/change-password` — nuevo endpoint:
    - Si mustChangePassword=true: no requiere contrasena actual
    - Si mustChangePassword=false: requiere y verifica contrasena actual
    - Validacion: minimo 8 caracteres, al menos una mayuscula y un numero
    - Al cambiar: mustChangePassword=false
  - jwt.strategy.ts: ahora pasa permissions y mustChangePassword al request.user
  - refreshToken: recalcula permissions y mustChangePassword frescos desde DB
- **UsersModule** actualizado:
  - `POST /users` — contrasena opcional, genera temporal si no se especifica (10 chars alfanumericos)
  - `POST /users` — siempre mustChangePassword=true, retorna temporaryPassword en texto plano
  - `GET /users` — ahora incluye lastLoginAt, ordenado por createdAt DESC
  - `PATCH /users/:id` — solo actualiza name, email, role, isActive (no contrasena)
  - `PATCH /users/:id/reset-password` — genera nueva contrasena temporal, mustChangePassword=true
  - `PATCH /users/:id/toggle-active` — alterna isActive
  - `DELETE /users/:id` — verifica que no sea el ultimo ADMIN activo antes de eliminar
  - Validacion de email unico en create y update

### Frontend
- **Middleware** (`middleware.ts`) — completamente reescrito:
  - Decodifica JWT payload sin libreria externa (atob)
  - Si mustChangePassword=true y ruta no es /change-password → redirige a /change-password
  - Mapa de permisos por ruta: /sales→sales, /quotations→quotations, /catalog→catalog, /inventory→inventory, /purchases→purchases, /cash→cash, /receivables→receivables, /payables→payables, /fiscal→fiscal, /settings|/config|/users|/import→settings
  - Si usuario no tiene permiso para la ruta → redirige a /403
  - Rutas sin restriccion: /dashboard, /change-password, /403, /api/*
- **Sidebar colapsable** (`components/sidebar.tsx`) — rediseñado completamente:
  - Estructura de acordeon: secciones colapsables individualmente
  - Dashboard siempre visible como item principal
  - 10 secciones: VENTAS, COTIZACIONES, CATALOGO, INVENTARIO, COMPRAS, CAJA, CxC, CxP, FISCAL, CONFIGURACION
  - CONFIGURACION solo visible para ADMIN (Empresa, Usuarios, Areas de impresion, Importacion masiva)
  - Estado de secciones guardado en localStorage (trinity-sidebar-sections)
  - Estado de colapso guardado en localStorage (trinity-sidebar-collapsed)
  - Animacion suave de expand/collapse con max-height transition
  - Click en seccion colapsada expande sidebar y abre la seccion
  - Indicador visual: seccion con item activo se resalta en verde
  - ChevronDown con rotacion animada para indicar estado abierto/cerrado
  - Filtrado por permisos del rol (solo muestra secciones con permiso)
- **Pagina `/settings/users`** — gestion de usuarios:
  - Solo accesible para ADMIN
  - Header con titulo + boton "Nuevo usuario"
  - Barra de busqueda por nombre, email o rol
  - Tabla: Nombre, Email, Rol (badge con color por rol), Ultimo acceso, Estado, Acciones
  - Colores de badge: ADMIN=rojo, SUPERVISOR=naranja, CASHIER=azul, SELLER=verde, WAREHOUSE=amarillo, BUYER=morado, ACCOUNTANT=gris
  - Acciones: Editar, Resetear contrasena, Activar/Desactivar, Eliminar
  - Modal "Nuevo usuario": nombre, email, rol, contrasena temporal (opcional)
  - Modal "Editar usuario": nombre, email, rol, estado activo/inactivo
  - Modal "Resetear contrasena": confirmacion → muestra nueva contrasena
  - Modal "Contrasena generada": contrasena en mono font con boton copiar
  - Modal "Eliminar usuario": confirmacion con advertencia
- **Pagina `/change-password`** — cambio de contrasena:
  - Fuera del layout del dashboard (accesible sin sidebar)
  - Si mustChangePassword=true: no muestra campo de contrasena actual, mensaje amarillo
  - Si mustChangePassword=false: muestra campo de contrasena actual
  - Validacion en tiempo real: minimo 8 chars (check verde), mayuscula (check verde), numero (check verde)
  - Campo confirmar contrasena con validacion de match
  - Toggles de visibilidad (ojo) en cada campo
  - Al guardar exitosamente → redirige a login para obtener token fresco
- **Pagina `/403`** — acceso denegado:
  - Icono ShieldX rojo
  - Mensaje "No tienes permiso para acceder a esta seccion"
  - Boton "Volver al inicio" → /dashboard
- **Login** (`login/page.tsx`) — actualizado:
  - Si mustChangePassword=true → redirige a /change-password
  - Si mustChangePassword=false → redirige a /dashboard
- **Login API route** actualizada: retorna mustChangePassword en response
- **Dashboard layout** actualizado: pasa permissions al Sidebar

### Verificaciones
- Login ADMIN: permissions=['*'], mustChangePassword=false — acceso total
- Login SELLER: permissions=['dashboard','sales','quotations'], mustChangePassword=true — redirige a /change-password
- Inactive user login: retorna 403 "Usuario inactivo"
- Change password con mustChangePassword=true: funciona sin contrasena actual
- Post change: mustChangePassword=false en siguiente login
- SELLER intenta /inventory: redirigido a /403
- SELLER intenta /settings/users: redirigido a /403
- SELLER accede /dashboard: 200 OK
- SELLER accede /sales/pos: 200 OK
- GET /users: lista 9 usuarios con lastLoginAt
- Reset password: genera nueva contrasena temporal
- Toggle active: alterna isActive correctamente
- Usuarios creados: Maria (SUPERVISOR), Pedro (CASHIER), Ana (SELLER), Carlos (WAREHOUSE), Luis (BUYER), Rosa (ACCOUNTANT)
- TypeScript compila sin errores en ambos apps (API y Web)

## Sesion 12b — Permisos por Rol Configurables desde UI con Redis Cache (Completada)

### Base de datos
- **Modelo RolePermission**: tabla con role (unique) y modules (String[])
- Migracion `20260510230000_add_role_permissions_table`
- Seed actualizado: inserta permisos por defecto para los 7 roles via upsert

### Backend
- **RedisModule** (global): servicio wrapper sobre ioredis con get/set/del y TTL opcional
- **RolePermissionsModule**:
  - `GET /role-permissions` — lista todos los permisos por rol (requiere ADMIN)
  - `PATCH /role-permissions/:role` — actualiza modulos de un rol (requiere ADMIN, bloquea edicion de ADMIN)
  - Servicio con cache Redis (prefix `role-permissions:`, TTL 5 min)
  - `getModulesForRole(role)` — lee de Redis cache, fallback a DB
  - Al actualizar: invalida cache del rol modificado
  - Validacion de modulos contra whitelist (VALID_MODULES)
- **AuthService** actualizado:
  - Login, refreshToken y getProfile ahora leen permisos desde DB (via RolePermissionsService con cache)
  - Permisos se incluyen en JWT payload y response del login
  - Eliminada dependencia de mapa estatico ROLE_PERMISSIONS

### Frontend
- **Pagina `/settings/role-permissions`** — editor de permisos:
  - Card por cada rol con badge de color
  - Grid de checkboxes con los 12 modulos disponibles
  - ADMIN: todos marcados + deshabilitados + badge "Acceso total"
  - Boton "Guardar cambios" por rol, solo habilitado si hay cambios pendientes
  - Toast de confirmacion al guardar
- **Sidebar**: agregado link "Permisos por rol" en seccion CONFIGURACION (con icono Shield)
- Reorganizacion de sidebar: Cotizaciones movido a submenu VENTAS, Proveedores movido a submenu COMPRAS
- **Middleware**: ROUTE_PERMISSION_MAP cambiado a array de tuplas para soportar overrides especificos (/catalog/suppliers→purchases, /quotations→sales)

### Verificaciones
- GET /role-permissions: retorna 7 roles con sus modulos
- PATCH /role-permissions/CASHIER: actualiza modulos, cache Redis invalidado
- PATCH /role-permissions/ADMIN: retorna 400 "No se pueden modificar los permisos de ADMIN"
- Login refleja permisos de DB (no estaticos)
- TypeScript compila sin errores en web app

## Sesion 13 — Deployment en DigitalOcean (Completada)

### Servidor
- **Droplet**: Ubuntu 24.04, 1 vCPU, 2GB RAM, NYC1
- **IP**: 134.209.220.233
- **Acceso**: `ssh root@134.209.220.233` (llave SSH ed25519)

### Infraestructura instalada
- Docker + Docker Compose (PostgreSQL 15 + Redis 7 en contenedores)
- Node.js 20.x (via nodesource)
- pnpm (gestor de paquetes)
- PM2 (process manager con auto-restart al reboot)
- Nginx (reverse proxy puerto 80 → Next.js:3000)

### Servicios corriendo
| Servicio | Puerto | PM2 Name | Descripcion |
|----------|--------|----------|-------------|
| PostgreSQL | 5432 | Docker | Base de datos |
| Redis | 6379 | Docker | Cache de permisos |
| NestJS API | 4000 | trinity-api | Backend REST |
| Next.js Web | 3000 | trinity-web | Frontend SSR |
| Nginx | 80 | systemd | Reverse proxy |

### Archivos de configuracion en servidor
- `/opt/Trinity/packages/database/.env` — DATABASE_URL
- `/opt/Trinity/apps/api/.env` — DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, API_PORT
- `/opt/Trinity/apps/web/.env` — NEXT_PUBLIC_API_URL=http://localhost:4000, COOKIE_SECURE=false
- `/etc/nginx/sites-available/trinity` — config Nginx

### Fix aplicado
- Cookies `secure` flag controlado por env `COOKIE_SECURE=false` (necesario porque no hay HTTPS aun)
- Archivos modificados: `apps/web/src/app/api/auth/login/route.ts`, `apps/web/src/app/api/auth/refresh/route.ts`

### Migracion adicional creada en servidor
- `20260511010038_add_category_last_product_number` — campo `lastProductNumber` + unique constraint en `code` para Category

### Pendiente para futuro
- Comprar dominio y apuntar DNS a 134.209.220.233
- Configurar HTTPS con certbot (y cambiar COOKIE_SECURE=true)
- Configurar firewall (ufw): solo puertos 22, 80, 443

### Comandos utiles para mantenimiento
```bash
# Conectar al servidor
ssh root@134.209.220.233

# Ver estado de servicios
pm2 status
pm2 logs trinity-api --lines 20
pm2 logs trinity-web --lines 20

# Actualizar codigo (despues de push a GitHub)
cd /opt/Trinity && git pull && cd apps/api && npm run build && pm2 restart trinity-api && cd ../web && npm run build && pm2 restart trinity-web

# Reiniciar todo
pm2 restart all

# Ver contenedores Docker (DB + Redis)
docker ps
```
