# Integración total ↔ totalturen — Fase 2: Copiar precios (Función C) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps con checkbox.

**Goal:** Traer los precios de venta de la empresa socia por `code`, ver un preview (mi precio vs socio) y aplicarlos como **precio manual**. Bidireccional.

**Architecture:** Se apoya en la base de la Fase 1 (`PartnerClient`, guard, config). Nuevos endpoints en el módulo `integration`. UI: página dedicada `/catalog/partner-prices` + botón condicional en Ajuste de precios.

**Tech Stack:** NestJS 10, Prisma 5, Next.js App Router, `fetch`. Verificación: `tsc --noEmit` + curl (sin jest).

---

## Task 1: Backend — precios locales (entrante) + status + preview + apply

**Files:**
- Modify: `apps/api/src/modules/integration/integration.service.ts`
- Modify: `apps/api/src/modules/integration/integration.controller.ts`
- Modify: `apps/api/src/modules/integration/integration.module.ts` (importar StoreExportModule)

- [ ] **Step 1:** En `integration.service.ts`, importar y agregar métodos.

Agregar imports arriba:
```typescript
import { StoreExportService } from '../store-export/store-export.service';
```
Inyectar en el constructor (agregar parámetro): `private readonly storeExport: StoreExportService,`

Agregar tipos y métodos:
```typescript
export interface PartnerPrice { code: string; priceDetal: number; priceMayor: number; }

export interface PartnerPriceRow {
  code: string; name: string;
  myPriceDetal: number; myPriceMayor: number;
  partnerPriceDetal: number; partnerPriceMayor: number;
  differs: boolean;
}

// ── Entrante: mis precios para el socio ──
async localPrices(): Promise<PartnerPrice[]> {
  const products = await this.prisma.product.findMany({
    where: { isActive: true },
    select: { code: true, priceDetal: true, priceMayor: true },
  });
  return products.map((p) => ({ code: p.code, priceDetal: p.priceDetal, priceMayor: p.priceMayor }));
}

// ── Estado de la integracion (para el frontend) ──
status(): { enabled: boolean; partnerName: string } {
  return { enabled: this.partner.isConfigured(), partnerName: getIntegrationConfig().partnerName };
}

// ── Preview: mis precios vs los del socio, cruzando por code ──
async partnerPricesPreview(): Promise<{
  enabled: boolean; available: boolean; partnerName: string; rows: PartnerPriceRow[]; noMatchCount: number;
}> {
  const cfg = getIntegrationConfig();
  if (!this.partner.isConfigured()) return { enabled: false, available: false, partnerName: cfg.partnerName, rows: [], noMatchCount: 0 };
  const r = await this.partner.get<PartnerPrice[]>('/integration/products/prices');
  if (!r.ok || !r.data) return { enabled: true, available: false, partnerName: cfg.partnerName, rows: [], noMatchCount: 0 };
  const partnerMap = new Map(r.data.map((x) => [x.code, x]));
  const mine = await this.prisma.product.findMany({
    where: { isActive: true },
    select: { code: true, name: true, priceDetal: true, priceMayor: true },
  });
  const rows: PartnerPriceRow[] = [];
  for (const p of mine) {
    const pp = partnerMap.get(p.code);
    if (!pp) continue;
    rows.push({
      code: p.code, name: p.name,
      myPriceDetal: p.priceDetal, myPriceMayor: p.priceMayor,
      partnerPriceDetal: pp.priceDetal, partnerPriceMayor: pp.priceMayor,
      differs: Math.abs(p.priceDetal - pp.priceDetal) > 0.001 || Math.abs(p.priceMayor - pp.priceMayor) > 0.001,
    });
  }
  const noMatchCount = mine.length - rows.length;
  return { enabled: true, available: true, partnerName: cfg.partnerName, rows, noMatchCount };
}

// ── Aplicar: pone el precio del socio como PRECIO MANUAL en mis productos ──
async applyPartnerPrices(codes: string[], userId: string): Promise<{ applied: number }> {
  if (!this.partner.isConfigured()) return { applied: 0 };
  const r = await this.partner.get<PartnerPrice[]>('/integration/products/prices');
  if (!r.ok || !r.data) return { applied: 0 };
  const partnerMap = new Map(r.data.map((x) => [x.code, x]));
  const wanted = new Set(codes);
  const targets = (await this.prisma.product.findMany({
    where: { isActive: true, code: { in: codes } },
    select: { id: true, code: true },
  })).filter((p) => wanted.has(p.code) && partnerMap.has(p.code));

  let applied = 0;
  await this.prisma.$transaction(async (tx) => {
    for (const t of targets) {
      const pp = partnerMap.get(t.code)!;
      await tx.product.update({
        where: { id: t.id },
        data: {
          priceDetal: Math.round(pp.priceDetal * 100) / 100,
          priceMayor: Math.round(pp.priceMayor * 100) / 100,
          manualPrice: true,
        },
      });
      applied++;
    }
    await tx.priceAdjustmentLog.create({
      data: {
        filters: { source: 'partner-prices', partner: getIntegrationConfig().partnerName } as any,
        adjustmentType: 'PARTNER_PRICES',
        gananciaPct: null, gananciaMayorPct: null,
        productsAffected: applied, createdById: userId,
      },
    });
  }, { timeout: 60000 });
  this.storeExport.scheduleExport();
  return { applied };
}
```

- [ ] **Step 2:** En `integration.controller.ts` agregar endpoints (importar `Body, Post`, `AuthGuard`, `RolesGuard`, `Roles`, `UserRole`, `CurrentUser` como en products.controller):

```typescript
// entrante
@Get('products/prices')
@UseGuards(IntegrationTokenGuard)
prices() { return this.service.localPrices(); }

// internos (JWT)
@Get('status')
@UseGuards(AuthGuard('jwt'))
status() { return this.service.status(); }

@Get('partner/prices/preview')
@UseGuards(AuthGuard('jwt'))
pricesPreview() { return this.service.partnerPricesPreview(); }

@Post('partner/prices/apply')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
pricesApply(@Body() body: { codes: string[] }, @CurrentUser('id') userId: string) {
  return this.service.applyPartnerPrices(body.codes || [], userId);
}
```

- [ ] **Step 3:** En `integration.module.ts` importar `StoreExportModule`:
```typescript
import { StoreExportModule } from '../store-export/store-export.module';
// @Module({ imports: [StoreExportModule], ... })
```

- [ ] **Step 4:** Typecheck: `cd apps/api && node_modules/.bin/tsc --noEmit -p tsconfig.json` → 0 errores.

- [ ] **Step 5:** Verificar rutas mapeadas en el dev: `Mapped {/integration/products/prices}`, `.../status`, `.../partner/prices/preview`, `.../partner/prices/apply`.

- [ ] **Step 6:** Commit: `git add apps/api/src/modules/integration && git commit -m "feat: integration - copiar precios del socio (preview + apply como manual)"`

---

## Task 2: Verificación end-to-end (loopback)

- [ ] **Step 1:** Con loopback activo (Fase 1) y un JWT admin: `curl -H "X-Integration-Token: prueba-token-123" localhost:4000/integration/products/prices` → lista `[{code,priceDetal,priceMayor},...]`.
- [ ] **Step 2:** `curl -H "Authorization: Bearer $TOKEN" localhost:4000/integration/partner/prices/preview` → `{enabled:true, available:true, rows:[...], noMatchCount}` (contra sí mismo, differs=false en todo).
- [ ] **Step 3:** `curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"codes":["HRA13215"]}' localhost:4000/integration/partner/prices/apply` → `{applied:1}`.

---

## Task 3: Frontend — página `/catalog/partner-prices`

**Files:**
- Create: `apps/web/src/app/(dashboard)/catalog/partner-prices/page.tsx`

- [ ] **Step 1:** Crear la página (client component) que: fetch `/api/proxy/integration/partner/prices/preview`; si `!enabled` muestra aviso; si `!available` muestra "socio sin conexión"; si hay rows, tabla con checkbox (por defecto marcadas las que `differs`), columnas código/nombre/mi precio/precio socio; botón "Aplicar seleccionados" → `POST /api/proxy/integration/partner/prices/apply` con `{codes}`; recargar tras aplicar. `document.title = 'Precios socio | Trinity ERP'`.

- [ ] **Step 2:** Typecheck web → 0 errores.

- [ ] **Step 3:** Commit.

---

## Task 4: Botón de acceso desde Ajuste de precios (condicional)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/catalog/price-adjustment/page.tsx`

- [ ] **Step 1:** En el `useEffect` de metadata, fetch `/api/proxy/integration/status` → guardar `{enabled, partnerName}` en estado.
- [ ] **Step 2:** Si `enabled`, mostrar un botón/enlace "Traer precios de {partnerName}" (Link a `/catalog/partner-prices`) en la barra de filtros.
- [ ] **Step 3:** Typecheck web → 0 errores. Commit.

---

## Cierre Fase 2
- [ ] Push. Deploy pendiente (mismo que Fase 1: env vars + `/opt/deploy-trinity.sh`).

## Self-review
- Función C (preview + aplicar como manual, bidireccional, cruce por code): Task 1-3 ✓
- Entrante `products/prices` protegido por token; internos por JWT; apply por ADMIN ✓
- Re-export de tienda tras aplicar ✓
- Sin placeholders; tipos `PartnerPrice`/`PartnerPriceRow` definidos en Task 1 y usados en el resto.
