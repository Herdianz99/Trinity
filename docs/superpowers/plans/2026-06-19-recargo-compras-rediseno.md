# Rediseño del Recargo en Facturas de Compra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el "Recargo $" de una factura de compra NUNCA altere el total ni los montos de la factura (que debe ser idéntica a la del proveedor), y que en su lugar se reparta entre los artículos no-servicio incrementando su **costo de inventario** (costo aterrizado), que es lo que define el precio de venta.

**Architecture:** Se separa el "costo de factura" (lo que cobró el proveedor, intacto) del "costo aterrizado" (costo + recargo repartido, para inventario/precio). Se agrega un campo `landedCostUsd`/`landedCostBs` por ítem que guarda el costo aterrizado. El recargo deja de sumarse al total tanto en backend (`calculateFiscalTotals`) como en frontend. La distribución del recargo deja de mutar los totales de línea y solo calcula el costo aterrizado. El monto de las líneas de servicio auto-rellena el campo "Recargo $" en el frontend.

**Tech Stack:** NestJS + Prisma 5 (PostgreSQL) en `apps/api`; Next.js (App Router, React) en `apps/web`; monorepo pnpm con `@trinity/database`.

---

## Reglas de negocio (confirmadas con el usuario)

1. **La factura debe ser idéntica a la del proveedor.** Si el proveedor trae "recuperación de gastos" como artículo de servicio, se carga como línea y queda en el total. Total y montos = exactamente lo que mandó el proveedor.
2. **El "Recargo $" jamás suma al total ni cambia los montos de línea.** Solo reparte costos (fletes/gastos) entre los artículos no-servicio, subiendo su **costo** (no su precio en la factura).
3. **Dos escenarios:**
   - **A (servicio en la factura):** la línea de servicio se queda y cuenta en el total; su monto auto-rellena "Recargo $" para repartirse en el costo de los demás artículos.
   - **B (recargo fuera de la factura, ej. flete):** se escribe el "Recargo $" a mano; no aparece en la factura, no afecta el total; solo reparte en el costo.
4. El reparto respeta el toggle **PROPORCIONAL / EQUITATIVO** ya existente.
5. El costo aterrizado alimenta `Product.costUsd` y el recálculo de `priceDetal`/`priceMayor` al **recibir** la mercadería (`process()`), no antes.

### Decisión de diseño a validar en review
El campo "Recargo $" del frontend **se auto-rellena con la suma de las líneas de servicio** y queda **editable** (flag "tocado"): si el usuario escribe un valor, ese gana (Escenario B / flete externo) y deja de auto-sincronizarse hasta recargar la página. Si esta UX no es la deseada, ajustar en la Task 5.

### Ejemplo de referencia (FC-00026, id `cmql1pgav0152bqnj30t4j2qe`)
| | Hoy (mal) | Debe quedar |
|---|---|---|
| Líneas | CODO 41.10 + POCETA 469.95 + RECUP. GASTOS (servicio) 17.21 | igual |
| Subtotal | 528.26 | 528.26 |
| Recargo $ | 17.21 | 17.21 (auto desde la línea de servicio) |
| **Total factura** | **545.47** ❌ | **528.26** ✅ |
| Costo aterrizado CODO | 1.37 ❌ | **1.42** (1.37 + 0.05) |
| Costo aterrizado POCETA | 93.99 ❌ | **97.16** (93.99 + 3.17) |

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `packages/database/prisma/schema.prisma` | Modelo `PurchaseOrderItem` | Modificar: +`landedCostUsd`, +`landedCostBs` |
| `packages/database/prisma/migrations/20260619190000_add_landed_cost_purchase_item/migration.sql` | Migración SQL idempotente | Crear |
| `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` | Lógica de cálculo, creación, edición y recepción | Modificar: `calculateFiscalTotals`, helper nuevo `applySurchargeLandedCost`, `create`, `update`, `process` |
| `apps/web/src/app/(dashboard)/purchases/new/page.tsx` | Formulario nueva compra | Modificar: total sin recargo + auto-relleno recargo |
| `apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx` | Formulario edición compra | Modificar: total sin recargo + auto-relleno recargo |

> **Nota TDD:** el proyecto NO tiene infraestructura de tests (no hay `*.spec.ts` ni script `test` en `apps/api`). La verificación de cada task se hace con: (a) build/typecheck del paquete afectado y (b) consultas a la BD / prueba manual en la app. No se introduce un framework de tests nuevo (YAGNI).

---

## Task 1: Migración — campo de costo aterrizado en `PurchaseOrderItem`

**Files:**
- Modify: `packages/database/prisma/schema.prisma:719-720`
- Create: `packages/database/prisma/migrations/20260619190000_add_landed_cost_purchase_item/migration.sql`

- [ ] **Step 1: Agregar los campos al modelo Prisma**

En `schema.prisma`, dentro de `model PurchaseOrderItem`, justo después de la línea `netCostBs Float @default(0)` (línea 720), agregar:

```prisma
  netCostUsd      Float         @default(0)
  netCostBs       Float         @default(0)
  landedCostUsd   Float         @default(0)
  landedCostBs    Float         @default(0)
}
```

(Las dos primeras líneas ya existen; solo se añaden `landedCostUsd` y `landedCostBs` antes del cierre `}` del modelo.)

- [ ] **Step 2: Crear la migración SQL idempotente**

Crear `packages/database/prisma/migrations/20260619190000_add_landed_cost_purchase_item/migration.sql` con:

```sql
-- Costo aterrizado (costo de factura + recargo repartido). Usado solo para inventario/precio, no para la factura.
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "landedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN IF NOT EXISTS "landedCostBs" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: para filas existentes el costo aterrizado = costo neto de factura (sin recargo aplicado aún)
UPDATE "PurchaseOrderItem" SET "landedCostUsd" = "netCostUsd" WHERE "landedCostUsd" = 0 AND "netCostUsd" <> 0;
UPDATE "PurchaseOrderItem" SET "landedCostBs"  = "netCostBs"  WHERE "landedCostBs"  = 0 AND "netCostBs"  <> 0;
```

- [ ] **Step 3: Aplicar la migración en local y regenerar el cliente**

Run:
```bash
pnpm --filter @trinity/database exec prisma migrate dev --name add_landed_cost_purchase_item
pnpm --filter @trinity/database exec prisma generate
```
Expected: la migración aplica sin error y `prisma generate` recompila el cliente con los campos nuevos.
> Si el seed falla con P2022 tras migrar, aplicar `deploy/fix-schema.sql` (ver memoria de setup local).

- [ ] **Step 4: Verificar columnas en BD local**

Run:
```bash
pnpm --filter @trinity/database exec prisma db execute --stdin <<'SQL'
SELECT column_name FROM information_schema.columns
WHERE table_name = 'PurchaseOrderItem' AND column_name IN ('landedCostUsd','landedCostBs');
SQL
```
Expected: devuelve las dos columnas.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260619190000_add_landed_cost_purchase_item/migration.sql
git commit -m "feat: Session 61 - campo landedCost en PurchaseOrderItem (costo aterrizado para recargo)"
```

---

## Task 2: Backend — quitar el recargo del total en `calculateFiscalTotals`

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts:122` (rama BS) y `:166` (rama USD)

- [ ] **Step 1: Rama BS — no sumar el recargo al total**

En `calculateFiscalTotals`, reemplazar la línea 122:

```ts
      const totalBs = round2(subtotalAfterDiscountBs + totalIvaBs + surchargeBs);
```
por:
```ts
      // El recargo NO afecta el total de la factura (solo el costo aterrizado de los items)
      const totalBs = round2(subtotalAfterDiscountBs + totalIvaBs);
```

(Las variables `surchargeUsd`/`surchargeBs` se siguen calculando arriba porque se devuelven como `totalSurchargeUsd`/`totalSurchargeBs` informativos.)

- [ ] **Step 2: Rama USD — no sumar el recargo al total**

Reemplazar las líneas 165-166:

```ts
    const totalSurchargeUsd = surchargeInput;
    const totalUsd = round2(subtotalAfterDiscountUsd + totalIvaUsd + totalSurchargeUsd);
```
por:
```ts
    const totalSurchargeUsd = surchargeInput;
    // El recargo NO afecta el total de la factura (solo el costo aterrizado de los items)
    const totalUsd = round2(subtotalAfterDiscountUsd + totalIvaUsd);
```

- [ ] **Step 3: Build del API**

Run: `pnpm --filter @trinity/api build`
Expected: compila sin errores de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat: Session 61 - el recargo deja de sumarse al total de la factura de compra"
```

---

## Task 3: Backend — repartir el recargo como costo aterrizado (sin tocar la factura)

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts` — agregar helper `applySurchargeLandedCost`; reemplazar bloques de distribución en `create` (276-318) y `update` (511-553); agregar `landedCost*` al armado de items en `create` (257-273) y `update` (492-509).

- [ ] **Step 1: Agregar el helper de costo aterrizado**

Justo después del método `calculateItemValues` (después de la línea 77, antes de `calculateFiscalTotals`), agregar:

```ts
  /**
   * Calcula el costo aterrizado (costo de factura + recargo repartido) por item.
   * NO modifica los totales de la factura (totalUsd/netCostUsd quedan intactos).
   * Los items de servicio nunca reciben recargo. Muta item.landedCostUsd/landedCostBs.
   */
  private applySurchargeLandedCost(
    items: Array<{
      productId: string;
      quantity: number;
      netCostUsd: number;
      netCostBs: number;
      totalUsd: number;
      totalBs: number;
      landedCostUsd: number;
      landedCostBs: number;
    }>,
    serviceIds: Set<string>,
    surchargeInput: number,
    surchargeDistribution: string,
    currency: 'USD' | 'BS',
    exchangeRate: number,
  ) {
    // Por defecto el costo aterrizado = costo neto (sin recargo)
    for (const item of items) {
      item.landedCostUsd = item.netCostUsd;
      item.landedCostBs = item.netCostBs;
    }
    if (!surchargeInput || surchargeInput <= 0) return;

    const nonServiceItems = items.filter((i) => !serviceIds.has(i.productId));
    if (nonServiceItems.length === 0) return;

    if (currency === 'BS') {
      const totalNonServiceBs = nonServiceItems.reduce((sum, i) => sum + i.totalBs, 0);
      for (const item of nonServiceItems) {
        const share = surchargeDistribution === 'PROPORTIONAL'
          ? (totalNonServiceBs > 0 ? (item.totalBs / totalNonServiceBs) * surchargeInput : 0)
          : surchargeInput / nonServiceItems.length;
        const perUnitBs = round2(share / item.quantity);
        item.landedCostBs = round2(item.netCostBs + perUnitBs);
        item.landedCostUsd = round2(item.landedCostBs / exchangeRate);
      }
    } else {
      const totalNonServiceUsd = nonServiceItems.reduce((sum, i) => sum + i.totalUsd, 0);
      for (const item of nonServiceItems) {
        const share = surchargeDistribution === 'PROPORTIONAL'
          ? (totalNonServiceUsd > 0 ? (item.totalUsd / totalNonServiceUsd) * surchargeInput : 0)
          : surchargeInput / nonServiceItems.length;
        const perUnitUsd = round2(share / item.quantity);
        item.landedCostUsd = round2(item.netCostUsd + perUnitUsd);
        item.landedCostBs = round2(item.landedCostUsd * exchangeRate);
      }
    }
  }
```

- [ ] **Step 2: `create` — incluir landedCost en el armado de items**

En `create`, en el `.map` que arma `items` (líneas 257-273), agregar las dos propiedades nuevas al objeto retornado, después de `totalBs: calc.totalBs,`:

```ts
          totalUsd: calc.totalUsd,
          totalBs: calc.totalBs,
          landedCostUsd: calc.netCostUsd,
          landedCostBs: calc.netCostBs,
        };
      });
```

- [ ] **Step 3: `create` — reemplazar el bloque de distribución por el helper**

Reemplazar TODO el bloque `// Distribute surcharge among non-service items` (líneas 275-318, desde `if (surchargeUsd > 0) {` hasta su `}` de cierre, incluyendo el comentario) por:

```ts
      // Repartir el recargo en el costo aterrizado (NO toca los totales de la factura)
      if (surchargeUsd > 0) {
        const products = await tx.product.findMany({
          where: { id: { in: items.map((i) => i.productId) } },
          select: { id: true, isService: true },
        });
        const serviceIds = new Set(products.filter((p: any) => p.isService).map((p: any) => p.id));
        this.applySurchargeLandedCost(items, serviceIds, surchargeUsd, surchargeDistribution, currency as 'USD' | 'BS', rate);
      }
```

- [ ] **Step 4: `update` — incluir landedCost en el armado de items**

En `update`, en el `.map` que arma `items` (líneas 492-509), agregar después de `totalBs: calc.totalBs,`:

```ts
          totalUsd: calc.totalUsd,
          totalBs: calc.totalBs,
          landedCostUsd: calc.netCostUsd,
          landedCostBs: calc.netCostBs,
        };
      });
```

- [ ] **Step 5: `update` — reemplazar el bloque de distribución por el helper**

Reemplazar TODO el bloque `// Distribute surcharge` (líneas 511-553, desde `if (surchargeUsd > 0) {` hasta su `}` de cierre) por:

```ts
      // Repartir el recargo en el costo aterrizado (NO toca los totales de la factura)
      if (surchargeUsd > 0) {
        const products = await this.prisma.product.findMany({
          where: { id: { in: items.map((i) => i.productId) } },
          select: { id: true, isService: true },
        });
        const serviceIds = new Set(products.filter((p) => p.isService).map((p) => p.id));
        this.applySurchargeLandedCost(items, serviceIds, surchargeUsd, surchargeDistribution, currency as 'USD' | 'BS', rate);
      }
```

- [ ] **Step 6: Build del API**

Run: `pnpm --filter @trinity/api build`
Expected: compila sin errores. (Los objetos de `items` ahora incluyen `landedCostUsd`/`landedCostBs`, que Prisma persiste en las columnas nuevas vía `items: { create: items }` y `createMany({ data: items })`.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat: Session 61 - recargo se reparte como costo aterrizado sin alterar la factura"
```

---

## Task 4: Backend — usar el costo aterrizado al recibir la mercadería (`process`)

**Files:**
- Modify: `apps/api/src/modules/purchase-orders/purchase-orders.service.ts:701` y `:721`

- [ ] **Step 1: Usar landedCost como costo del producto**

En `process()`, reemplazar la línea 701:

```ts
          const newCost = item.netCostUsd;
```
por:
```ts
          // Costo aterrizado = costo de factura + recargo repartido (define el precio de venta)
          const newCost = item.landedCostUsd || item.netCostUsd;
```

- [ ] **Step 2: Registrar el costo aterrizado en el movimiento de stock**

Reemplazar la línea 721:

```ts
            costUsd: item.netCostUsd,
```
por:
```ts
            costUsd: item.landedCostUsd || item.netCostUsd,
```

- [ ] **Step 3: Build del API**

Run: `pnpm --filter @trinity/api build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/purchase-orders/purchase-orders.service.ts
git commit -m "feat: Session 61 - process() usa costo aterrizado para costo de inventario y precio"
```

---

## Task 5: Frontend — formulario "nueva compra" (total sin recargo + auto-relleno)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/purchases/new/page.tsx:380` (total), `:144` (estado), y agregar `useEffect` de auto-relleno.

- [ ] **Step 1: Quitar el recargo del total calculado**

Reemplazar la línea 380:

```ts
    const totalPrimario = subtotalAfterDiscount + totalIvaPrimario + surchargeUsd;
```
por:
```ts
    // El recargo NO afecta el total de la factura (solo el costo aterrizado)
    const totalPrimario = subtotalAfterDiscount + totalIvaPrimario;
```

- [ ] **Step 2: Agregar el flag "tocado" para el recargo**

Después de la línea 145 (`const [surchargeDistribution, setSurchargeDistribution] = ...`), agregar:

```ts
  const [surchargeTouched, setSurchargeTouched] = useState(false);
```

- [ ] **Step 3: Auto-rellenar el recargo con la suma de líneas de servicio**

Después del bloque de estado de items (después de la línea 148, junto a los demás `useEffect`/cálculos), agregar un efecto que sincroniza el recargo con el monto de los servicios mientras el usuario no lo haya editado manualmente:

```ts
  // Auto-rellenar "Recargo $" con la suma de las líneas de servicio (Escenario A),
  // a menos que el usuario lo haya editado a mano (Escenario B / flete externo).
  useEffect(() => {
    if (surchargeTouched) return;
    const serviceTotal = items
      .filter((i) => i.isService && i.productId)
      .reduce((sum, i) => sum + i.costUsd * i.quantity * (1 - (i.discountPct || 0) / 100), 0);
    setSurchargeUsd(Math.round(serviceTotal * 100) / 100);
  }, [items, surchargeTouched]);
```

- [ ] **Step 4: Marcar "tocado" cuando el usuario edita el campo Recargo**

Reemplazar el `onChange` del input de Recargo (línea 1062):

```tsx
                  onChange={(e) => setSurchargeUsd(Number(e.target.value))}
```
por:
```tsx
                  onChange={(e) => { setSurchargeTouched(true); setSurchargeUsd(Number(e.target.value)); }}
```

- [ ] **Step 5: Verificar tipos/lint del web**

Run: `pnpm --filter @trinity/web lint`
Expected: sin errores nuevos en `purchases/new/page.tsx`.
> Si `lint` no existe o es muy lento, validar con `pnpm --filter @trinity/web exec tsc --noEmit` (typecheck).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/(dashboard)/purchases/new/page.tsx
git commit -m "feat: Session 61 - nueva compra: recargo no suma al total y se auto-rellena desde servicios"
```

---

## Task 6: Frontend — formulario "editar compra" (total sin recargo + auto-relleno)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx:453` (total), `:157-158`/`:264-265` (estado + carga), y agregar `useEffect` de auto-relleno.

- [ ] **Step 1: Quitar el recargo del total calculado**

Reemplazar la línea 453:

```ts
    const totalPrimario = subtotalAfterDiscount + totalIvaPrimario + surchargeUsd;
```
por:
```ts
    // El recargo NO afecta el total de la factura (solo el costo aterrizado)
    const totalPrimario = subtotalAfterDiscount + totalIvaPrimario;
```

- [ ] **Step 2: Agregar el flag "tocado"**

Después de la línea 158 (`const [surchargeDistribution, setSurchargeDistribution] = ...`), agregar:

```ts
  const [surchargeTouched, setSurchargeTouched] = useState(false);
```

- [ ] **Step 3: Preservar el recargo guardado al cargar la factura**

En el bloque que carga la factura existente, junto a la línea 264 (`setSurchargeUsd(bill.surchargeUsd || 0);`), marcar el recargo como "tocado" para NO sobreescribir el valor guardado:

```ts
        setSurchargeUsd(bill.surchargeUsd || 0);
        setSurchargeDistribution(bill.surchargeDistribution || 'PROPORTIONAL');
        setSurchargeTouched(true);
```

- [ ] **Step 4: Auto-rellenar desde servicios (igual que en "nueva")**

Agregar, junto a los demás efectos/cálculos del componente:

```ts
  // Auto-rellenar "Recargo $" con la suma de las líneas de servicio mientras no se edite a mano.
  useEffect(() => {
    if (surchargeTouched) return;
    const serviceTotal = items
      .filter((i) => i.isService && i.productId)
      .reduce((sum, i) => sum + i.costUsd * i.quantity * (1 - (i.discountPct || 0) / 100), 0);
    setSurchargeUsd(Math.round(serviceTotal * 100) / 100);
  }, [items, surchargeTouched]);
```

> Nota: como en la edición `surchargeTouched` arranca en `true` (Step 3), el efecto no pisa el valor guardado. Si el usuario quiere re-derivar el recargo desde los servicios, edita el campo manualmente.

- [ ] **Step 5: Marcar "tocado" en el onChange del input Recargo**

Buscar el input de Recargo (alrededor de la línea 1134) y reemplazar su `onChange`:

```tsx
                  onChange={(e) => setSurchargeUsd(Number(e.target.value))}
```
por:
```tsx
                  onChange={(e) => { setSurchargeTouched(true); setSurchargeUsd(Number(e.target.value)); }}
```

- [ ] **Step 6: Verificar tipos/lint del web**

Run: `pnpm --filter @trinity/web lint`
Expected: sin errores nuevos en `purchases/[id]/edit/page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(dashboard)/purchases/[id]/edit/page.tsx"
git commit -m "feat: Session 61 - editar compra: recargo no suma al total y se auto-rellena desde servicios"
```

---

## Task 7: Deploy, corrección de FC-00026 y verificación end-to-end

**Files:** ninguno (operación de datos + verificación). El deploy lo ejecuta el usuario (ver memoria de deploy).

- [ ] **Step 1: Pre-deploy checklist**

Run: `git status`
Expected: sin archivos `M`/`??` pendientes. Confirmar que están commiteados: schema + migración, `purchase-orders.service.ts`, ambas páginas del frontend.

- [ ] **Step 2: Deploy (lo hace el usuario)**

El usuario ejecuta:
```bash
ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"
```
Expected: `deploy.sh` aplica la migración (`prisma migrate`), genera el cliente, buildea API+Web y reinicia PM2 con health check OK.

- [ ] **Step 3: Verificar el estado actual de FC-00026 (antes de corregir)**

Run (consulta de solo lectura, vía SSH):
```bash
ssh root@134.209.220.233 'cd /opt/Trinity && RAW="$(grep "^DATABASE_URL=" packages/database/.env | cut -d= -f2- | sed "s/^\"//; s/\"$//")"; PGURL="${RAW%%\?*}"; psql "$PGURL" -P pager=off -x -c "SELECT number, \"subtotalUsd\", \"surchargeUsd\", \"totalUsd\", \"totalWithSurchargeUsd\", status FROM \"PurchaseOrder\" WHERE id = '"'"'cmql1pgav0152bqnj30t4j2qe'"'"';"'
```
Expected: todavía muestra `totalUsd = 545.47` (dato viejo, lo corregimos al re-guardar).

- [ ] **Step 4: Re-guardar FC-00026 para recomputar con la lógica nueva**

En la app: abrir `/purchases/cmql1pgav0152bqnj30t4j2qe`, entrar a **Editar**. Verificar que:
- El campo **Recargo $** muestra **17.21** (auto desde la línea "RECUPERACION DE GASTOS").
- El **Total** mostrado es **528.26** (ya NO 545.47).

Pulsar **Guardar**. Esto dispara `update()` con la lógica nueva (la factura sigue en `PENDING`, es editable).

- [ ] **Step 5: Verificar totales e items corregidos en BD**

Run:
```bash
ssh root@134.209.220.233 'cd /opt/Trinity && RAW="$(grep "^DATABASE_URL=" packages/database/.env | cut -d= -f2- | sed "s/^\"//; s/\"$//")"; PGURL="${RAW%%\?*}"; psql "$PGURL" -P pager=off -c "SELECT po.\"subtotalUsd\", po.\"surchargeUsd\", po.\"totalUsd\" FROM \"PurchaseOrder\" po WHERE po.id = '"'"'cmql1pgav0152bqnj30t4j2qe'"'"'; SELECT p.name, p.\"isService\", poi.\"netCostUsd\", poi.\"landedCostUsd\", poi.\"totalUsd\" FROM \"PurchaseOrderItem\" poi JOIN \"Product\" p ON p.id = poi.\"productId\" WHERE poi.\"purchaseOrderId\" = '"'"'cmql1pgav0152bqnj30t4j2qe'"'"' ORDER BY p.name;"'
```
Expected:
- Cabecera: `subtotalUsd = 528.26`, `surchargeUsd = 17.21`, `totalUsd = 528.26`.
- Items: CODO `netCostUsd=1.37`, `landedCostUsd≈1.42`, `totalUsd=41.10`; POCETA `netCostUsd=93.99`, `landedCostUsd≈97.16`, `totalUsd=469.95`; RECUP. GASTOS (servicio) `landedCostUsd=17.21` (= net, sin recargo), `totalUsd=17.21`.
- **Clave:** los `totalUsd` de línea NO cambiaron (factura intacta); solo subió `landedCostUsd`.

- [ ] **Step 6: Verificar Escenario B (recargo manual sin línea de servicio)**

En la app: crear una compra de prueba con 2 productos normales y escribir un **Recargo $** a mano (ej. 10). Verificar que:
- El **Total** = subtotal + IVA (NO incluye los 10).
- Al guardar, en BD los items tienen `landedCostUsd > netCostUsd` (repartido) pero `totalUsd` de línea intacto, y `totalUsd` de cabecera sin el recargo.
Luego eliminar la compra de prueba (o dejarla anulada).

- [ ] **Step 7: Verificar que al RECIBIR el costo/precio usa el costo aterrizado**

En una compra con recargo (puede ser la de prueba del Step 6 antes de borrarla, o FC-00026 si se decide procesar), pulsar **Recibir/Procesar** y verificar en BD que el `Product.costUsd` quedó en el costo aterrizado y que el `StockMovement` tipo `PURCHASE` registró `costUsd` = costo aterrizado:
```bash
# Sustituir <productId> por el id del producto recibido
ssh root@134.209.220.233 'cd /opt/Trinity && RAW="$(grep "^DATABASE_URL=" packages/database/.env | cut -d= -f2- | sed "s/^\"//; s/\"$//")"; PGURL="${RAW%%\?*}"; psql "$PGURL" -P pager=off -c "SELECT code, name, \"costUsd\", \"priceDetal\" FROM \"Product\" WHERE id = '"'"'<productId>'"'"';"'
```
Expected: `costUsd` = costo aterrizado (costo + recargo repartido); `priceDetal` recalculado en base a ese costo.

- [ ] **Step 8: Actualizar PROGRESS.md y PROJECT.md y commitear**

Documentar la sesión (rediseño del recargo) en `PROGRESS.md` y `PROJECT.md` según el formato del proyecto.
```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: Session 61 - rediseño del recargo en facturas de compra"
git push origin main
```

---

## Task 8 (OPCIONAL): Mostrar el costo aterrizado en la tabla de items

Nice-to-have para que el usuario vea el "costo c/recargo" por artículo antes de recibir. Si se implementa: agregar una columna/hint de solo lectura en la tabla de items de `new` y `edit` que muestre, por ítem no-servicio, `costo + (recargo repartido)` usando la misma fórmula del helper backend (proporcional/equitativo sobre la suma de no-servicios). No afecta datos ni la factura. Implementar solo si el usuario lo pide tras validar el flujo principal.

---

## Self-Review

- **Cobertura del spec:**
  - Regla 1 (factura idéntica) → Tasks 2, 3, 5, 6 (los `totalUsd` de línea y el total nunca cambian por el recargo). ✅
  - Regla 2 (recargo no suma al total) → Tasks 2 (backend) y 5/6 (frontend). ✅
  - Regla 3A (servicio auto→recargo) → Tasks 5/6 (auto-relleno). ✅
  - Regla 3B (recargo manual no afecta factura) → Tasks 2/5/6 + verificación Step 6. ✅
  - Regla 4 (proporcional/equitativo) → helper en Task 3 respeta `surchargeDistribution`. ✅
  - Regla 5 (costo aterrizado al recibir) → Task 4 + verificación Step 7. ✅
  - Corrección de FC-00026 → Task 7. ✅
- **Placeholders:** ninguno; todo el código está completo.
- **Consistencia de tipos:** el helper `applySurchargeLandedCost` espera objetos con `landedCostUsd`/`landedCostBs`, que se inicializan en el `.map` de items en `create` (Step 2) y `update` (Step 4) antes de llamarlo. El campo existe en Prisma tras la Task 1. `process` lee `item.landedCostUsd` (columna real). Frontend usa `i.isService`/`i.costUsd`/`i.quantity`/`i.discountPct`, todos presentes en la interfaz `FormItem`. Consistente. ✅
- **Riesgo a vigilar:** el redondeo `round2` por unidad puede dejar diferencias de centavos entre la suma de `landedCost` repartido y el `surchargeUsd` exacto (ej. 0.05·30 + 3.17·5 = 1.50 + 15.85 = 17.35 vs 17.21). Es esperable en reparto por unidad y NO afecta la factura (que queda intacta); solo el costo de inventario. Si el usuario exige que el reparto cuadre al centavo exacto, agregar un ajuste del residual al último ítem (mejora futura, no en este plan).
