# Despacho Verificado por Escaneo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pantalla nueva e independiente donde el despachador trae una factura pagada y va escaneando/tecleando el código de cada artículo; el sistema descuenta de la comanda (no del stock), bloquea sobrantes y artículos ajenos, y deja la comanda abierta si falta algo.

**Architecture:** Se monta **sobre el módulo `dispatch` existente** (modelos `Dispatch`/`DispatchItem`/`DispatchDelivery`) sin tocar la pantalla `/dispatch`. Un endpoint nuevo `POST /dispatches/resolve` hace *find-or-create* de la comanda a partir del N° de factura y devuelve las líneas con `barcode`+`code` para validar en el cliente. El cierre reutiliza el `POST /dispatches/:id/deliver` que ya valida el tope y calcula el estado `PARCIAL/COMPLETADO`. Es **opt-in por empresa** mediante un flag `useScanDispatch` en `CompanyConfig` (mismo patrón que `useCashLedger`).

**Tech Stack:** NestJS + Prisma (API), Next.js 14 App Router + Tailwind (Web). Sin dependencias nuevas. **No hay framework de tests unitarios** en el repo: la verificación de cada tarea es `tsc --noEmit` (typecheck) + prueba manual en el entorno local ya levantado (API `localhost:4000`, Web `localhost:3000`, BD local con data de la grande).

**Referencia del spec:** `docs/superpowers/specs/2026-08-07-despacho-verificado-escaneo-design.md`

---

## Estructura de archivos

**API (crear):**
- `apps/api/src/modules/dispatch/dto/resolve-dispatch.dto.ts` — DTO del nuevo endpoint.
- `packages/database/prisma/migrations/20260807xxxxxx_use_scan_dispatch_flag/migration.sql` — flag aditivo.

**API (modificar):**
- `packages/database/prisma/schema.prisma` — campo `useScanDispatch` en `CompanyConfig`.
- `deploy/fix-schema.sql` — red de seguridad del `ADD COLUMN`.
- `apps/api/src/modules/company-config/dto/update-company-config.dto.ts` — exponer el flag en el PATCH.
- `apps/api/src/modules/dispatch/dispatch.service.ts` — netear `returnedQty` en `create()` + método `resolve()`.
- `apps/api/src/modules/dispatch/dispatch.controller.ts` — ruta `POST /dispatches/resolve`.

**Web (crear):**
- `apps/web/src/app/(dashboard)/dispatch/scan/page.tsx` — la pantalla de escaneo.

**Web (modificar):**
- `apps/web/src/components/sidebar.tsx` — ítem de menú "Despacho verificado" gateado por el flag.

---

## Task 1: Feature flag `useScanDispatch` en CompanyConfig

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (modelo `CompanyConfig`, junto a `useCashLedger`)
- Create: `packages/database/prisma/migrations/20260807120000_use_scan_dispatch_flag/migration.sql`
- Modify: `deploy/fix-schema.sql`
- Modify: `apps/api/src/modules/company-config/dto/update-company-config.dto.ts`

- [ ] **Step 1: Agregar el campo al schema**

En `packages/database/prisma/schema.prisma`, dentro de `model CompanyConfig`, justo debajo de la línea `useCashLedger           Boolean  @default(false)`, añadir:

```prisma
  // Opt-in por empresa: habilita la pantalla nueva de "Despacho verificado por escaneo"
  // (/dispatch/scan). Default false = las demás empresas no la ven ni cambia nada.
  useScanDispatch         Boolean  @default(false)
```

- [ ] **Step 2: Crear la migración (aditiva, idempotente)**

Crear `packages/database/prisma/migrations/20260807120000_use_scan_dispatch_flag/migration.sql` con:

```sql
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "useScanDispatch" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Red de seguridad en fix-schema.sql**

En `deploy/fix-schema.sql`, agregar al final (junto a otros `ADD COLUMN IF NOT EXISTS`):

```sql
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "useScanDispatch" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Exponer el flag en el DTO de actualización**

En `apps/api/src/modules/company-config/dto/update-company-config.dto.ts`, debajo del bloque de `useCashLedger`, agregar:

```typescript
  // Opt-in: habilita la pantalla de despacho verificado por escaneo (/dispatch/scan).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  useScanDispatch?: boolean;
```

- [ ] **Step 5: Aplicar migración local + regenerar cliente Prisma**

Run:
```bash
cd /c/Users/Diego/Desktop/Trinity
pnpm --filter @trinity/database exec prisma migrate deploy
pnpm --filter @trinity/database exec prisma generate
```
Expected: la migración `20260807120000_use_scan_dispatch_flag` queda aplicada; `prisma generate` regenera el cliente con el campo nuevo. (El `GET /config` ya devuelve el objeto completo → el flag aparece solo, sin tocar el service.)

- [ ] **Step 6: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260807120000_use_scan_dispatch_flag/migration.sql deploy/fix-schema.sql apps/api/src/modules/company-config/dto/update-company-config.dto.ts
git commit -m "feat: flag useScanDispatch en CompanyConfig (opt-in despacho verificado)"
```

---

## Task 2: `create()` netea las devoluciones (`returnedQty`)

Objetivo: que la cantidad a despachar de cada línea sea **lo facturado menos lo ya devuelto** (`quantity − returnedQty`), y que las líneas totalmente devueltas no aparezcan. Esto es correcto para todos (evita exigir despachar mercancía devuelta) y hace que el estado `COMPLETADO` cuadre en el flujo de escaneo. No cambia la pantalla `/dispatch`, solo la cantidad objetivo.

**Files:**
- Modify: `apps/api/src/modules/dispatch/dispatch.service.ts` (método `create`, bloque `itemsData`, ~líneas 69-89)

- [ ] **Step 1: Netear returnedQty al construir los items**

En `apps/api/src/modules/dispatch/dispatch.service.ts`, reemplazar el bloque que arma `itemsData` (actualmente desde `const itemsData = invoice.items` hasta el `});` que cierra el `.map`, incluyendo el chequeo de `itemsData.length === 0`) por:

```typescript
    const itemsData = invoice.items
      .filter((it) => !productMap.get(it.productId)?.isService)
      .map((it) => {
        const p = productMap.get(it.productId);
        const area = p?.category?.printArea
          ? { id: p.category.printArea.id, name: p.category.printArea.name }
          : fallbackArea;
        // Cantidad NETA a despachar = facturado menos lo ya devuelto (nota de crédito).
        const net = round2(it.quantity - (it.returnedQty || 0));
        return {
          productId: it.productId,
          productName: it.productName,
          productCode: p?.code || null,
          printAreaId: area?.id || null,
          printAreaName: area?.name || null,
          quantityInvoiced: net,
          quantityDelivered: 0,
        };
      })
      // Fuera las líneas sin nada por despachar (servicio ya filtrado; devuelto completo).
      .filter((it) => it.quantityInvoiced > EPS);

    if (itemsData.length === 0) {
      throw new BadRequestException('La factura no tiene artículos despachables (solo servicios o todo devuelto)');
    }
```

Nota: `it.returnedQty` es un campo de `InvoiceItem` (`Float @default(0)`); `create` ya trae `invoice.items` completos, así que está disponible. `round2` y `EPS` ya existen al tope del archivo.

- [ ] **Step 2: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores. Si TS marca que `returnedQty` no existe en el tipo del item, confirmar el nombre exacto del campo en `schema.prisma` (`model InvoiceItem`) y ajustar.

- [ ] **Step 3: Prueba manual (opcional, en el flujo /dispatch existente)**

Con el sistema local levantado: en `/dispatch`, crear una comanda de una factura que NO tenga devoluciones → las cantidades deben verse igual que antes (facturado = objetivo). Si hay a mano una factura con devolución parcial, verificar que la comanda muestra la cantidad neta.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add apps/api/src/modules/dispatch/dispatch.service.ts
git commit -m "fix: comanda de retiro descuenta lo ya devuelto (returnedQty) al construir items"
```

---

## Task 3: Endpoint `POST /dispatches/resolve` (find-or-create + líneas con barcode/code)

**Files:**
- Create: `apps/api/src/modules/dispatch/dto/resolve-dispatch.dto.ts`
- Modify: `apps/api/src/modules/dispatch/dispatch.service.ts` (nuevo método `resolve`)
- Modify: `apps/api/src/modules/dispatch/dispatch.controller.ts` (nueva ruta)

- [ ] **Step 1: Crear el DTO**

Crear `apps/api/src/modules/dispatch/dto/resolve-dispatch.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class ResolveDispatchDto {
  // N° de la factura a despachar (tecleado o buscado). Debe estar pagada.
  @IsString()
  invoiceNumber: string;
}
```

- [ ] **Step 2: Agregar el método `resolve` al service**

En `apps/api/src/modules/dispatch/dispatch.service.ts`, agregar el import del DTO al tope:

```typescript
import { ResolveDispatchDto } from './dto/resolve-dispatch.dto';
```

Y agregar este método dentro de la clase `DispatchService` (p. ej. justo después de `create`):

```typescript
  // Punto de entrada de la pantalla de escaneo: dado un N° de factura, busca su comanda;
  // si no existe la crea (reutiliza create); devuelve las líneas con barcode+code para
  // que el frontend valide cada lectura sin ir al servidor por cada escaneo.
  async resolve(dto: ResolveDispatchDto, userId: string) {
    const num = dto.invoiceNumber.trim();
    const invoice = await this.prisma.invoice.findUnique({
      where: { number: num },
      select: { id: true, dispatch: { select: { id: true } } },
    });
    if (!invoice) throw new NotFoundException(`No existe una factura con el número "${num}"`);

    // Find-or-create. create() valida estado PAID/PARTIAL_RETURN y "solo servicios/todo devuelto".
    const dispatchId = invoice.dispatch?.id
      ?? (await this.create({ invoiceNumber: num }, userId)).id;

    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: dispatchId },
      include: {
        items: true,
        invoice: { select: { number: true, customer: { select: { name: true } } } },
      },
    });
    if (!dispatch) throw new NotFoundException('Comanda de retiro no encontrada');

    // barcode no vive en DispatchItem → lo traemos del producto por productId.
    const productIds = [...new Set(dispatch.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, barcode: true, code: true },
    });
    const pMap = new Map(products.map((p) => [p.id, p]));

    const lines = dispatch.items.map((it) => {
      const p = pMap.get(it.productId);
      return {
        dispatchItemId: it.id,
        productId: it.productId,
        productName: it.productName,
        productCode: it.productCode || p?.code || null,
        barcode: p?.barcode || null,
        quantityInvoiced: it.quantityInvoiced,
        quantityDelivered: it.quantityDelivered,
        remaining: round2(it.quantityInvoiced - it.quantityDelivered),
      };
    });

    return {
      dispatchId: dispatch.id,
      number: dispatch.number,
      status: dispatch.status,
      invoiceNumber: (dispatch as any).invoice?.number ?? num,
      customerName: (dispatch as any).invoice?.customer?.name ?? null,
      lines,
    };
  }
```

- [ ] **Step 3: Agregar la ruta al controller**

En `apps/api/src/modules/dispatch/dispatch.controller.ts`, agregar el import:

```typescript
import { ResolveDispatchDto } from './dto/resolve-dispatch.dto';
```

Y agregar el handler **antes** de `@Get(':id')` (no colisiona por ser POST, pero lo mantenemos agrupado con los POST):

```typescript
  @Post('resolve')
  resolve(@Body() dto: ResolveDispatchDto, @CurrentUser() user: { id: string }) {
    return this.service.resolve(dto, user.id);
  }
```

- [ ] **Step 4: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Prueba manual con el API levantado**

Con el sistema local corriendo, probar por la UI en el paso de la Task 4, o vía `curl` con un token válido (obtén `accessToken` de la cookie del navegador ya logueado, DevTools → Application → Cookies):

```bash
curl -s -X POST http://localhost:4000/dispatches/resolve \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"invoiceNumber":"<UN_NUMERO_DE_FACTURA_PAGADA>"}' | python -m json.tool
```
Expected: JSON con `dispatchId`, `number` (DSP-xxxx), `lines[]` con `barcode`/`productCode`/`remaining`. Un número inexistente devuelve 404 con mensaje claro.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add apps/api/src/modules/dispatch/dto/resolve-dispatch.dto.ts apps/api/src/modules/dispatch/dispatch.service.ts apps/api/src/modules/dispatch/dispatch.controller.ts
git commit -m "feat: endpoint POST /dispatches/resolve (find-or-create + lineas con barcode) para despacho verificado"
```

---

## Task 4: Pantalla de escaneo `/dispatch/scan`

Página cliente completa: guard por flag, entrada de factura (buscar/teclear), render de líneas, escaneo con validación instantánea (barcode o código), feedback sonoro, progreso, modales de error, cantidad manual para bultos, y cierre (completo/parcial).

**Files:**
- Create: `apps/web/src/app/(dashboard)/dispatch/scan/page.tsx`

- [ ] **Step 1: Crear la página completa**

Crear `apps/web/src/app/(dashboard)/dispatch/scan/page.tsx` con:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ScanLine, Check, AlertTriangle, X } from 'lucide-react';

type Line = {
  dispatchItemId: string;
  productId: string;
  productName: string;
  productCode: string | null;
  barcode: string | null;
  quantityInvoiced: number;
  quantityDelivered: number;
  remaining: number;
};
type Resolved = {
  dispatchId: string;
  number: string;
  status: string;
  invoiceNumber: string;
  customerName: string | null;
  lines: Line[];
};

// Beep corto vía WebAudio (sin assets). freq alta = OK, baja = error.
function beep(ok: boolean) {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = ok ? 'sine' : 'square';
    osc.frequency.value = ok ? 1180 : 220;
    gain.gain.value = 0.12;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.32));
    osc.onended = () => ctx.close();
  } catch { /* ignore */ }
}

const norm = (s: string) => (s || '').trim().toUpperCase();

export default function DispatchScanPage() {
  const [flagOn, setFlagOn] = useState<boolean | null>(null); // null = cargando
  const [invoiceInput, setInvoiceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  // scanned[dispatchItemId] = cuánto se ha verificado en ESTA sesión
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [scanInput, setScanInput] = useState('');
  const [errorModal, setErrorModal] = useState<{ title: string; detail: string } | null>(null);
  const [partialModal, setPartialModal] = useState<Line[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const scanRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  useEffect(() => { document.title = 'Despacho verificado | Trinity ERP'; }, []);

  // Guard por flag de empresa.
  useEffect(() => {
    fetch('/api/proxy/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFlagOn(!!d?.useScanDispatch))
      .catch(() => setFlagOn(false));
  }, []);

  // Índices para validar cada lectura en el cliente (barcode exacto o código exacto).
  const byBarcode = useMemo(() => {
    const m = new Map<string, Line>();
    resolved?.lines.forEach((l) => { if (l.barcode) m.set(norm(l.barcode), l); });
    return m;
  }, [resolved]);
  const byCode = useMemo(() => {
    const m = new Map<string, Line>();
    resolved?.lines.forEach((l) => { if (l.productCode) m.set(norm(l.productCode), l); });
    return m;
  }, [resolved]);

  const resolveInvoice = useCallback(async (number: string) => {
    const num = number.trim();
    if (!num) return;
    setLoading(true); setBanner(null);
    try {
      const res = await fetch('/api/proxy/dispatches/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceNumber: num }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'No se pudo cargar la factura');
      setResolved(json);
      setScanned({});
      setTimeout(() => scanRef.current?.focus(), 50);
    } catch (err: any) {
      setResolved(null);
      setBanner({ type: 'err', text: err.message });
    } finally { setLoading(false); }
  }, []);

  const addToLine = useCallback((line: Line, qty: number) => {
    setScanned((prev) => {
      const current = prev[line.dispatchItemId] || 0;
      const next = Math.round((current + qty) * 1000) / 1000;
      if (next > line.remaining + 0.001) {
        beep(false);
        setErrorModal({
          title: `SON SOLO ${line.remaining}`,
          detail: `"${line.productName}": ya verificaste ${current}. No lleva más de ${line.remaining}.`,
        });
        return prev;
      }
      beep(true);
      return { ...prev, [line.dispatchItemId]: next };
    });
  }, []);

  const handleScan = useCallback((raw: string) => {
    const token = norm(raw);
    if (!token || !resolved) return;
    // Anti-doble-lectura: ignora el mismo token repetido en <150ms (gatillo doble).
    const now = Date.now();
    if (lastScanRef.current.token === token && now - lastScanRef.current.at < 150) return;
    lastScanRef.current = { token, at: now };

    const line = byBarcode.get(token) || byCode.get(token);
    if (!line) {
      beep(false);
      setErrorModal({ title: 'NO ESTÁ EN LA FACTURA', detail: `Escaneaste: ${raw.trim()}` });
      return;
    }
    addToLine(line, 1);
  }, [resolved, byBarcode, byCode, addToLine]);

  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan(scanInput);
      setScanInput('');
    }
  };

  // Cantidad manual para bultos: pide cuánto agregar de una línea (respeta el tope).
  const manualAdd = (line: Line) => {
    const current = scanned[line.dispatchItemId] || 0;
    const max = Math.round((line.remaining - current) * 1000) / 1000;
    if (max <= 0) { setErrorModal({ title: `SON SOLO ${line.remaining}`, detail: `"${line.productName}" ya está completo.` }); return; }
    const val = window.prompt(`¿Cuántos de "${line.productName}" agregar? (máx ${max})`, String(max));
    if (val == null) return;
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return;
    addToLine(line, n);
    scanRef.current?.focus();
  };

  const totals = useMemo(() => {
    if (!resolved) return { done: 0, target: 0, complete: false };
    let done = 0, target = 0;
    resolved.lines.forEach((l) => { target += l.remaining; done += Math.min(scanned[l.dispatchItemId] || 0, l.remaining); });
    return { done: Math.round(done * 1000) / 1000, target: Math.round(target * 1000) / 1000, complete: done >= target - 0.001 && target > 0 };
  }, [resolved, scanned]);

  const buildPayload = () =>
    (resolved?.lines || [])
      .map((l) => ({ dispatchItemId: l.dispatchItemId, qty: scanned[l.dispatchItemId] || 0 }))
      .filter((x) => x.qty > 0);

  const submit = useCallback(async () => {
    if (!resolved) return;
    const lines = buildPayload();
    if (lines.length === 0) { setBanner({ type: 'err', text: 'No has verificado ningún artículo' }); return; }
    setSaving(true); setBanner(null);
    try {
      const res = await fetch(`/api/proxy/dispatches/${resolved.dispatchId}/deliver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'No se pudo registrar el despacho');
      setPartialModal(null);
      setBanner({ type: 'ok', text: json.status === 'COMPLETADO' ? `Despacho COMPLETO — ${resolved.number}` : `Despacho PARCIAL (quedó abierta) — ${resolved.number}` });
      setResolved(null); setScanned({}); setInvoiceInput('');
    } catch (err: any) { setBanner({ type: 'err', text: err.message }); }
    finally { setSaving(false); }
  }, [resolved, scanned]);

  const onFinalize = () => {
    if (!resolved) return;
    if (totals.complete) { submit(); return; }
    // Falta algo → modal con lo que queda pendiente, para confirmar parcial.
    const missing = resolved.lines
      .map((l) => ({ ...l, faltan: Math.round((l.remaining - (scanned[l.dispatchItemId] || 0)) * 1000) / 1000 }))
      .filter((l) => l.faltan > 0.001);
    setPartialModal(missing as any);
  };

  if (flagOn === null) return <div className="p-6 text-slate-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Cargando…</div>;
  if (!flagOn) return <div className="p-6 text-slate-400">Esta función no está habilitada para esta empresa.</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2 mb-4">
        <ScanLine size={22} /> Despacho verificado
      </h1>

      {banner && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${banner.type === 'ok' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/15 text-red-300 border border-red-500/30'}`}>
          {banner.text}
        </div>
      )}

      {!resolved && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={invoiceInput}
            onChange={(e) => setInvoiceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') resolveInvoice(invoiceInput); }}
            placeholder="N° de factura (escanear o teclear) + Enter"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
          />
          <button onClick={() => resolveInvoice(invoiceInput)} disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 disabled:opacity-40 flex items-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={16} /> : 'Buscar'}
          </button>
        </div>
      )}

      {resolved && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-slate-300 text-sm">
              <span className="font-semibold text-slate-100">Factura {resolved.invoiceNumber}</span>
              {resolved.customerName ? ` · ${resolved.customerName}` : ''} · Comanda {resolved.number}
            </div>
            <button onClick={() => { setResolved(null); setScanned({}); setInvoiceInput(''); }}
              className="text-xs text-slate-400 hover:text-slate-200">Cambiar factura</button>
          </div>

          <div className="mb-4">
            <input
              ref={scanRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={onScanKeyDown}
              placeholder="Escanear/teclear código de artículo + Enter"
              className="w-full bg-slate-800 border-2 border-indigo-500/40 rounded-lg px-3 py-3 text-lg text-slate-100"
            />
            <div className="mt-2 text-sm text-slate-400">Progreso: {totals.done} / {totals.target}</div>
          </div>

          <div className="space-y-2">
            {resolved.lines.map((l) => {
              const s = scanned[l.dispatchItemId] || 0;
              const complete = s >= l.remaining - 0.001;
              const pct = l.remaining > 0 ? Math.min(100, (s / l.remaining) * 100) : 100;
              return (
                <div key={l.dispatchItemId}
                  className={`rounded-lg border p-3 flex items-center gap-3 ${complete ? 'border-emerald-500/40 bg-emerald-500/10 order-last' : 'border-slate-700 bg-slate-800/60'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-100 truncate">{l.productName}</div>
                    <div className="text-xs text-slate-400">{l.productCode || l.barcode || '—'}</div>
                    <div className="mt-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full ${complete ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className={`text-lg font-semibold tabular-nums ${complete ? 'text-emerald-300' : 'text-slate-200'}`}>
                    {s}/{l.remaining}{complete && <Check className="inline ml-1" size={16} />}
                  </div>
                  <button onClick={() => manualAdd(l)} className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700">+ cant.</button>
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <button onClick={onFinalize} disabled={saving}
              className="w-full py-3 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="animate-spin" size={18} /> : 'Finalizar despacho'}
            </button>
          </div>
        </div>
      )}

      {/* Modal de ERROR (grande, rojo) */}
      {errorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setErrorModal(null); scanRef.current?.focus(); }}>
          <div className="bg-red-950 border-2 border-red-500 rounded-2xl p-8 max-w-md text-center" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle className="mx-auto mb-3 text-red-400" size={56} />
            <div className="text-3xl font-extrabold text-red-300 mb-2">⛔ {errorModal.title}</div>
            <div className="text-red-200 mb-5">{errorModal.detail}</div>
            <button onClick={() => { setErrorModal(null); scanRef.current?.focus(); }}
              className="px-6 py-2 rounded-lg bg-red-500/20 text-red-200 border border-red-500/40 font-medium">Entendido</button>
          </div>
        </div>
      )}

      {/* Modal de PARCIAL (confirmar que queda abierta) */}
      {partialModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold text-amber-300">Falta despachar</div>
              <button onClick={() => setPartialModal(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="text-sm text-slate-300 mb-3">Si continúas, la comanda queda <b>abierta (parcial)</b>. Falta:</div>
            <ul className="space-y-1 mb-5 max-h-48 overflow-auto">
              {partialModal.map((l: any) => (
                <li key={l.dispatchItemId} className="text-sm text-slate-200 flex justify-between">
                  <span className="truncate">{l.productName}</span><span className="text-amber-300 font-semibold ml-2">{l.faltan}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => setPartialModal(null)} className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300">Seguir escaneando</button>
              <button onClick={submit} disabled={saving}
                className="flex-1 py-2 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 font-medium disabled:opacity-40">
                {saving ? <Loader2 className="animate-spin inline" size={16} /> : 'Despachar parcial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck Web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Habilitar el flag para probar (local)**

Con el sistema levantado y logueado como ADMIN, activar el flag en la BD local (o vía PATCH):

```bash
curl -s -X PATCH http://localhost:4000/config -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" -d '{"useScanDispatch":true}'
```

- [ ] **Step 4: Prueba manual del flujo completo**

Abrir `http://localhost:3000/dispatch/scan`. Verificar:
1. Con el flag apagado → muestra "no habilitada"; con el flag encendido → muestra la pantalla.
2. Teclear un N° de factura pagada + Enter → cargan las líneas.
3. Escribir en el campo de escaneo el **código** de un artículo de la factura + Enter → sube 1, beep, barra avanza.
4. Escribir un código **que no está** en la factura → modal rojo "NO ESTÁ EN LA FACTURA" + beep grave.
5. Pasar un artículo **de más** (superar el tope de una línea) → modal rojo "SON SOLO N".
6. Usar "+ cant." en una línea → agrega la cantidad tecleada respetando el tope.
7. Completar todo → "Finalizar" → banner "Despacho COMPLETO"; en `/dispatch` esa comanda figura COMPLETADO (registro compartido).
8. Dejar algo sin escanear → "Finalizar" → modal de faltantes → "Despachar parcial" → banner "PARCIAL (quedó abierta)"; en `/dispatch` figura PARCIAL.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add "apps/web/src/app/(dashboard)/dispatch/scan/page.tsx"
git commit -m "feat: pantalla de despacho verificado por escaneo (/dispatch/scan)"
```

---

## Task 5: Ítem de menú "Despacho verificado" gateado por el flag

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`

- [ ] **Step 1: Nuevo campo de gate en el tipo MenuItem**

En `apps/web/src/components/sidebar.tsx`, en `interface MenuItem`, debajo de `integrationOnly?: boolean;`, agregar:

```typescript
  // Solo visible si la empresa activó el flag useScanDispatch (opt-in por empresa).
  scanDispatchOnly?: boolean;
```

- [ ] **Step 2: Agregar el ítem en la sección de comandas**

En el arreglo `menuSections`, dentro de la sección con `key: 'commands'`, en su `items`, debajo de `{ label: 'Por despachar', href: '/dispatch', ... }`, agregar:

```typescript
      { label: 'Despacho verificado', href: '/dispatch/scan', icon: <ScanLine size={18} />, scanDispatchOnly: true },
```

- [ ] **Step 3: Importar el ícono**

En el bloque de imports de `lucide-react` al tope de `sidebar.tsx`, agregar `ScanLine` a la lista (junto a `Barcode`, `Truck`, etc.):

```typescript
  ScanLine,
```

- [ ] **Step 4: Leer el flag desde /config**

Agregar un estado nuevo junto a `const [integrationOn, setIntegrationOn] = useState(false);`:

```typescript
  const [scanDispatchOn, setScanDispatchOn] = useState(false);
```

Y en el `useEffect` que ya hace `fetch('/api/proxy/config')` (el de `companyName`), ampliar el `.then` para setear también el flag:

```typescript
  useEffect(() => {
    fetch('/api/proxy/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setCompanyName(d?.companyName || ''); setScanDispatchOn(!!d?.useScanDispatch); })
      .catch(() => {});
  }, []);
```

- [ ] **Step 5: Aplicar el gate en `visibleItemsFor`**

En la función `visibleItemsFor`, ampliar el `gate` para filtrar también los items `scanDispatchOnly`:

```typescript
    const gate = (items: MenuItem[]) =>
      items.filter((it) => (!it.integrationOnly || integrationOn) && (!it.scanDispatchOnly || scanDispatchOn));
```

- [ ] **Step 6: Typecheck Web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Prueba manual**

Con el flag encendido, el sidebar (sección COMANDAS) muestra "Despacho verificado" y lleva a `/dispatch/scan`. Apagar el flag (`{"useScanDispatch":false}`) y recargar → el ítem desaparece y las demás empresas no lo ven.

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add apps/web/src/components/sidebar.tsx
git commit -m "feat: item de menu 'Despacho verificado' gateado por flag useScanDispatch"
```

---

## Task 6: Pre-deploy checklist y handoff (deploy lo corre Diego)

**Files:** ninguno (verificación).

- [ ] **Step 1: Verificar git limpio y commits presentes**

Run: `cd /c/Users/Diego/Desktop/Trinity && git status && git log --oneline -6`
Expected: no quedan archivos del feature sin commitear; están los 5 commits (flag, returnedQty, resolve, pantalla, sidebar). La migración `20260807120000_use_scan_dispatch_flag` está commiteada y `deploy/fix-schema.sql` incluye el `ADD COLUMN IF NOT EXISTS`.

- [ ] **Step 2: Typecheck final API + Web**

Run:
```bash
cd /c/Users/Diego/Desktop/Trinity/apps/api && npx tsc --noEmit
cd /c/Users/Diego/Desktop/Trinity/apps/web && npx tsc --noEmit
```
Expected: ambos sin errores.

- [ ] **Step 3: Push**

Run: `cd /c/Users/Diego/Desktop/Trinity && git push origin main`

- [ ] **Step 4: Handoff a Diego (deploy en la empresa que lo usará)**

Indicar a Diego:
1. Deploy en la instancia de esa empresa con su comando correspondiente (co-locadas: `bash /opt/deploy-trinity.sh <inst>` con `git pull` antes; eltrebol/inversiones: `bash deploy.sh`). El deploy corre `prisma migrate deploy` (aplica el flag) y `fix-schema.sql` como red.
2. **Activar el flag SOLO en esa empresa:** como ADMIN, `PATCH /config { "useScanDispatch": true }` (o `UPDATE "CompanyConfig" SET "useScanDispatch"=true WHERE id='singleton';` en su BD). Las demás quedan en `false` (sin cambios).
3. Confirmar en vivo: el sidebar de esa empresa muestra "Despacho verificado", el flujo carga una factura y escanea; las otras empresas no ven nada nuevo.

---

## Fuera de alcance (Fase 2)

- Código de barras impreso en el ticket de la comanda (requiere soporte ESC/POS de barcode en el agente `.exe` + redespliegue por PC).
- Buscador de factura por nombre de cliente en la pantalla de escaneo (Fase 1 resuelve por N° exacto; se puede añadir reutilizando `/api/proxy/invoices?search=&status=PAID`).
- Toggle del flag en la pantalla `/config` (por ahora se activa por API/DB para la única empresa que lo usa).
- Constancia impresa "despacho verificado por [usuario]".

## Notas de verificación (self-review del plan)

- **Cobertura del spec:** pantalla aparte (Task 4) sin tocar /dispatch ✓; opt-in por empresa (Task 1 + Task 5) ✓; registro compartido / find-or-create (Task 3 reutiliza `create` y `deliver`) ✓; entrada por N° de factura (Task 4) ✓; escaneo 1-a-1 con cantidad manual (Task 4) ✓; tope duro + "no está en la factura" (Task 4, validación cliente + backstop `deliver`) ✓; parcial/abierta (Task 4 + `computeStatus` existente) ✓; feedback sensorial y progreso (Task 4) ✓; netear devoluciones (Task 2) ✓; Fase 1 sin barcode en ticket (Fuera de alcance) ✓.
- **Consistencia de tipos:** el shape de `resolve` (Task 3: `dispatchId, number, status, invoiceNumber, customerName, lines[{dispatchItemId, productId, productName, productCode, barcode, quantityInvoiced, quantityDelivered, remaining}]`) coincide con el tipo `Resolved`/`Line` del frontend (Task 4). El cierre usa `POST /dispatches/:id/deliver` con `{ lines: [{dispatchItemId, qty}] }`, que es exactamente `DeliverDispatchDto` existente.
- **Sin placeholders:** cada paso trae el código o comando concreto.
