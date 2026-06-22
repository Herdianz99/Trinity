# Trinity ERP — Progreso

## 📌 PENDIENTE PARA MAÑANA (Sesion 62 — 2026-06-19)
- **Operaciones en PRODUCCION ya aplicadas hoy (cerradas, solo registro)**: (a) **Reasignacion de vendedor**: las 10 facturas en estado PENDING que tenian a **LENNYS MEJIA** (`VEN-001`) se cambiaron a **YULEINI RODRIGUEZ** (`VEN-005`) — solo `sellerId`+`updatedAt`, las PAID no se tocaron. (b) **Fix factura NE-26-00000410**: el item `PIN01291` (ESMALTE 1/4GL) estaba en cantidad 1 y debia ser 2; se corrigio item (qty/iva/totales), totales de factura ($20.28->$33.55), se desconto 1 unidad mas de inventario (stock 22->21 + movimiento -1->-2), y el faltante ($13.27) se cargo al pago **Cashea** con su **CxC** ajustada (6.86->20.13). Todo cuadra: items=total, pagos=total, CxC=pago. Respaldo de filas en el server: `/opt/Trinity/fix-NE410-20260620-020507.txt`.
- **Cotejo de precios Wensoft vs sistema — DECISION PENDIENTE**: se cruzo el Excel `lista-pre.xlsx` (2.375 productos, columnas Referencia/Articulo/Existencias/Precio $ en USD) contra produccion por `code`. Resultado: **el STOCK esta sano** (solo 8 diferencias >=1, casi todas items de servicio tipo FLETE/RECUPERACION con stock negativo a proposito). **El problema son los PRECIOS: 424 productos (~18%) tienen el `priceDetal` desfasado** respecto a Wensoft, en ambas direcciones (no es una tasa ni un % sistematico, son cambios de precio reales no reflejados). Reportes CSV generados en la raiz del repo (no commiteados): `reporte-precios.csv` (424, ordenado por diferencia), `reporte-stock.csv` (8), `reporte-no-en-sistema.csv` (13 codigos del Excel que no existen en el sistema, incluye un codigo literal "0" invalido), `reporte-no-en-excel-activos.csv` (6 activos sin contraparte). **Duplicados en el Excel**: `PIN01316`, `PLO02402` (confirmar con encargado cual registro es el bueno, segun checklist de importacion). Casos raros a revisar a mano antes de tocar: `ELE12888` ENCHUFE METALICO (Excel $1.76 vs sistema $25.33 — huele a error de carga). **Opciones para retomar**: (1) desglosar los 424 por direccion (sistema mas barato = pierde margen / mas caro = espanta ventas); (2) actualizar precios en lote en prod desde el Excel con respaldo previo (total o por umbral); (3) revisar primero los casos raros. Script de cruce: se uso `node` con `xlsx@0.18.5` (cargado por ruta directa desde `.pnpm`), parseando `lista-pre.xlsx` y un dump psql de `code|priceDetal|SUM(stock)|isActive`.

## 🧪 Sesion 64 (2026-06-22) — pruebas en cliente: fixes de categorias + comandas (agente ya aplicado, web/api PENDIENTE DEPLOY)

> Probando facturacion/agente en el cliente antes de produccion. El **agente v1.1.3 ya se copio y probo en la PC de despacho** (imprime perfecto con el formato nuevo). Lo de **web + api (categorias + HTML de respaldo) FALTA DEPLOYAR** al server.

- **Codigo de categoria de longitud variable (2 a 6 letras)**: estaba forzado a **exactamente 3** y el cliente tiene categorias de 3, 4 y 5 caracteres (no podia crear las de 4/5). Se relajo a **2–6 letras** en: DTO backend (`categories/dto/create-category.dto.ts`, `@MinLength(2)/@MaxLength(6)/^[A-Za-z]{2,6}$`), y frontend (`catalog/categories/page.tsx` las 2 validaciones + los 2 inputs `maxLength`/`slice(0,6)`/ancho; `catalog/categories/[id]/page.tsx` input + label "2 a 6 letras"). La generacion de codigo de producto (`{COD}{00001}`) y `syncCorrelatives` ya eran agnosticas a la longitud. **Cuidado**: no crear prefijos que sean inicio de otro (ej. `EL` y `ELE`) porque el correlativo usa `LIKE 'EL%'` y se solaparian. **Necesita deploy web+api.**
- **Comandas: el agente NO imprimia solo (CAUSA RAIZ encontrada)**. Sintoma: salia el diálogo de `window.print()` del navegador y/o un archivo llamado `POS-80C` con el markup `{{...}}` crudo adentro. Diagnostico por capas: (1) **PNA** — Chrome bloqueaba el `fetch` de la pagina HTTPS (`eltrebol.app`) al agente en `http://localhost:8765` por *Private Network Access*; se agrego el header `Access-Control-Allow-Private-Network: true` en `apps/agent/src/server.ts`. (2) **CAUSA REAL del no-imprime** — `sendRawToPrinter` (`apps/agent/src/raw-print.ts`) pasaba TODO el C# de winspool por `powershell.exe -EncodedCommand <base64>`; ese comando superaba el **limite de longitud de linea de cmd.exe (~8191 chars)** → error "La linea de comandos es demasiado larga" → el RAW ESC/POS fallaba **siempre** y caia al fallback de texto plano (que manda el markup literal). **Fix**: escribir el script a un `.ps1` temporal y ejecutarlo con `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "<ps1>"` (linea corta) — confirmado el nombre `POS-80C` (USB002) coincide exacto con `config.json`. Agente subido a **v1.1.3** (health + banner) y reempaquetado (`apps/agent/trinity-agent.exe`). **Probado en cliente: imprime solo, en ESC/POS, negrita/grande/codigos apilados + corte.** El agente ya esta puesto en la PC de despacho; el exe queda commiteado para repartir.
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
