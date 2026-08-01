# Integración total ↔ totalturen — Fase 3: Sync de altas (Función D) — Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Al crear un artículo nuevo en una empresa, empujarlo (async, sin bloquear) a la socia, que lo crea si no lo tiene, copiando identidad + costo + precio. Red de seguridad: reconciliación (cron + manual) que crea los códigos faltantes.

**Architecture:** Se apoya en la base (Fase 1). `IntegrationService` gana métodos de upsert/catálogo/push/reconcile. `ProductsService.create` dispara el push fire-and-forget (import de `IntegrationModule` en `ProductsModule`; sin ciclo porque Integration no importa Products). Marca se resuelve por nombre (crear si falta), categoría por code/nombre.

---

## Task 1: Payload + receiveUpsert + catalog + push + reconcile (service)

**Files:** Modify `apps/api/src/modules/integration/integration.service.ts`

- [ ] **Step 1:** Importar `IvaType` de `@prisma/client`. Agregar interface y métodos:

```typescript
export interface ProductSyncPayload {
  code: string;
  name: string;
  description?: string | null;
  barcode?: string | null;
  supplierRef?: string | null;
  purchaseUnit?: string;
  saleUnit?: string;
  conversionFactor?: number;
  ivaType?: IvaType;
  costUsd: number;
  gananciaPct: number;
  gananciaMayorPct: number;
  priceDetal: number;
  priceMayor: number;
  manualPrice: boolean;
  bregaApplies: boolean;
  brandName?: string | null;
  categoryName?: string | null;
  categoryCode?: string | null;
}

private async buildPayload(productId: string): Promise<ProductSyncPayload | null> {
  const p = await this.prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true, category: true },
  });
  if (!p) return null;
  return {
    code: p.code, name: p.name, description: p.description, barcode: p.barcode,
    supplierRef: p.supplierRef, purchaseUnit: p.purchaseUnit, saleUnit: p.saleUnit,
    conversionFactor: p.conversionFactor, ivaType: p.ivaType,
    costUsd: p.costUsd, gananciaPct: p.gananciaPct, gananciaMayorPct: p.gananciaMayorPct,
    priceDetal: p.priceDetal, priceMayor: p.priceMayor,
    manualPrice: p.manualPrice, bregaApplies: p.bregaApplies,
    brandName: p.brand?.name ?? null,
    categoryName: p.category?.name ?? null, categoryCode: p.category?.code ?? null,
  };
}

// ── Entrante: crear si no existe (idempotente por code) ──
async receiveUpsert(payload: ProductSyncPayload): Promise<{ created: boolean; code: string; reason?: string }> {
  if (!payload?.code) return { created: false, code: '', reason: 'no-code' };
  const exists = await this.prisma.product.findUnique({ where: { code: payload.code }, select: { id: true } });
  if (exists) return { created: false, code: payload.code, reason: 'exists' };

  // Marca: por nombre, crear si falta
  let brandId: string | undefined;
  if (payload.brandName) {
    const b = await this.prisma.brand.findFirst({ where: { name: payload.brandName } })
      ?? await this.prisma.brand.create({ data: { name: payload.brandName } });
    brandId = b.id;
  }
  // Categoria: por code (unico) o nombre, crear si falta
  let categoryId: string | undefined;
  if (payload.categoryCode || payload.categoryName) {
    let cat = payload.categoryCode
      ? await this.prisma.category.findUnique({ where: { code: payload.categoryCode } })
      : await this.prisma.category.findFirst({ where: { name: payload.categoryName ?? '' } });
    if (!cat) {
      cat = await this.prisma.category.create({
        data: { name: payload.categoryName ?? payload.categoryCode ?? 'Sin categoria', code: payload.categoryCode ?? undefined },
      });
    }
    categoryId = cat.id;
  }
  // Barcode: evitar choque de unicidad
  let barcode: string | null = payload.barcode ?? null;
  if (barcode) {
    const used = await this.prisma.product.findUnique({ where: { barcode }, select: { id: true } });
    if (used) barcode = null;
  }

  await this.prisma.product.create({
    data: {
      code: payload.code, name: payload.name, description: payload.description ?? null,
      barcode, supplierRef: payload.supplierRef ?? null,
      purchaseUnit: payload.purchaseUnit ?? 'UNIT', saleUnit: payload.saleUnit ?? 'UNIT',
      conversionFactor: payload.conversionFactor ?? 1, ivaType: payload.ivaType ?? IvaType.GENERAL,
      costUsd: payload.costUsd ?? 0, gananciaPct: payload.gananciaPct ?? 0, gananciaMayorPct: payload.gananciaMayorPct ?? 0,
      priceDetal: payload.priceDetal ?? 0, priceMayor: payload.priceMayor ?? 0,
      manualPrice: payload.manualPrice ?? false, bregaApplies: payload.bregaApplies ?? true,
      brandId, categoryId,
    },
  });
  this.storeExport.scheduleExport();
  return { created: true, code: payload.code };
}

// ── Entrante: catalogo completo para reconciliacion ──
async localCatalog(): Promise<ProductSyncPayload[]> {
  const products = await this.prisma.product.findMany({
    where: { isActive: true }, include: { brand: true, category: true },
  });
  return products.map((p) => ({
    code: p.code, name: p.name, description: p.description, barcode: p.barcode,
    supplierRef: p.supplierRef, purchaseUnit: p.purchaseUnit, saleUnit: p.saleUnit,
    conversionFactor: p.conversionFactor, ivaType: p.ivaType,
    costUsd: p.costUsd, gananciaPct: p.gananciaPct, gananciaMayorPct: p.gananciaMayorPct,
    priceDetal: p.priceDetal, priceMayor: p.priceMayor,
    manualPrice: p.manualPrice, bregaApplies: p.bregaApplies,
    brandName: p.brand?.name ?? null, categoryName: p.category?.name ?? null, categoryCode: p.category?.code ?? null,
  }));
}

// ── Saliente: empujar un alta al socio (fire-and-forget, nunca lanza) ──
async pushNewProduct(productId: string): Promise<void> {
  try {
    if (!this.partner.isConfigured()) return;
    const payload = await this.buildPayload(productId);
    if (!payload) return;
    await this.partner.post('/integration/products/upsert', payload);
  } catch {
    // nunca romper el alta local
  }
}

// ── Reconciliacion: crear localmente los codes que el socio tiene y yo no ──
async reconcileFromPartner(): Promise<{ created: number; checked: number }> {
  if (!this.partner.isConfigured()) return { created: 0, checked: 0 };
  const r = await this.partner.get<ProductSyncPayload[]>('/integration/products/catalog', 15000);
  if (!r.ok || !r.data) return { created: 0, checked: 0 };
  const myCodes = new Set((await this.prisma.product.findMany({ select: { code: true } })).map((p) => p.code));
  let created = 0;
  for (const payload of r.data) {
    if (myCodes.has(payload.code)) continue;
    const res = await this.receiveUpsert(payload);
    if (res.created) created++;
  }
  return { created, checked: r.data.length };
}
```

- [ ] **Step 2:** Typecheck API → 0 errores. Commit.

---

## Task 2: Endpoints (controller)

**Files:** Modify `apps/api/src/modules/integration/integration.controller.ts`

- [ ] **Step 1:** Agregar:

```typescript
// entrantes (token)
@Post('products/upsert')
@UseGuards(IntegrationTokenGuard)
upsert(@Body() body: any) { return this.service.receiveUpsert(body); }

@Get('products/catalog')
@UseGuards(IntegrationTokenGuard)
catalog() { return this.service.localCatalog(); }

// interno (JWT + ADMIN): reconciliacion manual
@Post('partner/sync/reconcile')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
reconcile() { return this.service.reconcileFromPartner(); }
```

- [ ] **Step 2:** Typecheck → 0 errores. Verificar rutas mapeadas. Commit.

---

## Task 3: Disparar el push al crear producto

**Files:** Modify `apps/api/src/modules/products/products.service.ts`, `apps/api/src/modules/products/products.module.ts`

- [ ] **Step 1:** En `products.module.ts` importar `IntegrationModule` (en `imports`).
- [ ] **Step 2:** En `products.service.ts` inyectar `private readonly integration: IntegrationService` (import desde `../integration/integration.service`), y en `create()`, tras `this.storeExport.scheduleExport();` y antes de `return created;`, agregar:

```typescript
void this.integration.pushNewProduct(created.id); // sync al socio (async, no bloquea)
```

- [ ] **Step 3:** Typecheck → 0 errores (verificar que no haya dependencia circular: Integration NO importa Products). Commit.

---

## Task 4: Cron de reconciliación (red de seguridad)

**Files:** Create `apps/api/src/modules/integration/integration.cron.ts`, modify `integration.module.ts`

- [ ] **Step 1:** Crear el cron (cada 30 min, solo si configurado):

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrationService } from './integration.service';
import { canCallPartner } from './integration.config';

@Injectable()
export class IntegrationCron {
  private readonly logger = new Logger(IntegrationCron.name);
  constructor(private readonly service: IntegrationService) {}

  @Cron(CronExpression.EVERY_30_MINUTES, { timeZone: 'America/Caracas' })
  async handle() {
    if (!canCallPartner()) return;
    try {
      const r = await this.service.reconcileFromPartner();
      if (r.created > 0) this.logger.log(`Reconciliacion socio: ${r.created} altas creadas`);
    } catch (e) {
      this.logger.error(`Reconciliacion socio fallo: ${(e as Error).message}`);
    }
  }
}
```

- [ ] **Step 2:** Registrar `IntegrationCron` en `providers` del módulo. Typecheck → 0 errores. Commit.

---

## Task 5: Verificación end-to-end (loopback temporal)

- [ ] Reactivar loopback temporal en `.env`, reiniciar. Con token: `POST /integration/products/upsert` con un code nuevo → `{created:true}`; repetir → `{created:false, reason:'exists'}`. `GET /integration/products/catalog` → lista. `POST /integration/partner/sync/reconcile` (JWT admin) → `{created, checked}`. Crear un producto por la UI/endpoint y ver el push (contra sí mismo devuelve exists). **Quitar el loopback al terminar.**

## Cierre
- [ ] Push. Deploy pendiente (env vars).

## Self-review
- Función D (push async al crear + create-if-missing + copia costo/precio + reconciliación cron/manual): Tasks 1-4 ✓
- No bloquea el alta (fire-and-forget, try/catch) ✓
- Marca por nombre / categoría por code-nombre, crear si falta; barcode sin choque ✓
- Sin ciclo de módulos (Integration no importa Products) ✓
