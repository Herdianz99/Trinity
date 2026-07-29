# Plan — Lectura de facturas de compra con IA (OCR + extracción)

> **Estado:** diseñado, sin programar. Arranca en la empresa **`total`** (catálogo compacto, `supplierRef` al 100%).
> **Fecha del plan:** 2026-07-29.

## 1. Objetivo

Que el usuario **suba el PDF/foto de una factura de compra**, una IA la lea y proponga un **borrador** de factura (encabezado + líneas con costos), que el usuario **revisa, corrige y confirma**. Al confirmar, se crea la factura por el **flujo actual** de compras (que ya actualiza costo, kardex y CxP). **Nunca se guarda solo.**

Resuelve el problema de que cada proveedor tiene un formato distinto (columnas de precio distintas, descuentos no reflejados, etc.) mediante:
- Una **caja de instrucciones en lenguaje natural** por factura (ej: "aplícale 10% de descuento global que no viene en el papel", "la columna de costo buena es la 3ra", "los precios traen IVA, sácalo").
- Un **paso de revisión** con match automático de cada línea a tu producto.

## 2. Match de productos — clave `supplierRef`

- El campo `Product.supplierRef` ("Ref. proveedor") es la tabla de mapeo natural: código del proveedor → tu producto.
- Cobertura actual: **grande 87%**, **total 100%**, **totalturen 100%** (en total/turen el `code` == código del proveedor; se backfilleó `supplierRef = code` el 2026-07-29).
- `supplierRef` es limpio: 0 duplicados, 0 ambigüedad. Match = `supplierRef == códigoFactura AND supplierId == proveedorDeLaFactura`.

Por cada línea, tres estados:
1. **MATCHED** — match exacto por `supplierRef`. Automático.
2. **SUGERIDO** — sin código, la IA propone por nombre (ILIKE/trigram). Al **enlazar**, se **graba el `supplierRef`** → exacto la próxima vez.
3. **NUEVO** — no existe. Botón **"Crear producto"** pre-llenado desde la factura (descripción, costo, proveedor, `supplierRef` = código de la factura) reusando el modal que ya existe en la pantalla de compra.

> El mismo flujo que carga la factura va **construyendo/rellenando** el mapeo. No hay fase previa de llenar refs a mano.
>
> Caso borde v1: un producto comprado a **dos** proveedores distintos guarda un solo `supplierRef`/`supplierId` → con el 2do proveedor cae a SUGERIDO/NUEVO. Poco común; se acepta en v1.

## 3. Modelo de IA — vía OpenRouter (agnóstico, configurable por `.env`)

La llamada al modelo vive **detrás de una interfaz**; cambiar de modelo = cambiar una variable de entorno, sin tocar código. Se usa **OpenRouter** (no el API de Claude).

Precios OpenRouter (jul-2026, reconfirmar en la web) para modelos con visión:

| Modelo | Input /1M | Output /1M | ~Costo/factura* | Nota |
|---|---|---|---|---|
| Gemini 2.0 Flash | ~$0.075 | ~$0.30 | ~$0.001 | El más barato con buen OCR |
| GPT-4o-mini | $0.15 | $0.60 | ~$0.002 | Familia OpenAI |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | ~$0.006 | **Recomendado — mejor comprensión de documentos** |
| Claude Haiku | ~$0.80 | ~$4 | ~$0.02 | Descartado por precio |

\* *~4k tokens entrada (imagen+texto) + ~2k salida (JSON de líneas).*

**Recomendación:** arrancar con **Gemini 2.5 Flash** (precisión numérica importa: un dígito mal = costo/margen mal; con $5 de crédito ≈ 800 facturas). Estirar con Gemini 2.0 Flash si se necesita. Como es OpenRouter + variable de entorno, se pueden **A/B con facturas reales** sin tocar código.

## 4. Arquitectura

### Backend — módulo nuevo `purchase-ai`
- **`POST /purchases/ai/extract`** (multipart: `file` + `instructions` + `supplierId?`):
  1. Sube el archivo a Spaces (`purchase-imports/<uuid>.pdf`) para auditoría.
  2. Llama al modelo con **salida estructurada** (JSON schema forzado):
     - **header:** `supplierName, supplierRif, invoiceNumber, date, currency, subtotal, tax, exempt, total, globalDiscount`
     - **lines[]:** `supplierCode, description, qty, unitCost, lineDiscount, lineTotal`
  3. Prompt de sistema fijo (qué extraer, formato, IVA/columnas/descuentos) **+** la caja de instrucciones del usuario.
  4. Hace el **match** por línea (sección 2) y devuelve el borrador con estado por línea.
  5. Guarda el JSON de extracción junto al PDF.
- **`LlmExtractionService`** (interfaz) → impl **OpenRouter**: `OPENROUTER_BASE_URL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`. Timeout + reintento; si falla, se puede cargar la factura a mano como siempre (no bloquea).

### Frontend — dentro de `apps/web/src/app/(dashboard)/purchases/new/page.tsx`
- Bloque **"Cargar desde PDF/foto"**: dropzone + **textarea "Instrucciones para la IA"**.
- Procesar → loader → **panel de revisión**:
  - **Encabezado editable** (proveedor, N° factura, fecha, moneda, tasa).
  - **Tabla de líneas:** `descripción proveedor · cant · costo · descuento · [Producto: auto / enlazar / crear] · estado`.
  - Caja de **descuento/flete global**.
  - **Semáforo de cuadre:** verde si `líneas − descuentos + IVA = total`; rojo avisa lectura errónea **antes** de guardar.
- **Confirmar** → arma el payload y crea la factura por el flujo actual (`purchase-orders.service.ts`).

## 5. Cambios de datos
- **Sin migraciones obligatorias** en v1 — se reusa `supplierRef`, Spaces y el flujo de compra existente.
- *Opcional (v1.1):* tabla `PurchaseInvoiceImport` (auditoría: archivo, JSON, usuario, fecha, estado).

## 6. Config `.env`
```
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=<key>
OPENROUTER_MODEL=google/gemini-2.5-flash
```
- **Local:** va en `apps/api/.env` (máquina de Diego). Producción intacta hasta validar.

## 7. Guardrails
Nunca auto-postea · siempre revisión · semáforo de cuadre · guarda PDF + extracción · si la IA falla, carga manual normal.

## 8. Plan de pruebas — **local primero**
1. Poner `OPENROUTER_*` en el `apps/api/.env` local (no toca prod).
2. Probar extracción con **2–3 facturas PDF reales** de proveedores de total.
3. Validar match contra la BD local (grande o restaurar total en local).
4. Solo tras validar: llevar `.env` + deploy a la instancia `total`.

## 9. Estimación y fases
**~2–3 sesiones:**
1. Backend: endpoint extract + llamada OpenRouter + match (probable con Postman).
2. Frontend: dropzone + panel de revisión + confirmar.
3. Crear/enlazar inline + semáforo + guardar PDF + pruebas con facturas reales.

## 10. v1.1 (después)
- Memoria de **reglas fijas por proveedor** (columnas/IVA/descuento recurrentes) sobre la caja por-factura.

## Estado de implementación (2026-07-29)

**✅ CONSTRUIDO y typecheck limpio (sin desplegar).** Backend `apps/api/src/modules/purchase-ai/*` (+ `app.module.ts`, `main.ts` body 15mb) y frontend (`components/purchase-ai-import-modal.tsx` + botón "Cargar con IA" en `purchases/new/page.tsx`). Falta la prueba end-to-end con `total` en local.

### Hallazgos de la prueba de extracción (2 fotos reales de total)
- **Factura limpia** (pocos ítems, buena foto): **Gemini 2.5 Flash** casi perfecta, **incluye los códigos** del proveedor → match directo. ~$0.002/factura.
- **Factura densa / foto baja calidad** (≈22 ítems, doble moneda USD+Bs, descuentos compuestos): **Flash falla** (no lee la columna Código, desalinea filas, confunde moneda). **Gemini 2.5 Pro la lee bien** (códigos `THT…/TAC…/UTHGLI…` alineados, RIF, descuentos) por **~$0.14/factura** (~25×).
- **Decisión:** default **Flash** (`OPENROUTER_MODEL`); toggle **"Factura difícil"** en el modal → usa **Pro** (`preciseModel: true` → `google/gemini-2.5-pro`). Mejor foto/escaneo también sube mucho la calidad.
- Fecha se normaliza a `YYYY-MM-DD` **en código** (no en el prompt, que sobrecargado empeoraba la lectura). Prompt se mantiene **moderado**.

## Pendiente
- [x] API key de OpenRouter (local) + modelo (Flash default, Pro opcional).
- [ ] Restaurar `total` en local + boot del stack + prueba end-to-end (match real contra el catálogo).
- [ ] Evaluar auto-escalado a Pro si el cuadre falla o hay muchas líneas sin match.
- [ ] (v1.1) Backfill de `supplierRef` al enlazar + memoria de reglas por proveedor.
