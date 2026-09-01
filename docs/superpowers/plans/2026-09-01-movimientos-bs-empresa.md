# Movimientos en Bs por empresa (módulo divisas) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al módulo de divisas una sección propia de **Movimientos en Bs por empresa** (entradas/salidas con saldo corriente), hermana pero separada de la de dólares, con un **único saldo Bs** que también refleja el Bs gastado/recibido al comprar/vender divisas.

**Architecture:** Tabla nueva `TreasuryBsMovement` (movimientos Bs propios). El ledger Bs se arma por **fusión virtual** en el service: movimientos Bs propios + el `amountBs` de los movimientos de divisas como filas espejo de solo lectura (con signo corregido). El `summary()` recalcula el saldo Bs por empresa con la fórmula nueva. Frontend: pantalla nueva `/divisas/movimientos-bs` que espeja la de divisas sin dimensión banco.

**Tech Stack:** Prisma (PostgreSQL), NestJS, Next.js 14 App Router, Tailwind. Guard existente `@RequireModule('divisas')`.

**Spec:** `docs/superpowers/specs/2026-09-01-movimientos-bs-empresa-design.md`

**Contexto:** Finanzas arranca el módulo este mes **desde cero** (sin datos reales). No hay que migrar ni reconciliar; los datos actuales son de prueba.

**Verificación:** el repo **no tiene jest/tests** (0 archivos `.spec.ts`). El método del proyecto es **`tsc --noEmit` + prueba e2e en local** (API en :4000, Web en :3000, BD local `trebol_db`). El plan usa ese método más una prueba de humo por `curl` para la lógica de signo/saldo.

---

### Task 1: Prisma — modelo `TreasuryBsMovement` + migración

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (User línea ~365; TreasuryCompany líneas 2563-2571; tras TreasuryMovement línea ~2635)
- Create: `packages/database/prisma/migrations/20260901120000_treasury_bs_movement/migration.sql`

- [ ] **Step 1: Agregar la back-relation en el modelo User**

En `packages/database/prisma/schema.prisma`, después de la línea 365 (`treasuryMovements   TreasuryMovement[]  @relation("TreasuryMovementCreator")`), agregar:

```prisma
  treasuryBsMovements TreasuryBsMovement[] @relation("TreasuryBsMovementCreator")
```

- [ ] **Step 2: Agregar la relación en el modelo TreasuryCompany**

En el modelo `TreasuryCompany` (líneas 2563-2571), después de `bsLoads   TreasuryBsLoad[]`, agregar:

```prisma
  bsMovements TreasuryBsMovement[]
```

- [ ] **Step 3: Agregar el modelo nuevo tras TreasuryMovement**

En `packages/database/prisma/schema.prisma`, después del cierre del modelo `TreasuryMovement` (la llave `}` en la línea ~2635, tras los tres `@@index`), agregar:

```prisma
// Movimiento en Bs de una empresa del modulo de divisas (ledger propio, entradas/salidas).
// El saldo Bs por empresa = estos movimientos + el amountBs de los movimientos de divisas
// (signo corregido). Ver spec: docs/superpowers/specs/2026-09-01-movimientos-bs-empresa-design.md
model TreasuryBsMovement {
  id           String          @id @default(cuid())
  date         DateTime                              // fecha del movimiento
  companyId    String
  company      TreasuryCompany @relation(fields: [companyId], references: [id])
  type         String                                // 'ENTRADA' | 'SALIDA'
  amountBs     Float                                 // monto en Bs
  counterparty String?                               // de quien / a quien
  reference    String?                               // referencia libre
  description  String?                               // observaciones
  status       String          @default("CONFIRMADO") // 'CONFIRMADO' | 'PENDIENTE'
  createdById  String
  createdBy    User            @relation("TreasuryBsMovementCreator", fields: [createdById], references: [id])
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  @@index([companyId, date])
  @@index([date])
}
```

- [ ] **Step 4: Crear el archivo de migración (idempotente, con `IF NOT EXISTS`)**

Crear `packages/database/prisma/migrations/20260901120000_treasury_bs_movement/migration.sql` con:

```sql
-- CreateTable
CREATE TABLE IF NOT EXISTS "TreasuryBsMovement" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "counterparty" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADO',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TreasuryBsMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TreasuryBsMovement_companyId_date_idx" ON "TreasuryBsMovement"("companyId", "date");
CREATE INDEX IF NOT EXISTS "TreasuryBsMovement_date_idx" ON "TreasuryBsMovement"("date");

-- AddForeignKey (idempotente)
DO $$ BEGIN
  ALTER TABLE "TreasuryBsMovement" ADD CONSTRAINT "TreasuryBsMovement_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "TreasuryCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TreasuryBsMovement" ADD CONSTRAINT "TreasuryBsMovement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- [ ] **Step 5: Aplicar la migración y regenerar el cliente Prisma**

Run:
```bash
cd packages/database && npx prisma migrate deploy && npx prisma generate
```
Expected: `migrate deploy` reporta `1 migration ... applied` (o "No pending migrations" si ya se aplicó) y `generate` termina con `Generated Prisma Client`. Si se queja de `DATABASE_URL`, prefijar con el env local: `set -a; . ../../apps/api/.env; set +a;` antes del comando (la BD local es `trebol_db` en `localhost:5432`).

- [ ] **Step 6: Verificar que la tabla existe**

Run:
```bash
docker exec trinity-postgres-1 psql -U postgres -d trebol_db -c "\d \"TreasuryBsMovement\"" 2>&1 | head -20
```
Expected: muestra las columnas `id, date, companyId, type, amountBs, ...` y los índices.
(Si el usuario/BD difieren, usar los del `apps/api/.env`.)

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260901120000_treasury_bs_movement/
git commit -m "feat(divisas): modelo TreasuryBsMovement + migracion (movimientos Bs por empresa)"
```

---

### Task 2: Backend — DTOs de movimiento Bs

**Files:**
- Create: `apps/api/src/modules/divisas/dto/create-bs-movement.dto.ts`
- Create: `apps/api/src/modules/divisas/dto/query-bs-movements.dto.ts`

- [ ] **Step 1: Crear `create-bs-movement.dto.ts`**

```typescript
import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsPositive,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateBsMovementDto {
  @IsDateString()
  date: string;

  @IsString()
  companyId: string;

  @IsIn(['ENTRADA', 'SALIDA'])
  type: string;

  @IsNumber()
  @IsPositive()
  amountBs: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterparty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['CONFIRMADO', 'PENDIENTE'])
  status?: string;
}
```

- [ ] **Step 2: Crear `query-bs-movements.dto.ts`**

```typescript
import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class QueryBsMovementsDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsIn(['ENTRADA', 'SALIDA'])
  type?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/divisas/dto/create-bs-movement.dto.ts apps/api/src/modules/divisas/dto/query-bs-movements.dto.ts
git commit -m "feat(divisas): DTOs de movimiento Bs"
```

---

### Task 3: Backend — Service: CRUD Bs + fusión + `summary()` recalculado

**Files:**
- Modify: `apps/api/src/modules/divisas/divisas.service.ts`

- [ ] **Step 1: Importar los DTOs nuevos**

En `apps/api/src/modules/divisas/divisas.service.ts`, después de la línea 6 (`import { QueryMovementsDto } from './dto/query-movements.dto';`), agregar:

```typescript
import { CreateBsMovementDto } from './dto/create-bs-movement.dto';
import { QueryBsMovementsDto } from './dto/query-bs-movements.dto';
```

- [ ] **Step 2: Reemplazar `summary()` para el nuevo saldo Bs**

Reemplazar TODO el método `summary()` (líneas 140-201, desde `async summary() {` hasta su `}`) por:

```typescript
  async summary() {
    const [companies, banks, movements, bsMovements] = await Promise.all([
      this.prisma.treasuryCompany.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.treasuryBank.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.treasuryMovement.findMany({
        select: { companyId: true, bankId: true, type: true, amountUsd: true, amountBs: true, status: true },
      }),
      this.prisma.treasuryBsMovement.findMany({
        select: { companyId: true, type: true, amountBs: true, status: true },
      }),
    ]);

    type Agg = { disp: number; trans: number };
    const byCompany = new Map<string, Agg>();
    const byBank = new Map<string, Agg>();
    const bsByCompany = new Map<string, number>(); // saldo Bs disponible (solo CONFIRMADO)
    const bump = (m: Map<string, Agg>, key: string, status: string, delta: number) => {
      const e = m.get(key) || { disp: 0, trans: 0 };
      if (status === 'PENDIENTE') e.trans += delta;
      else e.disp += delta;
      m.set(key, e);
    };
    const bumpBs = (companyId: string, delta: number) =>
      bsByCompany.set(companyId, (bsByCompany.get(companyId) || 0) + delta);

    for (const mv of movements) {
      const delta = signed(mv.type, mv.amountUsd);
      bump(byCompany, mv.companyId, mv.status, delta);
      bump(byBank, mv.bankId, mv.status, delta);
      // Bs: comprar divisas (ENTRADA) GASTA Bs; vender (SALIDA) RECIBE Bs. Solo CONFIRMADO.
      // signed(ENTRADA)=+amt => queremos -amt (salida); signed(SALIDA)=-amt => queremos +amt.
      if (mv.amountBs && mv.status !== 'PENDIENTE') bumpBs(mv.companyId, -signed(mv.type, mv.amountBs));
    }
    for (const bm of bsMovements) {
      if (bm.status !== 'PENDIENTE') bumpBs(bm.companyId, signed(bm.type, bm.amountBs));
    }

    const mapRow = (id: string, name: string, isActive: boolean, agg?: Agg) => {
      const disp = agg?.disp || 0;
      const trans = agg?.trans || 0;
      return {
        id,
        name,
        isActive,
        disponibleUsd: round2(disp),
        transitoUsd: round2(trans),
        balanceUsd: round2(disp), // legacy = disponible
      };
    };

    const companyRows = companies.map((c) => {
      const row = mapRow(c.id, c.name, c.isActive, byCompany.get(c.id));
      const bsBalance = round2(bsByCompany.get(c.id) || 0);
      return { ...row, bsBalance };
    });
    const bankRows = banks.map((b) => mapRow(b.id, b.name, b.isActive, byBank.get(b.id)));

    const totalDisponibleUsd = round2(companyRows.reduce((s, r) => s + r.disponibleUsd, 0));
    const totalTransitoUsd = round2(companyRows.reduce((s, r) => s + r.transitoUsd, 0));
    const totalBs = round2(companyRows.reduce((s, r) => s + r.bsBalance, 0));

    return {
      companies: companyRows,
      banks: bankRows,
      totalDisponibleUsd,
      totalTransitoUsd,
      totalBs,
      totalUsd: totalDisponibleUsd, // legacy
    };
  }
```

- [ ] **Step 3: Agregar los métodos de movimientos Bs al final del service**

En `apps/api/src/modules/divisas/divisas.service.ts`, antes de la última llave `}` de la clase (línea 309), agregar:

```typescript

  // ── Movimientos Bs (ledger propio + fusión con Bs de divisas) ────────────
  private readonly BS_MOVEMENT_INCLUDE = {
    company: { select: { id: true, name: true } },
    createdBy: { select: { name: true } },
  };

  /**
   * Ledger Bs por empresa: fusiona los TreasuryBsMovement propios (source 'BS',
   * editables) con el amountBs de los TreasuryMovement de divisas (source 'DIVISA',
   * solo lectura, con signo corregido: divisa ENTRADA = salida de Bs, divisa SALIDA
   * = entrada de Bs). Devuelve saldo corriente cuando se filtra por UNA empresa sin tipo.
   */
  async findBsMovements(q: QueryBsMovementsDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const withRunning = !!q.companyId && !q.type;

    const bsWhere: any = {};
    if (q.companyId) bsWhere.companyId = q.companyId;
    const divWhere: any = { amountBs: { not: null } };
    if (q.companyId) divWhere.companyId = q.companyId;

    const [bsRows, divRows] = await Promise.all([
      this.prisma.treasuryBsMovement.findMany({ where: bsWhere, include: this.BS_MOVEMENT_INCLUDE }),
      this.prisma.treasuryMovement.findMany({ where: divWhere, include: this.BS_MOVEMENT_INCLUDE }),
    ]);

    const normBs = bsRows.map((m) => ({
      id: m.id,
      date: m.date,
      type: m.type,
      amountBs: m.amountBs,
      status: m.status,
      counterparty: m.counterparty,
      reference: m.reference,
      description: m.description,
      company: (m as any).company,
      createdBy: (m as any).createdBy,
      source: 'BS' as const,
      refMovementId: null as string | null,
      createdAt: m.createdAt,
    }));
    const normDiv = divRows.map((m) => ({
      id: m.id,
      date: m.date,
      // divisa ENTRADA (compra USD, paga Bs) => SALIDA de Bs; divisa SALIDA => ENTRADA de Bs
      type: m.type === 'ENTRADA' ? 'SALIDA' : 'ENTRADA',
      amountBs: m.amountBs as number,
      status: m.status,
      counterparty: m.counterparty,
      reference: m.reference,
      description: m.description,
      company: (m as any).company,
      createdBy: (m as any).createdBy,
      source: 'DIVISA' as const,
      refMovementId: m.id,
      createdAt: m.createdAt,
    }));

    let all = [...normBs, ...normDiv];
    if (q.type) all = all.filter((r) => r.type === q.type);
    all.sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
    );

    if (withRunning) {
      let bal = 0;
      all = all.map((r) => {
        if (r.status !== 'PENDIENTE') bal += signed(r.type, r.amountBs);
        return { ...r, runningBalanceBs: round2(bal) } as any;
      });
    }

    let rows = all;
    if (from) rows = rows.filter((r) => r.date >= from);
    if (to) rows = rows.filter((r) => r.date <= to);
    rows = rows.slice().reverse(); // más recientes primero
    return { movements: rows, hasRunningBalance: withRunning };
  }

  async createBsMovement(dto: CreateBsMovementDto, userId: string) {
    const company = await this.prisma.treasuryCompany.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new BadRequestException('Empresa no válida');
    return this.prisma.treasuryBsMovement.create({
      data: {
        date: new Date(dto.date),
        companyId: dto.companyId,
        type: dto.type,
        amountBs: round2(dto.amountBs),
        counterparty: dto.counterparty?.trim() || null,
        reference: dto.reference?.trim() || null,
        description: dto.description?.trim() || null,
        status: dto.status || 'CONFIRMADO',
        createdById: userId,
      },
      include: this.BS_MOVEMENT_INCLUDE,
    });
  }

  async updateBsMovement(id: string, dto: Partial<CreateBsMovementDto>) {
    const existing = await this.prisma.treasuryBsMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento Bs no encontrado');
    const data: any = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.companyId !== undefined) data.companyId = dto.companyId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amountBs !== undefined) data.amountBs = round2(dto.amountBs);
    if (dto.counterparty !== undefined) data.counterparty = dto.counterparty?.trim() || null;
    if (dto.reference !== undefined) data.reference = dto.reference?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    return this.prisma.treasuryBsMovement.update({ where: { id }, data, include: this.BS_MOVEMENT_INCLUDE });
  }

  async deleteBsMovement(id: string) {
    const existing = await this.prisma.treasuryBsMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento Bs no encontrado');
    await this.prisma.treasuryBsMovement.delete({ where: { id } });
    return { ok: true };
  }
```

- [ ] **Step 4: Typecheck del API**

Run:
```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: sin salida (0 errores). Si falla por tipos de Prisma (`treasuryBsMovement` no existe), volver a correr `cd packages/database && npx prisma generate` (Task 1 Step 5) y repetir.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/divisas/divisas.service.ts
git commit -m "feat(divisas): service de movimientos Bs (fusion + saldo por empresa)"
```

---

### Task 4: Backend — Controller: endpoints de movimientos Bs

**Files:**
- Modify: `apps/api/src/modules/divisas/divisas.controller.ts`

- [ ] **Step 1: Importar los DTOs nuevos**

En `apps/api/src/modules/divisas/divisas.controller.ts`, después de la línea 11 (`import { QueryMovementsDto } from './dto/query-movements.dto';`), agregar:

```typescript
import { CreateBsMovementDto } from './dto/create-bs-movement.dto';
import { QueryBsMovementsDto } from './dto/query-bs-movements.dto';
```

- [ ] **Step 2: Agregar los 4 endpoints antes de la última llave de la clase**

En `apps/api/src/modules/divisas/divisas.controller.ts`, después del bloque de `deleteMovement` (líneas 107-110) y antes de la llave `}` que cierra la clase (línea 111), agregar:

```typescript

  // ── Movimientos Bs ──
  @Get('bs-movements')
  findBsMovements(@Query() query: QueryBsMovementsDto) {
    return this.service.findBsMovements(query);
  }

  @Post('bs-movements')
  createBsMovement(@Body() dto: CreateBsMovementDto, @CurrentUser() user: { id: string }) {
    return this.service.createBsMovement(dto, user.id);
  }

  @Patch('bs-movements/:id')
  updateBsMovement(@Param('id') id: string, @Body() dto: Partial<CreateBsMovementDto>) {
    return this.service.updateBsMovement(id, dto);
  }

  @Delete('bs-movements/:id')
  deleteBsMovement(@Param('id') id: string) {
    return this.service.deleteBsMovement(id);
  }
```

- [ ] **Step 3: Typecheck del API**

Run:
```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```
Expected: sin salida (0 errores).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/divisas/divisas.controller.ts
git commit -m "feat(divisas): endpoints REST de movimientos Bs"
```

---

### Task 5: Prueba de humo del backend (curl) — CRUD, fusión y signo

Verifica la lógica de signo/saldo end-to-end contra la BD local. El API dev debe estar corriendo en `:4000` (si no: desde `apps/api`, `npm run dev`).

- [ ] **Step 1: Obtener un token JWT y una empresa de divisas**

Run (ajustar email/clave a un ADMIN local válido; son las credenciales de la grande):
```bash
TOKEN=$(curl -s http://localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"legoadh@gmail.com","password":"REEMPLAZAR"}' | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).access_token)}catch{console.log('')}})")
echo "token: ${TOKEN:0:20}..."
CO=$(curl -s "http://localhost:4000/divisas/companies?all=true" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const a=JSON.parse(d);console.log(a[0]?.id||'')})")
echo "companyId: $CO"
```
Expected: imprime un token y un `companyId` no vacío. (Si no hay empresas, crear una: `curl -s -X POST http://localhost:4000/divisas/companies -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Prueba Bs"}'` y volver a leer.)

- [ ] **Step 2: Crear una ENTRADA de Bs y verificar el saldo**

Run:
```bash
curl -s -X POST http://localhost:4000/divisas/bs-movements -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"date\":\"2026-09-01\",\"companyId\":\"$CO\",\"type\":\"ENTRADA\",\"amountBs\":1000}" | head -c 300; echo
curl -s "http://localhost:4000/divisas/bs-movements?companyId=$CO" -H "Authorization: Bearer $TOKEN" \
  | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('filas:',r.movements.length,'saldo:',r.movements[0]?.runningBalanceBs)})"
```
Expected: crea la fila; el listado muestra `filas: 1 saldo: 1000`.

- [ ] **Step 3: Crear un movimiento de DIVISAS tipo ENTRADA con amountBs y verificar el signo**

Necesita un banco de divisas. Run:
```bash
BK=$(curl -s "http://localhost:4000/divisas/banks?all=true" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const a=JSON.parse(d);console.log(a[0]?.id||'')})")
[ -z "$BK" ] && BK=$(curl -s -X POST http://localhost:4000/divisas/banks -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"Banco Prueba"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).id))")
curl -s -X POST http://localhost:4000/divisas/movements -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"date\":\"2026-09-01\",\"companyId\":\"$CO\",\"bankId\":\"$BK\",\"type\":\"ENTRADA\",\"amountUsd\":10,\"amountBs\":400}" | head -c 200; echo
curl -s "http://localhost:4000/divisas/bs-movements?companyId=$CO" -H "Authorization: Bearer $TOKEN" \
  | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('saldo Bs:',r.movements[0]?.runningBalanceBs);r.movements.forEach(m=>console.log(' -',m.source,m.type,m.amountBs))})"
```
Expected: la compra de divisas (ENTRADA, paga Bs 400) aparece como fila `DIVISA SALIDA 400` (solo lectura) y el **saldo Bs baja a 600** (`1000 − 400`). Confirma el signo correcto.

- [ ] **Step 4: Verificar el `summary()`**

Run:
```bash
curl -s "http://localhost:4000/divisas/summary" -H "Authorization: Bearer $TOKEN" \
  | node -e "process.stdin.on('data',d=>{const s=JSON.parse(d);const c=s.companies.find(x=>x.id==='$CO');console.log('bsBalance empresa:',c?.bsBalance,'totalBs:',s.totalBs)})"
```
Expected: `bsBalance empresa: 600` (coincide con el saldo corriente del ledger).

- [ ] **Step 5: Limpiar los datos de prueba**

Run (borra el movimiento de divisas y el de Bs creados; toma los IDs del listado):
```bash
curl -s "http://localhost:4000/divisas/bs-movements?companyId=$CO" -H "Authorization: Bearer $TOKEN" \
  | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);r.movements.forEach(m=>console.log(m.source,m.id))})"
```
Luego, para cada fila `BS`, `curl -s -X DELETE http://localhost:4000/divisas/bs-movements/<id> -H "Authorization: Bearer $TOKEN"`; para cada fila `DIVISA`, `curl -s -X DELETE http://localhost:4000/divisas/movements/<id> -H "Authorization: Bearer $TOKEN"`.
Expected: `{"ok":true}` en cada borrado. (No hay commit en esta tarea; es verificación.)

---

### Task 6: Frontend — pantalla `/divisas/movimientos-bs`

**Files:**
- Create: `apps/web/src/app/(dashboard)/divisas/movimientos-bs/page.tsx`

- [ ] **Step 1: Crear la página completa**

Crear `apps/web/src/app/(dashboard)/divisas/movimientos-bs/page.tsx` con:

```tsx
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil, Trash2, X, ArrowDownCircle, ArrowUpCircle, Filter, CheckCircle, RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import MoneyInput from '@/components/money-input';

interface Catalog {
  id: string;
  name: string;
  isActive: boolean;
}
interface BsMovement {
  id: string;
  date: string;
  type: string;
  amountBs: number;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  status: string;
  company: { id: string; name: string };
  source: 'BS' | 'DIVISA';
  refMovementId: string | null;
  createdBy?: { name: string };
  runningBalanceBs?: number;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const todayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const emptyForm = () => ({
  id: '',
  date: todayStr(),
  companyId: '',
  type: 'ENTRADA',
  amountBs: '',
  counterparty: '',
  reference: '',
  description: '',
  status: 'CONFIRMADO',
});

function MovimientosBsInner() {
  const search = useSearchParams();
  const [companies, setCompanies] = useState<Catalog[]>([]);
  const [movements, setMovements] = useState<BsMovement[]>([]);
  const [hasRunning, setHasRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [fCompany, setFCompany] = useState(search.get('companyId') || '');
  const [fType, setFType] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const [modalOpen, setModalOpen] = useState(search.get('new') === '1');
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Movimientos Bs | Trinity ERP';
  }, []);

  const toast = (text: string, ok = true) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadCatalogs = useCallback(async () => {
    const c = await fetch('/api/proxy/divisas/companies?all=true').then((r) => r.json());
    setCompanies(Array.isArray(c) ? c : []);
  }, []);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (fCompany) p.set('companyId', fCompany);
      if (fType) p.set('type', fType);
      if (fFrom) p.set('from', fFrom);
      if (fTo) p.set('to', fTo);
      const res = await fetch(`/api/proxy/divisas/bs-movements?${p.toString()}`);
      const data = await res.json();
      setMovements(data.movements || []);
      setHasRunning(!!data.hasRunningBalance);
    } finally {
      setLoading(false);
    }
  }, [fCompany, fType, fFrom, fTo]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);
  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const openNew = () => {
    setForm({ ...emptyForm(), companyId: fCompany || '' });
    setModalOpen(true);
  };
  const openEdit = (m: BsMovement) => {
    setForm({
      id: m.id,
      date: m.date.slice(0, 10),
      companyId: m.company.id,
      type: m.type,
      amountBs: String(m.amountBs),
      counterparty: m.counterparty || '',
      reference: m.reference || '',
      description: m.description || '',
      status: m.status,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.companyId || !form.amountBs || Number(form.amountBs) <= 0) {
      toast('Completa empresa y monto Bs (> 0)', false);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        companyId: form.companyId,
        type: form.type,
        amountBs: Number(form.amountBs),
        counterparty: form.counterparty.trim() || undefined,
        reference: form.reference.trim() || undefined,
        description: form.description.trim() || undefined,
        status: form.status,
      };
      const res = await fetch(
        form.id ? `/api/proxy/divisas/bs-movements/${form.id}` : '/api/proxy/divisas/bs-movements',
        {
          method: form.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        setModalOpen(false);
        toast(form.id ? 'Movimiento actualizado' : 'Movimiento registrado');
        loadMovements();
      } else {
        const e = await res.json().catch(() => ({}));
        toast(e.message || 'Error al guardar', false);
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmMovement = async (m: BsMovement) => {
    if (!confirm(`¿Confirmar el movimiento de Bs ${fmt(m.amountBs)} (${m.company.name})?\n\nPasará de "Tránsito" a "Disponible".`)) return;
    const res = await fetch(`/api/proxy/divisas/bs-movements/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMADO' }),
    });
    if (res.ok) {
      toast('Movimiento confirmado');
      loadMovements();
    } else {
      toast('Error al confirmar', false);
    }
  };

  const remove = async (m: BsMovement) => {
    if (!confirm(`¿Eliminar el movimiento de Bs ${fmt(m.amountBs)} (${m.company.name})?`)) return;
    const res = await fetch(`/api/proxy/divisas/bs-movements/${m.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Movimiento eliminado');
      loadMovements();
    } else {
      toast('Error al eliminar', false);
    }
  };

  const activeCompanies = companies.filter((c) => c.isActive);
  const colSpan = hasRunning ? 7 : 6;

  const singleDimName = fCompany ? companies.find((c) => c.id === fCompany)?.name : null;
  const currentBalance = hasRunning && movements.length ? movements[0].runningBalanceBs || 0 : 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Movimientos en Bs</h1>
          <p className="text-sm text-slate-400">Entradas y salidas de bolívares por empresa. Las compras/ventas de divisas afectan este saldo automáticamente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/divisas/movimientos" className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-2 rounded-lg text-sm font-medium">
            Ver movimientos USD
          </Link>
          <button
            onClick={() => { loadCatalogs(); loadMovements(); }}
            disabled={loading}
            title="Refrescar"
            className="p-2 rounded-lg bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Registrar movimiento Bs
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${message.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2">
        <Filter size={16} className="text-slate-400" />
        <select value={fCompany} onChange={(e) => setFCompany(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-sm">
          <option value="">Todas las empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-sm">
          <option value="">Entradas y salidas</option>
          <option value="ENTRADA">Solo entradas</option>
          <option value="SALIDA">Solo salidas</option>
        </select>
        <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 text-sm" />
        <span className="text-slate-500 text-sm">a</span>
        <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 text-sm" />
        {(fCompany || fType || fFrom || fTo) && (
          <button onClick={() => { setFCompany(''); setFType(''); setFFrom(''); setFTo(''); }} className="text-slate-400 hover:text-slate-200 text-sm ml-1">
            Limpiar
          </button>
        )}
      </div>

      {hasRunning && singleDimName && (
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Empresa</div>
            <div className="text-lg font-semibold text-slate-100">{singleDimName}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Saldo Bs actual</div>
            <div className={`text-2xl font-bold tabular-nums ${currentBalance < 0 ? 'text-red-400' : 'text-sky-400'}`}>
              Bs {fmt(currentBalance)}
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50 text-left">
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Fecha</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Empresa</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Detalle</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider text-right">Monto Bs</th>
                {hasRunning && <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider text-right">Saldo</th>}
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider">Estatus</th>
                <th className="px-3 py-3 text-xs text-slate-400 font-medium uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500 text-sm">Cargando…</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500 text-sm">Sin movimientos para el filtro actual.</td></tr>
              ) : (
                movements.map((m) => {
                  const isIn = m.type === 'ENTRADA';
                  const isDivisa = m.source === 'DIVISA';
                  return (
                    <tr key={`${m.source}-${m.id}`} className="border-b border-slate-700/30 hover:bg-slate-800/40 align-top">
                      <td className="px-3 py-3 text-sm text-slate-300 whitespace-nowrap">{fmtDate(m.date)}</td>
                      <td className="px-3 py-3 text-sm text-slate-200">{m.company.name}</td>
                      <td className="px-3 py-3 text-xs text-slate-400 max-w-[240px]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {isDivisa && (
                            <span className="uppercase text-[10px] tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300/90">Divisa</span>
                          )}
                          {m.counterparty && <span className="text-slate-300">{m.counterparty}</span>}
                          {m.reference && <span className="text-slate-500">#{m.reference}</span>}
                        </div>
                        {m.description && <div className="text-slate-500 mt-0.5">{m.description}</div>}
                        {isDivisa && (
                          <Link href={`/divisas/movimientos?companyId=${m.company.id}`} className="inline-flex items-center gap-1 text-[11px] text-sky-400/80 hover:text-sky-300 mt-0.5">
                            <ExternalLink size={11} /> Movimiento de divisas
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-sm font-mono font-semibold tabular-nums ${isIn ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isIn ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                          {isIn ? '+' : '−'}Bs {fmt(m.amountBs)}
                        </span>
                      </td>
                      {hasRunning && (
                        <td className="px-3 py-3 text-right text-sm font-mono tabular-nums text-slate-300 whitespace-nowrap">Bs {fmt(m.runningBalanceBs || 0)}</td>
                      )}
                      <td className="px-3 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${m.status === 'CONFIRMADO' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                          {m.status === 'CONFIRMADO' ? 'Confirmado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {isDivisa ? (
                          <span className="text-[11px] text-slate-600 italic pr-1">solo lectura</span>
                        ) : (
                          <>
                            {m.status === 'PENDIENTE' && (
                              <button onClick={() => confirmMovement(m)} className="text-emerald-400 hover:text-emerald-300 p-1" title="Confirmar (pasar a Disponible)">
                                <CheckCircle size={15} />
                              </button>
                            )}
                            <button onClick={() => openEdit(m)} className="text-slate-400 hover:text-blue-300 p-1" title="Editar">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => remove(m)} className="text-slate-400 hover:text-red-300 p-1" title="Eliminar">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal alta/edición */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 sticky top-0 bg-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">{form.id ? 'Editar movimiento Bs' : 'Registrar movimiento Bs'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ ...form, type: 'ENTRADA' })} className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border ${form.type === 'ENTRADA' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'border-slate-600 text-slate-400 hover:bg-slate-700/40'}`}>
                  <ArrowDownCircle size={16} /> Entrada
                </button>
                <button onClick={() => setForm({ ...form, type: 'SALIDA' })} className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border ${form.type === 'SALIDA' ? 'bg-red-600/20 border-red-500 text-red-300' : 'border-slate-600 text-slate-400 hover:bg-slate-700/40'}`}>
                  <ArrowUpCircle size={16} /> Salida
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Monto Bs</label>
                  <MoneyInput thousands value={form.amountBs === '' ? 0 : Number(form.amountBs)} onValueChange={(n) => setForm({ ...form, amountBs: n ? String(n) : '' })} placeholder="0,00" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Empresa</label>
                  <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm">
                    <option value="">Seleccionar…</option>
                    {activeCompanies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Estatus</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm">
                    <option value="CONFIRMADO">Confirmado</option>
                    <option value="PENDIENTE">Pendiente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Contraparte (de quién / a quién)</label>
                <input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder="Banco, persona, concepto…" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Referencia</label>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Nº de operación (opcional)" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Descripción / observaciones</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700/60 sticky bottom-0 bg-slate-800">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
                {saving ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MovimientosBsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500 text-sm">Cargando…</div>}>
      <MovimientosBsInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Typecheck del Web**

Run:
```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```
Expected: sin salida (0 errores).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/divisas/movimientos-bs/page.tsx"
git commit -m "feat(divisas): pantalla de movimientos Bs por empresa"
```

---

### Task 7: Frontend — accesos desde el resumen y la pantalla USD

**Files:**
- Modify: `apps/web/src/app/(dashboard)/divisas/page.tsx` (bloque de botones, líneas 127-148)
- Modify: `apps/web/src/app/(dashboard)/divisas/movimientos/page.tsx` (encabezado de acciones, líneas 234-249)

- [ ] **Step 1: Agregar botón "Movimientos Bs" en el resumen**

En `apps/web/src/app/(dashboard)/divisas/page.tsx`, dentro del `<div className="flex gap-2">` (líneas 127-148), después del `<Link href="/divisas/movimientos" ...>Ver movimientos</Link>` (que cierra en la línea 147), agregar:

```tsx
          <Link
            href="/divisas/movimientos-bs"
            className="inline-flex items-center gap-1.5 bg-sky-700 hover:bg-sky-600 text-slate-100 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <ArrowLeftRight size={16} /> Movimientos Bs
          </Link>
```

(El icono `ArrowLeftRight` ya está importado en la línea 5.)

- [ ] **Step 2: Agregar enlace cruzado en la pantalla de movimientos USD**

En `apps/web/src/app/(dashboard)/divisas/movimientos/page.tsx`, dentro del `<div className="flex items-center gap-2">` del encabezado (líneas 234-249), antes del botón de refrescar (línea 235, `<button onClick={() => { loadCatalogs(); loadMovements(); }}`), agregar:

```tsx
          <a
            href="/divisas/movimientos-bs"
            className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-2 rounded-lg text-sm font-medium"
          >
            Ver movimientos Bs
          </a>
```

- [ ] **Step 3: Typecheck del Web**

Run:
```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```
Expected: sin salida (0 errores).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/divisas/page.tsx" "apps/web/src/app/(dashboard)/divisas/movimientos/page.tsx"
git commit -m "feat(divisas): accesos a Movimientos Bs desde resumen y pantalla USD"
```

---

### Task 8: Verificación e2e en local (UI)

Con API (:4000) y Web (:3000) corriendo y sesión iniciada en el navegador.

- [ ] **Step 1: Navegar y crear un movimiento Bs**

1. Ir a `http://localhost:3000/divisas` → clic en **"Movimientos Bs"**.
2. **Registrar movimiento Bs**: Entrada, empresa X, Bs 1.000, Confirmado → Registrar.
3. Filtrar por esa empresa → aparece la fila y la tarjeta **"Saldo Bs actual" = Bs 1.000,00**.

Expected: la fila se ve con "+Bs 1.000,00", estatus Confirmado, y el saldo corriente correcto.

- [ ] **Step 2: Verificar la fila espejo de divisas (solo lectura) y el signo**

1. Ir a `/divisas/movimientos` (USD) → Registrar un movimiento **ENTRADA** de la misma empresa con "Monto Bs (descuenta de la empresa)" = 400.
2. Volver a **Movimientos Bs**, filtrar por la empresa.

Expected: aparece una fila con badge **"Divisa"**, tipo **salida** ("−Bs 400,00"), marcada **"solo lectura"** con enlace "Movimiento de divisas", y el **saldo baja a Bs 600,00**. En `/divisas` el panel "Saldo por empresa" muestra **Bs 600,00** para esa empresa.

- [ ] **Step 3: Editar y eliminar un movimiento Bs propio**

Editar el monto de la entrada Bs (p.ej. a 1.200) → el saldo recalcula (Bs 800). Eliminarlo → desaparece y el saldo vuelve a −400 (solo queda la salida de divisas). Confirmar que **no** se puede editar/eliminar la fila "Divisa" desde aquí.

Expected: edición/eliminación solo sobre filas propias; saldo consistente.

- [ ] **Step 4: Limpiar datos de prueba**

Eliminar el movimiento de divisas de prueba desde `/divisas/movimientos` y cualquier movimiento Bs propio restante desde `/divisas/movimientos-bs`.

Expected: empresa sin movimientos, saldo Bs 0,00. (Sin commit; es verificación.)

---

### Task 9: PROGRESS.md, commit y push

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Agregar entrada de sesión en PROGRESS.md**

En `PROGRESS.md`, insertar después de la línea del título (`# Trinity ERP — Progreso`, línea 1) — o encima de la sesión más reciente — un bloque:

```markdown
## 🗓️ Sesión 2026-09-01 — Divisas: sección de Movimientos en Bs por empresa

> ### ⚠️ SIN DESPLEGAR. Módulo aislado (`divisas`), aditivo, **con migración** `20260901120000_treasury_bs_movement` (`CREATE TABLE IF NOT EXISTS`). Finanzas arranca de cero este mes (sin datos reales). Probado e2e en local.

- **feat(divisas): ledger de Movimientos en Bs por empresa** — nueva tabla `TreasuryBsMovement` (entradas/salidas de Bs por empresa, sin banco). El ledger Bs se arma por **fusión virtual**: movimientos Bs propios (editables) + el `amountBs` de los movimientos de divisas como **filas espejo de solo lectura** con signo corregido (divisa ENTRADA = salida de Bs; divisa SALIDA = entrada de Bs). **Un solo saldo Bs por empresa**. `summary()` recalculado (reemplaza `cargas − amountBs`, que sumaba sin signo). Pantalla nueva `/divisas/movimientos-bs` (espeja la de USD, con saldo corriente al filtrar una empresa) + accesos cruzados desde el resumen y la pantalla USD. Las "Cargas de Bs" (`TreasuryBsLoad`) quedan obsoletas (no se migran; eran de prueba).
```

- [ ] **Step 2: Commit y push**

```bash
git add PROGRESS.md
git commit -m "docs: Session 2026-09-01 - Movimientos Bs por empresa (modulo divisas), sin desplegar"
git push origin main
```
Expected: push OK a `main`.

- [ ] **Step 3: Nota de deploy (no ejecutar aquí)**

El deploy lo hace Diego. Al desplegar en la **grande**: `ssh root@134.209.220.233 "cd /opt/Trinity && git pull origin main && bash deploy.sh"` (aplica la migración `20260901120000_treasury_bs_movement`). Verificar `/health` HTTP 200 después.

---

## Notas de cierre

- **Fuera de alcance (v1):** banco/ubicación para Bs, exportar a Excel, traslados de Bs entre empresas, borrar físicamente `TreasuryBsLoad`.
- **Signo (clave):** un movimiento de divisas **ENTRADA** (compra USD, paga Bs) resta Bs; **SALIDA** (vende USD, recibe Bs) suma Bs. Implementado como `-signed(mv.type, mv.amountBs)` en `summary()` y como remapeo de `type` en `findBsMovements`.
- **Solo `CONFIRMADO`** cuenta al saldo Bs disponible (los `PENDIENTE` son tránsito), igual que el USD.
