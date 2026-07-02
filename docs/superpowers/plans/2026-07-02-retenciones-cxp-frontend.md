# Retenciones (IVA + ISLR) sobre CxP — Plan 2: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox `- [ ]`.

**Goal:** Cablear en la UI lo que el backend (Plan 1) ya expone: crear retenciones ISLR sobre CxP (inline + pantalla), listar FC+CxP mezcladas en las pantallas de retención, y seleccionar los comprobantes de retención como documentos en el recibo de pago.

**Architecture:** Solo `apps/web`. Se consumen los endpoints nuevos del Plan 1: `GET /{retention-vouchers|islr-retention-vouchers}/available-documents/:supplierId` (lista mezclada) y el `GET /receipts/pending-documents?type=PAYMENT` (ahora devuelve comprobantes de retención). Cada tarea cierra con `pnpm --filter @trinity/web exec tsc --noEmit` en 0 + commit.

**Prerequisito:** Plan 1 (backend) implementado y el API corriendo. NO hay tests automatizados; verificación por typecheck + prueba manual en `http://localhost:3005`.

**Contratos del backend (Plan 1):**
- `available-documents/:supplierId` (IVA) → `Array<{ docType: 'PURCHASE_ORDER'|'PAYABLE', id, number, invoiceDate, ivaUsd, ivaBs, totalUsd, totalBs, exchangeRate, controlNumber, invoiceNumber }>`
- `available-documents/:supplierId` (ISLR) → `{ documents: Array<{ docType, id, number, invoiceDate, baseUsd, baseBs, totalUsd, totalBs, exchangeRate, controlNumber, invoiceNumber }>, defaultConceptId }`
- `POST /retention-vouchers` línea: `{ purchaseOrderId?, payableId?, retentionPct?, isManual?, ... }`
- `POST /islr-retention-vouchers` línea: `{ purchaseOrderId?, payableId?, islrRetentionTypeId, ... }`
- `POST /payables` gana: `createIslrRetention?: boolean`, `islrRetentionTypeId?: string`
- `GET /receipts/pending-documents` (pago) ahora incluye docs `{ documentType: 'PURCHASE_IVA_RETENTION'|'PURCHASE_ISLR_RETENTION', retentionVoucherId?|islrRetentionVoucherId?, amountUsd, amountBsHistoric, exchangeRate, balanceUsd, sign: -1 }`
- `POST /receipts` ítem gana: `retentionVoucherId?`, `islrRetentionVoucherId?`
- `ReceiptItemType` nuevos: `PURCHASE_IVA_RETENTION`, `PURCHASE_ISLR_RETENTION`

---

## Task 1: Pantalla Retención IVA acepta CxP (lista mezclada)

**Files:** Modify: `apps/web/src/app/(dashboard)/purchases/retentions/new/page.tsx`

- [ ] **Step 1: Interfaz + estado de documento**

Reemplazar la interfaz `AvailablePO` (o equivalente) por una que soporte ambos tipos:

```typescript
interface AvailableDoc {
  docType: 'PURCHASE_ORDER' | 'PAYABLE';
  id: string;
  number: string;
  invoiceDate: string | null;
  ivaUsd: number;
  ivaBs: number;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  controlNumber: string | null;
  invoiceNumber: string | null;
}
```

Renombrar el estado `availablePOs`/`setAvailablePOs` a `availableDocs`/`setAvailableDocs` con tipo `AvailableDoc[]` (o mantener el nombre y solo cambiar el tipo, para minimizar el diff).

- [ ] **Step 2: Fetch a available-documents**

En el fetch de documentos, cambiar la URL y el parseo:

```typescript
const res = await fetch(`/api/proxy/retention-vouchers/available-documents/${sid}`);
if (!res.ok) throw new Error('Error al cargar documentos');
const data = await res.json();
setAvailableDocs(Array.isArray(data) ? data : []);
```

(El endpoint IVA devuelve un array directo, no `{orders}`.)

- [ ] **Step 3: Render — etiqueta de tipo por fila**

En el render de cada documento disponible, agregar un badge del tipo junto al número:

```tsx
<span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${doc.docType === 'PAYABLE' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' : 'bg-slate-600/30 text-slate-300 border-slate-500/30'}`}>
  {doc.docType === 'PAYABLE' ? 'CxP' : 'FC'}
</span>
```

Los campos que la fila mostraba de la FC (`totalIvaUsd`, etc.) ahora vienen como `doc.ivaUsd`, `doc.totalUsd`, `doc.invoiceNumber`, `doc.controlNumber`.

- [ ] **Step 4: Submit — línea por tipo**

Al armar `lines` para el `POST /retention-vouchers`, enviar la FK correcta:

```typescript
lines: selectedDocs.map((d) => (
  d.docType === 'PAYABLE'
    ? { payableId: d.id, ...(manualPct != null ? { retentionPct: manualPct } : {}) }
    : { purchaseOrderId: d.id, ...(manualPct != null ? { retentionPct: manualPct } : {}) }
)),
```

(Adaptar `manualPct`/campos manuales a como ya los arma la página; la clave es `payableId` vs `purchaseOrderId` según `docType`.)

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @trinity/web exec tsc --noEmit` → 0.
```bash
git add "apps/web/src/app/(dashboard)/purchases/retentions/new/page.tsx"
git commit -m "feat: Sesion 106 - pantalla retencion IVA lista FC+CxP mezcladas"
```

---

## Task 2: Pantalla Retención ISLR acepta CxP

**Files:** Modify: `apps/web/src/app/(dashboard)/purchases/islr-retentions/new/page.tsx`

- [ ] **Step 1: Interfaz `AvailableDoc` (con base sin IVA)**

Reemplazar `AvailablePO` por:

```typescript
interface AvailableDoc {
  docType: 'PURCHASE_ORDER' | 'PAYABLE';
  id: string;
  number: string;
  invoiceDate: string | null;
  baseUsd: number;
  baseBs: number;
  totalUsd: number;
  totalBs: number;
  exchangeRate: number;
  controlNumber: string | null;
  invoiceNumber: string | null;
}
```

Cambiar el estado `availablePOs` a `AvailableDoc[]` (mantener nombre para minimizar diff, o renombrar a `availableDocs`).

- [ ] **Step 2: Fetch a available-documents (devuelve {documents, defaultConceptId})**

```typescript
const res = await fetch(`/api/proxy/islr-retention-vouchers/available-documents/${sid}`);
if (!res.ok) throw new Error('Error al cargar documentos');
const data = await res.json();
setAvailablePOs(data.documents || []);
setDefaultConceptId(data.defaultConceptId || null);
```

- [ ] **Step 3: Render — badge de tipo + base**

Igual que Task 1 Step 3 (badge FC/CxP). La base imponible por fila ahora es `doc.baseUsd`/`doc.baseBs` (antes `subtotalUsd/subtotalBs`). El mapa de concepto por documento (`poTypeMap`) sigue igual, keyeado por `doc.id`.

- [ ] **Step 4: Submit — línea por tipo + concepto**

```typescript
lines: selectedIds.map((id) => {
  const doc = availablePOs.find((d) => d.id === id)!;
  const base = doc.docType === 'PAYABLE' ? { payableId: id } : { purchaseOrderId: id };
  return { ...base, islrRetentionTypeId: poTypeMap[id] };
}),
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @trinity/web exec tsc --noEmit` → 0.
```bash
git add "apps/web/src/app/(dashboard)/purchases/islr-retentions/new/page.tsx"
git commit -m "feat: Sesion 106 - pantalla retencion ISLR lista FC+CxP mezcladas"
```

---

## Task 3: Formulario de CxP — toggle retención ISLR

**Files:** Modify: `apps/web/src/app/(dashboard)/payables/new/page.tsx`

- [ ] **Step 1: Fetch de conceptos ISLR + estado**

Agregar estado y fetch de tipos ISLR (endpoint `GET /islr-retention-types`):

```typescript
const [createIslr, setCreateIslr] = useState(false);
const [islrTypeId, setIslrTypeId] = useState('');
const [islrTypes, setIslrTypes] = useState<{ id: string; codigo: number; descripcion: string }[]>([]);
useEffect(() => {
  fetch('/api/proxy/islr-retention-types')
    .then((r) => (r.ok ? r.json() : []))
    .then((d) => setIslrTypes(Array.isArray(d) ? d : (d.data || [])))
    .catch(() => {});
}, []);
```

- [ ] **Step 2: UI — toggle + dropdown (junto al toggle de IVA existente)**

Ubicar el bloque del toggle de retención IVA (`createRetention`) y agregar debajo:

```tsx
<div className="flex items-center gap-2 mt-2">
  <input id="createIslr" type="checkbox" checked={createIslr} onChange={(e) => setCreateIslr(e.target.checked)} />
  <label htmlFor="createIslr" className="text-sm text-slate-300">Retener ISLR</label>
</div>
{createIslr && (
  <select value={islrTypeId} onChange={(e) => setIslrTypeId(e.target.value)} className="input-field !py-2 text-sm mt-2">
    <option value="">Selecciona concepto ISLR…</option>
    {islrTypes.map((t) => (
      <option key={t.id} value={t.id}>{t.codigo} - {t.descripcion}</option>
    ))}
  </select>
)}
```

- [ ] **Step 3: Submit — enviar campos ISLR**

En el body del `POST /payables`, agregar:

```typescript
  createIslrRetention: createIslr,
  islrRetentionTypeId: createIslr ? islrTypeId || undefined : undefined,
```

- [ ] **Step 4: Neto mostrado = monto**

Verificar que, si la página muestra un "neto a pagar" descontando la retención IVA, se cambie para mostrar el **monto completo** (el neteo es en el recibo). Si el cálculo del neto restaba la retención, quitarlo (mostrar `total`).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @trinity/web exec tsc --noEmit` → 0.
```bash
git add "apps/web/src/app/(dashboard)/payables/new/page.tsx"
git commit -m "feat: Sesion 106 - CxP: toggle de retencion ISLR + neto a monto completo"
```

---

## Task 4: Recibo de pago — seleccionar comprobantes de retención

**Files:** Modify: `apps/web/src/app/(dashboard)/receipts/new/page.tsx`

- [ ] **Step 1: Interfaz de documento — nuevas FKs y tipos**

En la interfaz de documento del recibo (la que hoy tiene `ivaRetentionId?`), agregar:

```typescript
  retentionVoucherId?: string;
  islrRetentionVoucherId?: string;
```

Y en el tipo de `documentType`, contemplar los valores `'PURCHASE_IVA_RETENTION' | 'PURCHASE_ISLR_RETENTION'` (además de los existentes).

- [ ] **Step 2: Armar el ítem al enviar — pasar la FK**

Donde se construye cada ítem para el `POST /receipts` (hoy mapea `ivaRetentionId: d.ivaRetentionId`), agregar:

```typescript
  retentionVoucherId: d.retentionVoucherId,
  islrRetentionVoucherId: d.islrRetentionVoucherId,
```

(Se envían junto a los demás; el backend usa el que venga. El `sign` de estos docs ya llega en `-1` desde `pending-documents`.)

- [ ] **Step 3: Render — etiqueta y color de los tipos nuevos**

Donde se decide el label/estilo por `documentType` (hoy maneja `IVA_RETENTION`/`SALES_IVA_RETENTION`), agregar los dos nuevos:

```tsx
: (doc.documentType === 'PURCHASE_IVA_RETENTION') ? 'Ret. IVA'
: (doc.documentType === 'PURCHASE_ISLR_RETENTION') ? 'Ret. ISLR'
```

y el color de fondo análogo (ej. `bg-purple-500/5` para retenciones). Asegurar que estos docs se muestren y se puedan seleccionar como los demás.

- [ ] **Step 4: (si aplica) `receipts/payment/page.tsx`**

Si `receipts/payment/page.tsx` tiene su propio armado de documentos/ítems (no reusa `receipts/new`), replicar Steps 1-3 ahí.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @trinity/web exec tsc --noEmit` → 0.
```bash
git add "apps/web/src/app/(dashboard)/receipts/new/page.tsx" "apps/web/src/app/(dashboard)/receipts/payment/page.tsx"
git commit -m "feat: Sesion 106 - recibo de pago selecciona comprobantes de retencion IVA/ISLR"
```

---

## Task 5: Detalle de recibo — labels de los tipos nuevos

**Files:** Modify: `apps/web/src/app/(dashboard)/receipts/[id]/page.tsx`

- [ ] **Step 1: Labels por `itemType`**

Donde el detalle mapea `item.itemType` a label/color (hoy maneja `IVA_RETENTION`/`SALES_IVA_RETENTION`), agregar:

```tsx
item.itemType === 'PURCHASE_IVA_RETENTION' ? 'Ret. IVA' :
item.itemType === 'PURCHASE_ISLR_RETENTION' ? 'Ret. ISLR' :
```

y sus clases de color análogas.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @trinity/web exec tsc --noEmit` → 0.
```bash
git add "apps/web/src/app/(dashboard)/receipts/[id]/page.tsx"
git commit -m "feat: Sesion 106 - detalle de recibo etiqueta retenciones de compra"
```

---

## Task 6: Detalle de CxP — mostrar retenciones + neto (opcional, ligero)

**Files:** Modify: `apps/web/src/app/(dashboard)/payables/[id]/page.tsx`

- [ ] **Step 1: Neto = monto**

Verificar que el detalle de la CxP muestre `netPayable` = monto (ya viene así del backend). Si mostraba "retención" restando, ajustar el texto para aclarar que la retención es un documento aparte (link a `/purchases/retentions` / `/purchases/islr-retentions`). Cambio menor de presentación; sin lógica nueva.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @trinity/web exec tsc --noEmit` → 0.
```bash
git add "apps/web/src/app/(dashboard)/payables/[id]/page.tsx"
git commit -m "feat: Sesion 106 - detalle CxP: neto a monto completo (retenciones aparte)"
```

---

## Task 7: Prueba manual UI + PROGRESS

- [ ] **Step 1: Prueba end-to-end en `http://localhost:3005`**

1. Crear una CxP fiscal tildando **Retener IVA** y **Retener ISLR** (concepto). Guardar. Verificar: aparecen los comprobantes en `/purchases/retentions` y `/purchases/islr-retentions`; el neto de la CxP = monto.
2. `/purchases/islr-retentions/new` → elegir proveedor → la lista muestra FC **y** CxP (badges); crear un comprobante ISLR sobre una CxP; emitir.
3. Recibo de pago del proveedor (`receipts/payment` o `receipts/new` tipo pago) → aparecen la CxP (+), Ret. IVA (−) y Ret. ISLR (−); seleccionarlas → el total = CxP − IVA − ISLR; postear.
4. Libro de compras del período → la factura suma y las retenciones restan.

- [ ] **Step 2: PROGRESS.md**

Actualizar la entrada de la Sesion 106: marcar **Frontend (Plan 2) listo**; dejar **PENDIENTE DEPLOY**.

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: Sesion 106 - frontend retenciones sobre CxP (Plan 2)"
```

---

## Checklist de cobertura del spec (frontend)

- Pantalla IVA lista mezclada FC+CxP + submit por tipo → Task 1.
- Pantalla ISLR lista mezclada + concepto → Task 2.
- Formulario CxP: toggle ISLR + neto a monto → Task 3.
- Recibo de pago: comprobantes de retención seleccionables → Task 4.
- Detalle de recibo: labels → Task 5.
- Detalle de CxP: neto/retenciones → Task 6.
- Prueba end-to-end + docs → Task 7.

**Nota de ejecución:** cada tarea toca una página existente; el implementador lee la página para ubicar los anclajes exactos (interfaz de documento, fetch, render de filas, armado del submit) y aplica los cambios de contrato/label indicados. Los snippets de arriba son la lógica nueva concreta; el resto sigue el patrón de cada página.
