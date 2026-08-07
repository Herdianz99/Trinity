# Editar cantidades al enviar un traslado entre socios — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el que recibe una solicitud de traslado entre socios pueda ajustar la cantidad a enviar por línea (menos/más, topado por su stock; 0 = no envía esa línea) + una nota, y que ambos lados vean "Solicitado vs Enviado/Recibido".

**Architecture:** Se trabaja sobre el módulo existente `integration` (`partner-transfers.service.ts`). El JSON `items` de cada línea pasa a llevar `requestedQuantity` (pedido) + `quantity` (enviado). `approve()` acepta cantidades editadas + nota, valida contra stock, descuenta/cobra solo lo enviado, y guarda el snapshot completo (incluidas las líneas en 0 para poder mostrar "pediste 10 / enviaste 0"). Una columna nueva `sendNote` viaja al socio por el mismo push que ya sincroniza los items. Es **opt-in** de las empresas integradas; no afecta a nadie más.

**Tech Stack:** NestJS + Prisma (API), Next.js 14 + Tailwind (Web). Sin dependencias nuevas. **No hay tests unitarios** en el repo: verificación por `tsc --noEmit` + prueba manual (endpoint con token forjado sobre `grande_db` local; el sync completo A↔B se prueba en las instancias co-locadas aceros/acerosmayor al desplegar).

**Spec:** `docs/superpowers/specs/2026-08-07-editar-cantidades-traslado-socio-design.md`

---

## Estructura de archivos

**API (modificar):**
- `packages/database/prisma/schema.prisma` — campo `sendNote` en `PartnerTransfer`.
- `packages/database/prisma/migrations/20260807130000_partner_transfer_send_note/migration.sql` — crear.
- `deploy/fix-schema.sql` — red del `ADD COLUMN`.
- `apps/api/src/modules/integration/partner-transfers.service.ts` — `request()`, `approve()`, `receive()`, `pushIncoming()`, `receiveIncoming()`, nuevo `availability()`.
- `apps/api/src/modules/integration/integration.controller.ts` — DTO de approve, incoming, y ruta availability.

**Web (modificar):**
- `apps/web/src/app/(dashboard)/catalog/partner-transfers/[id]/page.tsx` — tabla editable al aprobar, nota, "disponible: N", y columnas Solicitado/Enviado.

---

## Task 1: Columna `sendNote` en PartnerTransfer

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (modelo `PartnerTransfer`, junto a `notes`)
- Create: `packages/database/prisma/migrations/20260807130000_partner_transfer_send_note/migration.sql`
- Modify: `deploy/fix-schema.sql`

- [ ] **Step 1: Agregar el campo al schema**

En `packages/database/prisma/schema.prisma`, dentro de `model PartnerTransfer`, debajo de la línea `notes           String?`, agregar:

```prisma
  sendNote        String?  // Nota del que ENVÍA al aprobar (ej. "bajo stock, te mando 5"). Viaja al socio.
```

- [ ] **Step 2: Crear la migración**

Crear `packages/database/prisma/migrations/20260807130000_partner_transfer_send_note/migration.sql`:

```sql
ALTER TABLE "PartnerTransfer" ADD COLUMN IF NOT EXISTS "sendNote" TEXT;
```

- [ ] **Step 3: Red en fix-schema.sql**

En `deploy/fix-schema.sql`, al final, agregar:

```sql
-- Nota del que envía en traslados entre socios. Ses. 2026-08-07.
ALTER TABLE "PartnerTransfer" ADD COLUMN IF NOT EXISTS "sendNote" TEXT;
```

- [ ] **Step 4: Aplicar migración local + regenerar cliente**

Run:
```bash
cd /c/Users/Diego/Desktop/Trinity
pnpm --filter @trinity/database exec prisma migrate deploy
pnpm --filter @trinity/database exec prisma generate
```
Expected: aplica `20260807130000_partner_transfer_send_note`; regenera el cliente con `sendNote`.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260807130000_partner_transfer_send_note/migration.sql deploy/fix-schema.sql
git commit -m "feat: columna sendNote en PartnerTransfer (nota del que envía)"
```

---

## Task 2: `request()` guarda `requestedQuantity` en los items

Para que "lo solicitado" sea explícito desde que se crea la solicitud (y no dependa de inferirlo).

**Files:**
- Modify: `apps/api/src/modules/integration/partner-transfers.service.ts` (`request()`, ~línea 244)

- [ ] **Step 1: Incluir requestedQuantity al crear la solicitud**

En `apps/api/src/modules/integration/partner-transfers.service.ts`, en `request()`, reemplazar la línea que arma `items`:

```typescript
          items: resolved.map((r) => ({ code: r.snap.code, name: r.snap.name, quantity: r.snap.quantity, unitCost: 0 })) as any,
```

por:

```typescript
          items: resolved.map((r) => ({ code: r.snap.code, name: r.snap.name, requestedQuantity: r.snap.quantity, quantity: r.snap.quantity, unitCost: 0 })) as any,
```

- [ ] **Step 2: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add apps/api/src/modules/integration/partner-transfers.service.ts
git commit -m "feat: la solicitud de traslado guarda requestedQuantity por línea"
```

---

## Task 3: `approve()` con cantidades editadas + nota

**Files:**
- Modify: `apps/api/src/modules/integration/partner-transfers.service.ts` (`approve()`, líneas 260-323)
- Modify: `apps/api/src/modules/integration/integration.controller.ts` (`approveTransfer`, líneas 124-132)

- [ ] **Step 1: Reemplazar el método `approve()` completo**

En `apps/api/src/modules/integration/partner-transfers.service.ts`, reemplazar todo el método `approve(...)` (desde `async approve(` hasta su `}` de cierre, líneas 260-323) por:

```typescript
  // ── APROBAR una solicitud entrante: el que ENVÍA decide la cantidad por línea ──
  async approve(
    id: string,
    dto: {
      fromWarehouseId: string;
      costBasis?: 'COST' | 'COST_BREGA';
      sendNote?: string;
      items?: { code: string; sendQuantity: number }[];
    },
    userId: string,
  ) {
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    if (rec.kind !== 'REQUEST' || rec.direction !== 'INCOMING' || rec.status !== 'REQUESTED') {
      throw new BadRequestException('Solo se aprueban solicitudes entrantes pendientes');
    }
    if (!dto.fromWarehouseId) throw new BadRequestException('Falta el almacen origen');

    // Snapshot solicitado. requestedQuantity: si no viene (traslados viejos) usa quantity.
    const reqItems = rec.items as unknown as (ItemSnapshot & { requestedQuantity?: number })[];
    const reqMap = new Map(reqItems.map((i) => [i.code, i.requestedQuantity ?? i.quantity]));

    // Cantidad a enviar por linea: del dto.items si viene; si no, lo solicitado (compat).
    const sendMap = new Map<string, number>();
    if (dto.items?.length) for (const it of dto.items) sendMap.set(it.code, Number(it.sendQuantity) || 0);
    const sendOf = (code: string) =>
      dto.items?.length ? (sendMap.get(code) ?? 0) : (reqMap.get(code) as number);

    const toSend = reqItems.map((i) => ({ code: i.code, send: sendOf(i.code) })).filter((x) => x.send > 0);
    if (toSend.length === 0) throw new BadRequestException('No hay nada que enviar; usa Rechazar');

    // Solo las lineas con cantidad > 0 se resuelven (costo/nombre) y descuentan.
    const resolved = await this.resolveItems(toSend.map((x) => ({ code: x.code, quantity: x.send })), dto.costBasis);
    const costMap = new Map(resolved.map((r) => [r.snap.code, r.snap.unitCost]));

    // Validar stock disponible por linea (tope = stock; sin negativos).
    for (const r of resolved) {
      const st = await this.prisma.stock.findUnique({
        where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.fromWarehouseId } },
      });
      if (!st || st.quantity < r.snap.quantity) {
        throw new BadRequestException(
          `Solo tienes ${st?.quantity ?? 0} de ${r.snap.code} (quieres enviar ${r.snap.quantity})`,
        );
      }
    }

    // Snapshot COMPLETO (incluye lineas en 0) para mostrar "Solicitaste X / Enviaste Y" en ambos lados.
    const fullItems = reqItems.map((i) => {
      const send = sendOf(i.code);
      return {
        code: i.code,
        name: i.name,
        requestedQuantity: reqMap.get(i.code) ?? i.quantity,
        quantity: send,
        unitCost: send > 0 ? (costMap.get(i.code) ?? 0) : 0,
      };
    });

    const cfg = getIntegrationConfig();
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const r of resolved) {
        const st = await tx.stock.update({
          where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.fromWarehouseId } },
          data: { quantity: { decrement: r.snap.quantity } },
        });
        if (st.quantity < 0) throw new BadRequestException(`Stock insuficiente de ${r.snap.code}`);
        await tx.stockMovement.create({
          data: {
            productId: r.productId,
            warehouseId: dto.fromWarehouseId,
            type: 'TRANSFER_OUT',
            quantity: -r.snap.quantity,
            costUsd: r.snap.unitCost,
            stockAfter: st.quantity,
            reason: `Traslado a ${cfg.partnerName} ${rec.number} (solicitud aprobada)`,
            reference: rec.number,
            sourceType: 'PARTNER_TRANSFER',
            sourceId: id,
            createdById: userId,
          },
        });
      }
      const upd = await tx.partnerTransfer.update({
        where: { id },
        data: {
          status: 'SENT',
          fromWarehouseId: dto.fromWarehouseId,
          items: fullItems as any,
          sendNote: dto.sendNote ?? null,
          notified: false,
        },
      });
      await this.createReceivable(tx, {
        partnerName: cfg.partnerName,
        number: rec.number,
        amountUsd: resolved.reduce((s, r) => s + r.snap.unitCost * r.snap.quantity, 0),
        userId,
      });
      return upd;
    });

    await this.pushIncoming(updated);
    return this.prisma.partnerTransfer.findUnique({ where: { id } });
  }
```

- [ ] **Step 2: Actualizar el DTO del controller**

En `apps/api/src/modules/integration/integration.controller.ts`, reemplazar el handler `approveTransfer` (líneas 124-132) por:

```typescript
  @Post('transfers/:id/approve')
  @UseGuards(AuthGuard('jwt'))
  approveTransfer(
    @Param('id') id: string,
    @Body() body: { fromWarehouseId: string; costBasis?: 'COST' | 'COST_BREGA'; sendNote?: string; items?: { code: string; sendQuantity: number }[] },
    @CurrentUser('id') userId: string,
  ) {
    return this.transfers.approve(id, body, userId);
  }
```

- [ ] **Step 3: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Prueba manual local (efecto en BD)**

Con el sistema local corriendo, insertar una solicitud ENTRANTE de prueba y aprobarla con cantidad editada. Usa un token forjado (ver patrón de sesiones previas: `node -e "require('<ruta>/jsonwebtoken').sign({sub:'<adminId>',role:'ADMIN',permissions:['*']}, '<JWT_SECRET de apps/api/.env>', {expiresIn:'1h'})"`), un `code` real con stock y un `warehouseId` real:

```bash
# 1) Crear una solicitud entrante de prueba directamente en la BD (simula que el socio pidió 10)
docker exec -i trinity-postgres-1 psql -U trebol -d grande_db -c "INSERT INTO \"PartnerTransfer\"(id,number,kind,direction,status,\"partnerName\",items,notified,\"createdAt\",\"updatedAt\") VALUES ('ptr_test1','TST-PTR-99999','REQUEST','INCOMING','REQUESTED','SocioTest','[{\"code\":\"<CODE>\",\"name\":\"x\",\"requestedQuantity\":10,\"quantity\":10,\"unitCost\":0}]',true,now(),now());"
# 2) Aprobar enviando solo 5 (la integración local no está configurada → el push fallará DESPUÉS de commitear; revisar el efecto en BD)
curl -s -X POST http://localhost:4000/integration/transfers/ptr_test1/approve -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"fromWarehouseId":"<WH>","costBasis":"COST","sendNote":"bajo stock","items":[{"code":"<CODE>","sendQuantity":5}]}'
# 3) Verificar: status SENT, items.quantity=5 / requestedQuantity=10, sendNote guardada, stock -5
docker exec -i trinity-postgres-1 psql -U trebol -d grande_db -c "SELECT status,\"sendNote\",items FROM \"PartnerTransfer\" WHERE id='ptr_test1';"
# 4) Limpiar
docker exec -i trinity-postgres-1 psql -U trebol -d grande_db -c "DELETE FROM \"PartnerTransfer\" WHERE id='ptr_test1';"
```
Expected: `status=SENT`, `sendNote='bajo stock'`, `items` con `quantity:5` y `requestedQuantity:10`. El stock del `<CODE>` en `<WH>` bajó 5. (El `curl` puede responder error por el push a un socio no configurado, pero el `$transaction` ya commiteó los cambios — se validan en el SELECT.)

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add apps/api/src/modules/integration/partner-transfers.service.ts apps/api/src/modules/integration/integration.controller.ts
git commit -m "feat: approve de traslado acepta cantidades editadas por línea + nota (envía solo >0, topado por stock)"
```

---

## Task 4: `receive()` ignora líneas en 0 + `sendNote` viaja al socio

**Files:**
- Modify: `apps/api/src/modules/integration/partner-transfers.service.ts` (`receive()` ~línea 358, `pushIncoming()` ~línea 397, `receiveIncoming()` ~línea 409)
- Modify: `apps/api/src/modules/integration/integration.controller.ts` (`transferIncoming`, líneas 151-155)

- [ ] **Step 1: `receive()` salta las líneas con cantidad 0**

En `receive()`, dentro del bloque que arma `resolved` (el `for (const it of items) { ... }`, ~líneas 348-352), agregar un guard para omitir cantidades <= 0. Reemplazar:

```typescript
    for (const it of items) {
      const p = await this.prisma.product.findUnique({ where: { code: it.code }, select: { id: true } });
      if (!p) missing.push(it.code);
      else resolved.push({ productId: p.id, snap: it });
    }
```

por:

```typescript
    for (const it of items) {
      if (!it.quantity || it.quantity <= 0) continue; // línea no enviada (0): no suma stock
      const p = await this.prisma.product.findUnique({ where: { code: it.code }, select: { id: true } });
      if (!p) missing.push(it.code);
      else resolved.push({ productId: p.id, snap: it });
    }
```

- [ ] **Step 2: `pushIncoming()` incluye `sendNote`**

Reemplazar el método `pushIncoming` (~líneas 397-404) por:

```typescript
  // ── Push del envio al socio (idempotente por number) ──
  private async pushIncoming(rec: { id: string; number: string; items: any; notes: string | null; sendNote?: string | null }) {
    const r = await this.partner.post('/integration/transfers/incoming', {
      number: rec.number,
      items: rec.items,
      notes: rec.notes,
      sendNote: (rec as any).sendNote ?? null,
    });
    if (r.ok) await this.prisma.partnerTransfer.update({ where: { id: rec.id }, data: { notified: true } });
  }
```

- [ ] **Step 3: `receiveIncoming()` guarda `sendNote`**

Reemplazar el método `receiveIncoming` (~líneas 409-434) por:

```typescript
  // El socio me ENVIA (o aprobo mi solicitud): registro/actualizo a PENDING_RECEIPT.
  async receiveIncoming(body: { number: string; items: any; notes?: string; sendNote?: string }) {
    const cfg = getIntegrationConfig();
    const existing = await this.prisma.partnerTransfer.findUnique({ where: { number: body.number } });
    if (existing) {
      // Solicitud mia que el socio aprobo: pasa a por-recibir con los items+costos que vienen
      if (existing.status === 'RECEIVED' || existing.status === 'PENDING_RECEIPT') return { ok: true };
      await this.prisma.partnerTransfer.update({
        where: { number: body.number },
        data: { status: 'PENDING_RECEIPT', items: body.items, sendNote: body.sendNote ?? existing.sendNote },
      });
      return { ok: true };
    }
    await this.prisma.partnerTransfer.create({
      data: {
        number: body.number,
        kind: 'SEND',
        direction: 'INCOMING',
        status: 'PENDING_RECEIPT',
        partnerName: cfg.partnerName,
        notes: body.notes ?? null,
        sendNote: body.sendNote ?? null,
        items: body.items,
        notified: true,
      },
    });
    return { ok: true };
  }
```

- [ ] **Step 4: DTO del endpoint entrante**

En `integration.controller.ts`, reemplazar `transferIncoming` (líneas 151-155) por:

```typescript
  @Post('transfers/incoming')
  @UseGuards(IntegrationTokenGuard)
  transferIncoming(@Body() body: { number: string; items: any; notes?: string; sendNote?: string }) {
    return this.transfers.receiveIncoming(body);
  }
```

- [ ] **Step 5: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add apps/api/src/modules/integration/partner-transfers.service.ts apps/api/src/modules/integration/integration.controller.ts
git commit -m "feat: receive ignora líneas en 0 y sendNote viaja al socio por el sync"
```

---

## Task 5: Endpoint de disponibilidad por almacén

Para que la pantalla de aprobar muestre "disponible: N" por línea y tope los inputs.

**Files:**
- Modify: `apps/api/src/modules/integration/partner-transfers.service.ts` (nuevo método `availability`)
- Modify: `apps/api/src/modules/integration/integration.controller.ts` (nueva ruta)

- [ ] **Step 1: Método `availability` en el service**

En `partner-transfers.service.ts`, agregar este método (p. ej. después de `findOne`):

```typescript
  // Stock disponible de los items de un traslado en un almacén dado (para la UI de aprobar).
  async availability(id: string, warehouseId: string): Promise<{ code: string; available: number }[]> {
    if (!warehouseId) throw new BadRequestException('Falta el almacen');
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    const items = rec.items as unknown as { code: string }[];
    const out: { code: string; available: number }[] = [];
    for (const it of items) {
      const p = await this.prisma.product.findUnique({ where: { code: it.code }, select: { id: true } });
      let available = 0;
      if (p) {
        const st = await this.prisma.stock.findUnique({
          where: { productId_warehouseId: { productId: p.id, warehouseId } },
        });
        available = st?.quantity ?? 0;
      }
      out.push({ code: it.code, available });
    }
    return out;
  }
```

- [ ] **Step 2: Ruta en el controller**

En `integration.controller.ts`, debajo del handler `getTransfer` (línea 104), agregar:

```typescript
  @Get('transfers/:id/availability')
  @UseGuards(AuthGuard('jwt'))
  transferAvailability(@Param('id') id: string, @Query('warehouseId') warehouseId: string) {
    return this.transfers.availability(id, warehouseId);
  }
```

- [ ] **Step 3: Typecheck API**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Prueba manual**

Con token forjado y un `warehouseId` real:
```bash
curl -s "http://localhost:4000/integration/transfers/<ID>/availability?warehouseId=<WH>" -H "Authorization: Bearer <TOKEN>"
```
Expected: array `[{code, available}]` con el stock real de cada código en ese almacén.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add apps/api/src/modules/integration/partner-transfers.service.ts apps/api/src/modules/integration/integration.controller.ts
git commit -m "feat: endpoint availability de items de traslado por almacén"
```

---

## Task 6: Frontend — aprobar con cantidades editables + nota + "Solicitado vs Enviado"

**Files:**
- Modify: `apps/web/src/app/(dashboard)/catalog/partner-transfers/[id]/page.tsx`

- [ ] **Step 1: Ampliar el tipo de item y el estado**

En `[id]/page.tsx`, reemplazar la interfaz `TItem` (línea 8) por:

```typescript
interface TItem { code: string; name?: string; quantity: number; requestedQuantity?: number; unitCost?: number }
```

Y dentro del componente, junto a los demás `useState` (después de `const [costBasis, ...]`, línea 34), agregar:

```typescript
  const [sendQty, setSendQty] = useState<Record<string, number>>({});
  const [avail, setAvail] = useState<Record<string, number> | null>(null);
  const [sendNote, setSendNote] = useState('');
```

- [ ] **Step 2: Precargar cantidades a enviar cuando carga un traslado aprobable**

Después del `useEffect` que setea el título (línea 55), agregar:

```typescript
  const canApproveNow = !!t && t.kind === 'REQUEST' && t.direction === 'INCOMING' && t.status === 'REQUESTED';

  // Al cargar una solicitud aprobable, precargar "enviar" = lo solicitado.
  useEffect(() => {
    if (canApproveNow && t) {
      const init: Record<string, number> = {};
      (t.items || []).forEach((i) => { init[i.code] = i.requestedQuantity ?? i.quantity; });
      setSendQty(init);
    }
  }, [canApproveNow, t]);

  // Cuando el usuario elige almacén origen, consultar disponibilidad por línea.
  useEffect(() => {
    if (!canApproveNow || !wh) { setAvail(null); return; }
    let cancel = false;
    fetch(`/api/proxy/integration/transfers/${id}/availability?warehouseId=${encodeURIComponent(wh)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { code: string; available: number }[]) => {
        if (cancel) return;
        const m: Record<string, number> = {};
        rows.forEach((x) => { m[x.code] = x.available; });
        setAvail(m);
      })
      .catch(() => { if (!cancel) setAvail(null); });
    return () => { cancel = true; };
  }, [canApproveNow, wh, id]);
```

- [ ] **Step 3: Enviar cantidades editadas + nota en `act('approve')`**

Reemplazar la línea que arma el `body` dentro de `act` (línea 71) por:

```typescript
      const body =
        kind === 'receive'
          ? { toWarehouseId: wh }
          : kind === 'approve'
          ? {
              fromWarehouseId: wh,
              costBasis,
              sendNote: sendNote.trim() || undefined,
              items: (t!.items || []).map((i) => ({ code: i.code, sendQuantity: Number(sendQty[i.code] ?? 0) })),
            }
          : {};
```

- [ ] **Step 4: Campo de nota en el panel de acciones (solo al aprobar)**

En el bloque de acciones, después del `<div>` de "Valuación" (el bloque `{canApprove && ( <div> ... Costo + brecha ... </div> )}`, que termina en la línea 131 con `</div>`), agregar un campo de nota. Insertar justo después de ese cierre y antes de `{canReceive && (`:

```tsx
            {canApprove && (
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs text-slate-400 mb-1">Nota (opcional)</label>
                <input value={sendNote} onChange={(e) => setSendNote(e.target.value)}
                  placeholder="ej. bajo stock, te mando 5"
                  className="input-field w-full !py-2 text-sm" />
              </div>
            )}
```

- [ ] **Step 5: Tabla de items — columnas Solicitado + Enviar/Enviado**

Reemplazar el `<table>` completo del detalle de items (líneas 161-190, desde `<table className="w-full text-sm">` hasta `</table>`) por:

```tsx
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 text-slate-400">
              <th className="px-4 py-2 text-left">Código</th>
              <th className="px-4 py-2 text-left">Artículo</th>
              <th className="px-4 py-2 text-right">Solicitado</th>
              <th className="px-4 py-2 text-right">{canApprove ? 'Enviar' : 'Enviado'}</th>
              <th className="px-4 py-2 text-right">Costo unit. $</th>
              <th className="px-4 py-2 text-right">Subtotal $</th>
            </tr>
          </thead>
          <tbody>
            {(t.items || []).map((i, idx) => {
              const requested = i.requestedQuantity ?? i.quantity;
              const disponible = avail ? (avail[i.code] ?? 0) : null;
              const diff = !canApprove && requested !== i.quantity;
              return (
                <tr key={idx} className="border-b border-slate-700/30">
                  <td className="px-4 py-2 font-mono text-green-400">{i.code}</td>
                  <td className="px-4 py-2 text-slate-200">{i.name || '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{requested}</td>
                  <td className={`px-4 py-2 text-right ${diff ? 'text-amber-300 font-semibold' : 'text-slate-200'}`}>
                    {canApprove ? (
                      <div className="flex flex-col items-end">
                        <input
                          type="number" min={0} max={disponible ?? undefined}
                          value={sendQty[i.code] ?? ''}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0);
                            const capped = disponible != null ? Math.min(v, disponible) : v;
                            setSendQty((p) => ({ ...p, [i.code]: capped }));
                          }}
                          className="input-field w-24 !py-1 text-sm text-right"
                        />
                        {disponible != null && <span className="text-[11px] text-slate-500 mt-0.5">disponible: {disponible}</span>}
                      </div>
                    ) : (
                      i.quantity
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${i.unitCost.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-300">{i.unitCost != null ? `$${(i.unitCost * i.quantity).toFixed(2)}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700/50 bg-slate-800/30">
              <td colSpan={2} className="px-4 py-2 text-slate-300 font-semibold">Totales</td>
              <td className="px-4 py-2 text-right text-slate-300 font-semibold">{(t.items || []).reduce((s, i) => s + (i.requestedQuantity ?? i.quantity), 0)}</td>
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">{canApprove ? (t.items || []).reduce((s, i) => s + Number(sendQty[i.code] ?? 0), 0) : (t.items || []).reduce((s, i) => s + i.quantity, 0)}</td>
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2 text-right text-slate-200 font-semibold">${totalUsd.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
```

- [ ] **Step 6: Mostrar la nota del que envió en el bloque de datos**

En el bloque de datos (grid, líneas 151-158), después de la línea de `{t.notes && ...}`, agregar:

```tsx
        {(t as any).sendNote && <div className="col-span-2 md:col-span-3"><div className="text-xs text-slate-500">Nota del envío</div><div className="text-slate-200">{(t as any).sendNote}</div></div>}
```

(Para que el tipo lo permita, agregar `sendNote?: string | null;` a la interfaz `Transfer` en la línea 9-14.)

- [ ] **Step 7: Typecheck Web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Prueba manual (UI)**

Con la integración activa (o simulando una solicitud entrante como en Task 3) y logueado: abrir el detalle de una "Solicitud recibida" en REQUESTED → elegir almacén origen → la tabla muestra **Solicitado** y un input **Enviar** por línea con "disponible: N" (topado); escribir una nota; "Aprobar y enviar". Verificar que al recargar la fila muestra Solicitado vs Enviado resaltando la diferencia y la nota.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Diego/Desktop/Trinity
git add "apps/web/src/app/(dashboard)/catalog/partner-transfers/[id]/page.tsx"
git commit -m "feat: aprobar traslado con cantidades editables + nota + Solicitado vs Enviado"
```

---

## Task 7: Pre-deploy checklist + push

**Files:** ninguno (verificación).

- [ ] **Step 1: Typecheck final API + Web**

Run:
```bash
cd /c/Users/Diego/Desktop/Trinity/apps/api && npx tsc --noEmit
cd /c/Users/Diego/Desktop/Trinity/apps/web && npx tsc --noEmit
```
Expected: ambos sin errores.

- [ ] **Step 2: Verificar git limpio (feature) + migración commiteada**

Run: `cd /c/Users/Diego/Desktop/Trinity && git status --porcelain -- apps packages/database/prisma deploy docs && git log --oneline -7`
Expected: no quedan archivos del feature sin commitear; migración `20260807130000_partner_transfer_send_note` y `deploy/fix-schema.sql` incluidos.

- [ ] **Step 3: Push**

Run: `cd /c/Users/Diego/Desktop/Trinity && git push origin main`

- [ ] **Step 4: Handoff a Diego (deploy en las DOS instancias del par integrado)**

Indicar a Diego: desplegar en **ambas** empresas del par (ej. `aceros` y `acerosmayor`) con `bash /opt/deploy-trinity.sh <inst>` (git pull antes). Es **opt-in** por la integración ya activa entre ellas; no requiere flag nuevo. El deploy corre `prisma migrate deploy` (agrega `sendNote`) + `fix-schema.sql` de red. Probar en vivo: A solicita 10, B aprueba enviando 5 → A recibe 5 y ve "Solicitaste 10 · Recibiste 5" + la nota.

---

## Notas de verificación (self-review del plan)

- **Cobertura del spec:** cantidad editable por línea (Task 3 + Task 6) ✓; tope = stock (Task 3 validación + Task 5/6 "disponible") ✓; 0 = no envía, todas-en-0 = error (Task 3) ✓; solicitado vs enviado en items JSON (Task 2 request + Task 3 fullItems) y en UI ambos lados (Task 6) ✓; nota por traslado que viaja al socio (Task 1 columna + Task 3 guarda + Task 4 sync) ✓; solo ajusta cantidades, no agrega productos (Task 3 itera sobre `reqItems`) ✓; el que pide no re-aprueba (sin cambios al flujo de A) ✓; compat traslados viejos (`requestedQuantity ?? quantity` en Task 3 y Task 6) ✓; CxC/descuento sobre lo enviado (Task 3 usa `resolved`) ✓; receive ignora 0 (Task 4) ✓.
- **Consistencia de tipos:** `approve` DTO `{ fromWarehouseId, costBasis?, sendNote?, items?: {code, sendQuantity}[] }` es idéntico en service (Task 3), controller (Task 3) y el body que arma el front (Task 6). El item JSON `{ code, name, requestedQuantity, quantity, unitCost }` es el mismo en `request` (Task 2), `approve.fullItems` (Task 3), la interfaz `TItem` y el render (Task 6). `availability` devuelve `{code, available}[]` consumido igual en el front.
- **Sin placeholders:** cada paso trae el código o comando concreto (los `<CODE>/<WH>/<TOKEN>/<ID>` de las pruebas manuales son valores reales que el ejecutor sustituye al probar, no del código).
