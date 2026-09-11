# Módulo de Bancos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un módulo de bancos (cuentas bancarias multi-moneda + libro banco con movimientos automáticos y manuales + conciliación por check-off) para Trinity ERP.

**Architecture:** Módulo NestJS autónomo (espejo de `divisas`) con dos tablas Prisma (`BankAccount`, `BankMovement`) y un campo nuevo `PaymentMethod.bankAccountId`. Los movimientos automáticos se generan vía un helper central `writeBankMovement(tx, input)` (espejo de `writeCashLedger`) enganchado junto a cada escritura del cash ledger existente (POS `pay()`, recibos `post()`, edición de método `updatePaymentMethods()`, gastos, anticipos). Opt-in por empresa con `CompanyConfig.bancosEnabled` (gatea los enganches automáticos) y acceso por rol con el módulo `'bancos'` (gatea API + menú). Front-end espeja las páginas de `divisas`.

**Tech Stack:** NestJS + Prisma (PostgreSQL, tipos `Float` para dinero), Next.js (App Router) + Tailwind, lucide-react.

**Verificación:** El repo NO tiene harness de tests para estos módulos. Cada tarea se verifica con typecheck (`tsc --noEmit` — NO usar `nest build`/`next build` con el dev encendido, corrompe el dist/.next) y verificación manual por curl/UI. Commits frecuentes.

**Convenciones del repo a respetar:**
- Todo campo monetario USD tiene su equivalente Bs guardado (regla del proyecto). `Float`, no `Decimal`.
- Fechas de negocio: usar `apps/api/src/common/timezone.ts` (`caracasDayStart/End`) para rangos sobre TIMESTAMP; nunca `setUTCHours`.
- Migraciones idempotentes: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
- `document.title` con patrón `'... | Trinity ERP'` en cada página nueva.
- Operaciones multi-tabla en transacción Prisma.

---

## FASE 1 — Modelo de datos, catálogo de cuentas, gating y resumen

Al terminar la Fase 1 existe un módulo funcional de **cuentas bancarias** (CRUD), el campo `bankAccountId` en métodos de pago, el menú, y la página de resumen — SIN enganches automáticos todavía (saldo = solo saldo inicial + movimientos manuales que aún no se crean). Es un incremento desplegable e inofensivo.

### Task 1: Modelos Prisma `BankAccount` y `BankMovement` + campo en `PaymentMethod` y `CompanyConfig`

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Agregar los dos modelos nuevos al final del schema**

Agregar al final de `packages/database/prisma/schema.prisma`:

```prisma
model BankAccount {
  id                String          @id @default(cuid())
  name              String                                  // alias, ej "Banesco Corriente Principal"
  bankName          String                                  // Banesco, Mercantil, BNC, Zelle...
  accountNumber     String?                                 // nº de cuenta (opcional para Zelle)
  accountType       String          @default("CORRIENTE")   // CORRIENTE | AHORRO | CUSTODIA | ZELLE | OTRO
  currency          String          @default("VES")         // VES | USD
  openingBalance    Float           @default(0)             // saldo inicial en la moneda de la cuenta
  openingBalanceBs  Float           @default(0)             // equivalente Bs del saldo inicial
  openingBalanceUsd Float           @default(0)             // equivalente USD del saldo inicial
  openingDate       DateTime?                               // fecha de corte del saldo inicial
  isActive          Boolean         @default(true)
  sortOrder         Int             @default(0)
  movements         BankMovement[]
  paymentMethods    PaymentMethod[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

model BankMovement {
  id              String       @id @default(cuid())
  bankAccountId   String
  bankAccount     BankAccount  @relation(fields: [bankAccountId], references: [id])
  date            DateTime                                  // fecha del movimiento
  direction       String                                   // IN | OUT
  amount          Float                                    // monto en la MONEDA DE LA CUENTA
  amountBs        Float        @default(0)                 // equivalente Bs
  amountUsd       Float        @default(0)                 // equivalente USD
  exchangeRate    Float        @default(0)                 // tasa Bs/USD usada
  type            String                                   // COBRO|PAGO|COMISION|IGTF|INTERES|NOTA_DEBITO|NOTA_CREDITO|TRASPASO|AJUSTE
  reference       String?                                  // nº de referencia bancaria
  description     String?
  sourceType      String       @default("MANUAL")          // SALE_PAYMENT|RECEIPT_COLLECTION|RECEIPT_PAYMENT|EXPENSE|ADVANCE|MANUAL
  sourceId        String?                                  // id del documento origen (null si MANUAL)
  transferGroupId String?                                  // vincula las 2 patas de un TRASPASO
  reconciled      Boolean      @default(false)
  reconciledAt    DateTime?
  reconciledById  String?
  reconciledBy    User?        @relation("BankMovementReconciler", fields: [reconciledById], references: [id])
  statementDate   DateTime?                                // fecha en que apareció en el estado de cuenta
  createdById     String
  createdBy       User         @relation("BankMovementCreator", fields: [createdById], references: [id])
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@index([bankAccountId, date])
  @@index([sourceType, sourceId])
  @@index([bankAccountId, reconciled])
}
```

- [ ] **Step 2: Agregar `bankAccountId` opcional a `PaymentMethod`**

En el modelo `PaymentMethod` (buscar `model PaymentMethod {`), agregar estas dos líneas junto a los demás campos:

```prisma
  bankAccountId   String?
  bankAccount     BankAccount? @relation(fields: [bankAccountId], references: [id])
```

- [ ] **Step 3: Agregar `bancosEnabled` a `CompanyConfig`**

En el modelo `CompanyConfig` (buscar `model CompanyConfig {`), junto a los otros toggles tipo `useCashLedger`, agregar:

```prisma
  bancosEnabled   Boolean  @default(false)   // opt-in del módulo de bancos: gatea los enganches automáticos
```

- [ ] **Step 4: Agregar las back-relations en `User`**

En el modelo `User` (buscar `model User {`), agregar junto a las demás relaciones:

```prisma
  bankMovementsCreated    BankMovement[] @relation("BankMovementCreator")
  bankMovementsReconciled BankMovement[] @relation("BankMovementReconciler")
```

- [ ] **Step 5: Validar el schema**

Run: `cd C:\Users\Diego\Desktop\Trinity && npx prisma validate --schema packages/database/prisma/schema.prisma`
Expected: `The schema at ... is valid 🚀`

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat: Session 126 - Schema modulo bancos (BankAccount, BankMovement, PaymentMethod.bankAccountId, CompanyConfig.bancosEnabled)"
```

---

### Task 2: Migración Prisma idempotente

**Files:**
- Create: `packages/database/prisma/migrations/20260911150000_bancos_module/migration.sql`

- [ ] **Step 1: Crear la migración SQL idempotente**

Crear `packages/database/prisma/migrations/20260911150000_bancos_module/migration.sql`:

```sql
-- BankAccount
CREATE TABLE IF NOT EXISTS "BankAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNumber" TEXT,
  "accountType" TEXT NOT NULL DEFAULT 'CORRIENTE',
  "currency" TEXT NOT NULL DEFAULT 'VES',
  "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openingBalanceBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openingBalanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openingDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- BankMovement
CREATE TABLE IF NOT EXISTS "BankMovement" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "amountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceId" TEXT,
  "transferGroupId" TEXT,
  "reconciled" BOOLEAN NOT NULL DEFAULT false,
  "reconciledAt" TIMESTAMP(3),
  "reconciledById" TEXT,
  "statementDate" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankMovement_pkey" PRIMARY KEY ("id")
);

-- PaymentMethod.bankAccountId
ALTER TABLE "PaymentMethod" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;

-- CompanyConfig.bancosEnabled
ALTER TABLE "CompanyConfig" ADD COLUMN IF NOT EXISTS "bancosEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS "BankMovement_bankAccountId_date_idx" ON "BankMovement"("bankAccountId", "date");
CREATE INDEX IF NOT EXISTS "BankMovement_sourceType_sourceId_idx" ON "BankMovement"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "BankMovement_bankAccountId_reconciled_idx" ON "BankMovement"("bankAccountId", "reconciled");

-- Foreign keys (idempotente vía bloque DO)
DO $$ BEGIN
  ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "BankMovement" ADD CONSTRAINT "BankMovement_reconciledById_fkey"
    FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Habilitar el módulo 'bancos' para el rol ADMIN (acceso por rol; opt-in real por empresa = bancosEnabled)
UPDATE "RolePermission"
SET "modules" = array_append("modules", 'bancos')
WHERE "role" = 'ADMIN' AND NOT ('bancos' = ANY("modules"));
```

- [ ] **Step 2: Aplicar la migración en local (BD de la grande) y regenerar el cliente**

Run: `cd C:\Users\Diego\Desktop\Trinity && npx prisma migrate deploy --schema packages/database/prisma/schema.prisma && npx prisma generate --schema packages/database/prisma/schema.prisma`
Expected: la migración `20260911150000_bancos_module` aplicada, `Generated Prisma Client`.

- [ ] **Step 3: Verificar columnas creadas**

Run (psql local): `docker exec trinity-postgres-1 psql -U postgres -d trebol_db -c "\d \"BankMovement\"" | head -30`
Expected: la tabla existe con sus columnas.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/migrations/20260911150000_bancos_module/
git commit -m "feat: Session 126 - Migracion idempotente modulo bancos + habilita 'bancos' para ADMIN"
```

---

### Task 3: Registrar el módulo `'bancos'` en VALID_MODULES y roles por defecto

**Files:**
- Modify: `apps/api/src/modules/role-permissions/role-permissions.service.ts`
- Modify: `apps/api/src/modules/auth/role-permissions.ts`

- [ ] **Step 1: Agregar `'bancos'` a `VALID_MODULES`**

En `apps/api/src/modules/role-permissions/role-permissions.service.ts`, en el array `VALID_MODULES`, agregar `'bancos'` junto a `'divisas'`:

```typescript
  'users', 'settings', 'expenses', 'payment-schedules', 'store', 'payroll', 'incidents', 'divisas', 'bancos', 'almacen',
```

- [ ] **Step 2: Dar acceso por defecto a los roles financieros**

En `apps/api/src/modules/auth/role-permissions.ts`, agregar `'bancos'` a los arrays de `SUPERVISOR` y `ACCOUNTANT` (los roles que manejan finanzas). Ejemplo para ACCOUNTANT:

```typescript
  ACCOUNTANT: ['dashboard', 'receivables', 'payables', 'payment-schedules', 'fiscal', 'pedidos', 'bancos', 'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE', 'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE'],
```

Y agregar `'bancos'` al array de `SUPERVISOR` de forma análoga.

- [ ] **Step 3: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/role-permissions/role-permissions.service.ts apps/api/src/modules/auth/role-permissions.ts
git commit -m "feat: Session 126 - Registrar modulo 'bancos' en permisos por rol"
```

---

### Task 4: DTOs del módulo bancos

**Files:**
- Create: `apps/api/src/modules/bancos/dto/create-bank-account.dto.ts`
- Create: `apps/api/src/modules/bancos/dto/create-bank-movement.dto.ts`
- Create: `apps/api/src/modules/bancos/dto/query-movements.dto.ts`
- Create: `apps/api/src/modules/bancos/dto/reconcile.dto.ts`

- [ ] **Step 1: DTO de cuenta bancaria**

Crear `apps/api/src/modules/bancos/dto/create-bank-account.dto.ts`:

```typescript
import { IsString, IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator';

export class CreateBankAccountDto {
  @IsString() name: string;
  @IsString() bankName: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsIn(['CORRIENTE', 'AHORRO', 'CUSTODIA', 'ZELLE', 'OTRO']) accountType: string;
  @IsIn(['VES', 'USD']) currency: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsNumber() exchangeRate?: number;   // tasa para calcular equivalentes del saldo inicial
  @IsOptional() @IsString() openingDate?: string;    // 'YYYY-MM-DD'
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
```

- [ ] **Step 2: DTO de movimiento manual**

Crear `apps/api/src/modules/bancos/dto/create-bank-movement.dto.ts`:

```typescript
import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CreateBankMovementDto {
  @IsString() bankAccountId: string;
  @IsString() date: string;                          // 'YYYY-MM-DD'
  @IsIn(['IN', 'OUT']) direction: string;
  @IsNumber() amount: number;                        // en la moneda de la cuenta
  @IsOptional() @IsNumber() exchangeRate?: number;   // para calcular el equivalente en la otra moneda
  @IsIn(['COMISION', 'IGTF', 'INTERES', 'NOTA_DEBITO', 'NOTA_CREDITO', 'AJUSTE']) type: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
}

// Traspaso entre dos cuentas propias
export class CreateTransferDto {
  @IsString() fromAccountId: string;
  @IsString() toAccountId: string;
  @IsString() date: string;
  @IsNumber() amountFrom: number;                    // monto que sale (moneda de fromAccount)
  @IsNumber() amountTo: number;                      // monto que entra (moneda de toAccount)
  @IsOptional() @IsNumber() exchangeRate?: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
}
```

- [ ] **Step 3: DTOs de query y conciliación**

Crear `apps/api/src/modules/bancos/dto/query-movements.dto.ts`:

```typescript
import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryMovementsDto {
  @IsOptional() @IsString() from?: string;   // 'YYYY-MM-DD'
  @IsOptional() @IsString() to?: string;     // 'YYYY-MM-DD'
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsIn(['all', 'reconciled', 'pending']) status?: string;
}
```

Crear `apps/api/src/modules/bancos/dto/reconcile.dto.ts`:

```typescript
import { IsArray, IsString, IsOptional, IsBoolean } from 'class-validator';

export class ReconcileDto {
  @IsArray() @IsString({ each: true }) movementIds: string[];
  @IsBoolean() reconciled: boolean;               // true = conciliar, false = desconciliar
  @IsOptional() @IsString() statementDate?: string; // 'YYYY-MM-DD'
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/bancos/dto/
git commit -m "feat: Session 126 - DTOs del modulo bancos"
```

---

### Task 5: Helper central `writeBankMovement` + `recordPaymentToBank`

**Files:**
- Create: `apps/api/src/common/bank-ledger.ts`

- [ ] **Step 1: Crear el helper (espejo de `common/cash-ledger.ts`)**

Crear `apps/api/src/common/bank-ledger.ts`:

```typescript
import { Prisma } from '@prisma/client';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

export interface BankMovementInput {
  bankAccountId: string;
  date: Date;
  direction: 'IN' | 'OUT';
  amount: number;        // moneda de la cuenta
  amountBs: number;
  amountUsd: number;
  exchangeRate?: number;
  type: string;          // COBRO|PAGO|COMISION|IGTF|...
  reference?: string | null;
  description?: string | null;
  sourceType: string;    // SALE_PAYMENT|RECEIPT_COLLECTION|RECEIPT_PAYMENT|EXPENSE|ADVANCE|MANUAL
  sourceId?: string | null;
  transferGroupId?: string | null;
  createdById: string;
}

/**
 * Escribe un movimiento en el libro banco de forma IDEMPOTENTE: si ya existe uno con la
 * misma (sourceType, sourceId, bankAccountId, amount) NO crea otro (protege contra dobles
 * clics/reintentos). Los MANUAL nunca se deduplican (sourceId null).
 */
export async function writeBankMovement(tx: Prisma.TransactionClient, e: BankMovementInput) {
  if (e.sourceType !== 'MANUAL' && e.sourceId) {
    const existing = await tx.bankMovement.findFirst({
      where: {
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        bankAccountId: e.bankAccountId,
        amount: r2(e.amount),
      },
    });
    if (existing) return existing;
  }
  return tx.bankMovement.create({
    data: {
      bankAccountId: e.bankAccountId,
      date: e.date,
      direction: e.direction,
      amount: r2(e.amount),
      amountBs: r2(e.amountBs),
      amountUsd: r2(e.amountUsd),
      exchangeRate: e.exchangeRate ?? 0,
      type: e.type,
      reference: e.reference ?? null,
      description: e.description ?? null,
      sourceType: e.sourceType,
      sourceId: e.sourceId ?? null,
      transferGroupId: e.transferGroupId ?? null,
      createdById: e.createdById,
    },
  });
}

/**
 * Engancha un pago electrónico al libro banco. No hace nada si:
 *  - el módulo bancos está apagado (bancosEnabled=false),
 *  - el método no tiene cuenta bancaria (efectivo o método sin configurar).
 * El monto que impacta la cuenta se toma en la moneda de la cuenta (USD o Bs).
 */
export async function recordPaymentToBank(
  tx: Prisma.TransactionClient,
  opts: {
    bancosEnabled: boolean;
    method: { bankAccountId: string | null };
    direction: 'IN' | 'OUT';
    amountUsd: number;
    amountBs: number;
    exchangeRate: number;
    date: Date;
    type: string;         // COBRO | PAGO
    sourceType: string;
    sourceId: string;
    reference?: string | null;
    description?: string | null;
    createdById: string;
  },
) {
  if (!opts.bancosEnabled) return;
  if (!opts.method.bankAccountId) return;
  const account = await tx.bankAccount.findUnique({ where: { id: opts.method.bankAccountId } });
  if (!account || !account.isActive) return;
  const amount = account.currency === 'USD' ? opts.amountUsd : opts.amountBs;
  await writeBankMovement(tx, {
    bankAccountId: account.id,
    date: opts.date,
    direction: opts.direction,
    amount,
    amountBs: opts.amountBs,
    amountUsd: opts.amountUsd,
    exchangeRate: opts.exchangeRate,
    type: opts.type,
    reference: opts.reference ?? null,
    description: opts.description ?? null,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId,
    createdById: opts.createdById,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/bank-ledger.ts
git commit -m "feat: Session 126 - Helper central writeBankMovement/recordPaymentToBank (espejo de cash-ledger)"
```

---

### Task 6: Servicio `BancosService` (cuentas, saldos, movimientos manuales, conciliación)

**Files:**
- Create: `apps/api/src/modules/bancos/bancos.service.ts`

- [ ] **Step 1: Crear el servicio con cuentas + saldos + resumen**

Crear `apps/api/src/modules/bancos/bancos.service.ts`:

```typescript
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { writeBankMovement } from '../../common/bank-ledger';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateBankMovementDto, CreateTransferDto } from './dto/create-bank-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { ReconcileDto } from './dto/reconcile.dto';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

@Injectable()
export class BancosService {
  constructor(private prisma: PrismaService) {}

  // ---- Cuentas ----
  async listAccounts() {
    return this.prisma.bankAccount.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { paymentMethods: { select: { id: true, name: true } } },
    });
  }

  async createAccount(dto: CreateBankAccountDto) {
    const rate = dto.exchangeRate ?? 0;
    const opening = dto.openingBalance ?? 0;
    const openingBs = dto.currency === 'USD' ? r2(opening * rate) : r2(opening);
    const openingUsd = dto.currency === 'USD' ? r2(opening) : (rate ? r2(opening / rate) : 0);
    return this.prisma.bankAccount.create({
      data: {
        name: dto.name.trim(),
        bankName: dto.bankName.trim(),
        accountNumber: dto.accountNumber?.trim() || null,
        accountType: dto.accountType,
        currency: dto.currency,
        openingBalance: r2(opening),
        openingBalanceBs: openingBs,
        openingBalanceUsd: openingUsd,
        openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateAccount(id: string, dto: Partial<CreateBankAccountDto>) {
    const acc = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('Cuenta no encontrada');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.bankName !== undefined) data.bankName = dto.bankName.trim();
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber?.trim() || null;
    if (dto.accountType !== undefined) data.accountType = dto.accountType;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.openingBalance !== undefined) {
      const rate = dto.exchangeRate ?? 0;
      const cur = dto.currency ?? acc.currency;
      data.openingBalance = r2(dto.openingBalance);
      data.openingBalanceBs = cur === 'USD' ? r2(dto.openingBalance * rate) : r2(dto.openingBalance);
      data.openingBalanceUsd = cur === 'USD' ? r2(dto.openingBalance) : (rate ? r2(dto.openingBalance / rate) : 0);
    }
    if (dto.openingDate !== undefined) data.openingDate = dto.openingDate ? new Date(dto.openingDate) : null;
    return this.prisma.bankAccount.update({ where: { id }, data });
  }

  // Saldo actual de una cuenta = saldo inicial + Σ (IN - OUT) en la moneda de la cuenta
  private async computeBalance(accountId: string, opening: number) {
    const agg = await this.prisma.bankMovement.groupBy({
      by: ['direction'],
      where: { bankAccountId: accountId },
      _sum: { amount: true },
    });
    const inSum = agg.find((a) => a.direction === 'IN')?._sum.amount ?? 0;
    const outSum = agg.find((a) => a.direction === 'OUT')?._sum.amount ?? 0;
    return r2(opening + inSum - outSum);
  }

  async summary() {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const rows = [];
    for (const a of accounts) {
      const balance = await this.computeBalance(a.id, a.openingBalance);
      const pending = await this.prisma.bankMovement.count({
        where: { bankAccountId: a.id, reconciled: false },
      });
      rows.push({
        id: a.id, name: a.name, bankName: a.bankName, currency: a.currency,
        accountType: a.accountType, balance, pendingCount: pending,
      });
    }
    const totalBs = rows.filter((r) => r.currency === 'VES').reduce((s, r) => s + r.balance, 0);
    const totalUsd = rows.filter((r) => r.currency === 'USD').reduce((s, r) => s + r.balance, 0);
    // Métodos electrónicos sin cuenta asignada (para avisar en el resumen)
    const methodsSinCuenta = await this.prisma.paymentMethod.count({
      where: { isActive: true, isCash: false, bankAccountId: null },
    });
    return { accounts: rows, totalBs: r2(totalBs), totalUsd: r2(totalUsd), methodsSinCuenta };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores (asumiendo que `prisma.service.ts` está en `../../prisma/prisma.service` — ajustar el import si el proyecto usa otra ruta; verificar con `divisas.service.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/bancos/bancos.service.ts
git commit -m "feat: Session 126 - BancosService: cuentas, saldos y resumen"
```

---

### Task 7: Movimientos (libro banco), manuales, traspasos y conciliación en el servicio

**Files:**
- Modify: `apps/api/src/modules/bancos/bancos.service.ts`

- [ ] **Step 1: Agregar métodos de libro banco / manual / traspaso / conciliación**

Primero, agregar el import de timezone al inicio de `bancos.service.ts` (junto a los demás imports):

```typescript
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
```

Luego agregar dentro de la clase `BancosService`:

```typescript
  // ---- Libro banco de una cuenta ----
  async ledger(accountId: string, q: QueryMovementsDto) {
    const acc = await this.prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!acc) throw new NotFoundException('Cuenta no encontrada');
    const where: any = { bankAccountId: accountId };
    if (q.from) where.date = { ...(where.date || {}), gte: caracasDayStart(q.from) };
    if (q.to) where.date = { ...(where.date || {}), lte: caracasDayEnd(q.to) };
    if (q.type) where.type = q.type;
    if (q.status === 'reconciled') where.reconciled = true;
    if (q.status === 'pending') where.reconciled = false;

    const movements = await this.prisma.bankMovement.findMany({
      where, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    // saldo corriente acumulado
    let running = acc.openingBalance;
    const rows = movements.map((m) => {
      running = Math.round((running + (m.direction === 'IN' ? m.amount : -m.amount)) * 100) / 100;
      return { ...m, runningBalance: running };
    });
    const balance = await this.computeBalance(accountId, acc.openingBalance);
    const reconciledBalance = await this.reconciledBalance(accountId, acc.openingBalance);
    return { account: acc, movements: rows, balance, reconciledBalance };
  }

  private async reconciledBalance(accountId: string, opening: number) {
    const agg = await this.prisma.bankMovement.groupBy({
      by: ['direction'],
      where: { bankAccountId: accountId, reconciled: true },
      _sum: { amount: true },
    });
    const inSum = agg.find((a) => a.direction === 'IN')?._sum.amount ?? 0;
    const outSum = agg.find((a) => a.direction === 'OUT')?._sum.amount ?? 0;
    return Math.round((opening + inSum - outSum) * 100) / 100;
  }

  // ---- Movimiento manual (comisión, IGTF, interés, notas, ajuste) ----
  async createManualMovement(dto: CreateBankMovementDto, userId: string) {
    const acc = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
    if (!acc) throw new BadRequestException('Cuenta no válida');
    const rate = dto.exchangeRate ?? 0;
    const amountBs = acc.currency === 'USD' ? r2(dto.amount * rate) : r2(dto.amount);
    const amountUsd = acc.currency === 'USD' ? r2(dto.amount) : (rate ? r2(dto.amount / rate) : 0);
    return this.prisma.bankMovement.create({
      data: {
        bankAccountId: dto.bankAccountId,
        date: new Date(dto.date),
        direction: dto.direction,
        amount: r2(dto.amount),
        amountBs, amountUsd, exchangeRate: rate,
        type: dto.type,
        reference: dto.reference?.trim() || null,
        description: dto.description?.trim() || null,
        sourceType: 'MANUAL',
        createdById: userId,
      },
    });
  }

  // ---- Traspaso entre cuentas propias (2 patas en 1 transacción) ----
  async createTransfer(dto: CreateTransferDto, userId: string) {
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException('Las cuentas deben ser distintas');
    const [from, to] = await Promise.all([
      this.prisma.bankAccount.findUnique({ where: { id: dto.fromAccountId } }),
      this.prisma.bankAccount.findUnique({ where: { id: dto.toAccountId } }),
    ]);
    if (!from || !to) throw new BadRequestException('Cuenta no válida');
    const rate = dto.exchangeRate ?? 0;
    const groupId = `TR-${userId}-${dto.date}-${r2(dto.amountFrom)}`;
    const date = new Date(dto.date);
    const bsOf = (amt: number, cur: string) => (cur === 'USD' ? r2(amt * rate) : r2(amt));
    const usdOf = (amt: number, cur: string) => (cur === 'USD' ? r2(amt) : (rate ? r2(amt / rate) : 0));
    return this.prisma.$transaction(async (tx) => {
      await writeBankMovement(tx, {
        bankAccountId: from.id, date, direction: 'OUT', amount: r2(dto.amountFrom),
        amountBs: bsOf(dto.amountFrom, from.currency), amountUsd: usdOf(dto.amountFrom, from.currency),
        exchangeRate: rate, type: 'TRASPASO', reference: dto.reference ?? null,
        description: dto.description ?? `Traspaso a ${to.name}`, sourceType: 'MANUAL',
        transferGroupId: groupId, createdById: userId,
      });
      await writeBankMovement(tx, {
        bankAccountId: to.id, date, direction: 'IN', amount: r2(dto.amountTo),
        amountBs: bsOf(dto.amountTo, to.currency), amountUsd: usdOf(dto.amountTo, to.currency),
        exchangeRate: rate, type: 'TRASPASO', reference: dto.reference ?? null,
        description: dto.description ?? `Traspaso desde ${from.name}`, sourceType: 'MANUAL',
        transferGroupId: groupId, createdById: userId,
      });
      return { ok: true, transferGroupId: groupId };
    });
  }

  // Borrar un movimiento manual (solo si no está conciliado)
  async deleteMovement(id: string) {
    const m = await this.prisma.bankMovement.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Movimiento no encontrado');
    if (m.reconciled) throw new BadRequestException('No se puede borrar un movimiento conciliado; desconcílialo primero');
    if (m.sourceType !== 'MANUAL') throw new BadRequestException('Solo se pueden borrar movimientos manuales');
    await this.prisma.bankMovement.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Conciliación (check-off) ----
  async reconcile(dto: ReconcileDto, userId: string) {
    const statementDate = dto.statementDate ? new Date(dto.statementDate) : null;
    await this.prisma.bankMovement.updateMany({
      where: { id: { in: dto.movementIds } },
      data: dto.reconciled
        ? { reconciled: true, reconciledAt: new Date(), reconciledById: userId, statementDate }
        : { reconciled: false, reconciledAt: null, reconciledById: null, statementDate: null },
    });
    return { ok: true, count: dto.movementIds.length };
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores. (Verificar que `caracasDayStart/End` acepten string 'YYYY-MM-DD'; si su firma difiere, ajustar según `common/timezone.ts`.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/bancos/bancos.service.ts
git commit -m "feat: Session 126 - Libro banco, movimientos manuales, traspasos y conciliacion"
```

---

### Task 8: Controlador y módulo `bancos` + registro en app.module

**Files:**
- Create: `apps/api/src/modules/bancos/bancos.controller.ts`
- Create: `apps/api/src/modules/bancos/bancos.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Controlador**

Crear `apps/api/src/modules/bancos/bancos.controller.ts`:

```typescript
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { BancosService } from './bancos.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateBankMovementDto, CreateTransferDto } from './dto/create-bank-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { ReconcileDto } from './dto/reconcile.dto';

@ApiTags('bancos')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('bancos')
@Controller('bancos')
export class BancosController {
  constructor(private readonly service: BancosService) {}

  @Get('summary') summary() { return this.service.summary(); }

  @Get('accounts') listAccounts() { return this.service.listAccounts(); }
  @Post('accounts') createAccount(@Body() dto: CreateBankAccountDto) { return this.service.createAccount(dto); }
  @Patch('accounts/:id') updateAccount(@Param('id') id: string, @Body() dto: Partial<CreateBankAccountDto>) {
    return this.service.updateAccount(id, dto);
  }

  @Get('accounts/:id/ledger') ledger(@Param('id') id: string, @Query() q: QueryMovementsDto) {
    return this.service.ledger(id, q);
  }

  @Post('movements') createManual(@Body() dto: CreateBankMovementDto, @CurrentUser() user: { id: string }) {
    return this.service.createManualMovement(dto, user.id);
  }
  @Post('transfers') createTransfer(@Body() dto: CreateTransferDto, @CurrentUser() user: { id: string }) {
    return this.service.createTransfer(dto, user.id);
  }
  @Delete('movements/:id') deleteMovement(@Param('id') id: string) { return this.service.deleteMovement(id); }

  @Post('reconcile') reconcile(@Body() dto: ReconcileDto, @CurrentUser() user: { id: string }) {
    return this.service.reconcile(dto, user.id);
  }
}
```

- [ ] **Step 2: Módulo**

Crear `apps/api/src/modules/bancos/bancos.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { BancosService } from './bancos.service';
import { BancosController } from './bancos.controller';
import { RolePermissionsModule } from '../role-permissions/role-permissions.module';

@Module({
  imports: [RolePermissionsModule],
  controllers: [BancosController],
  providers: [BancosService],
  exports: [BancosService],
})
export class BancosModule {}
```

Nota: verificar cómo `DivisasModule` obtiene acceso a `ModuleGuard`/`RolePermissionsService` (si es global, quitar el `imports`). Copiar exactamente el patrón de `divisas.module.ts`.

- [ ] **Step 3: Registrar en app.module.ts**

En `apps/api/src/app.module.ts`, importar y agregar `BancosModule` al array `imports` junto a `DivisasModule`:

```typescript
import { BancosModule } from './modules/bancos/bancos.module';
// ... en imports: [ ... DivisasModule, BancosModule, ... ]
```

- [ ] **Step 4: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 5: Verificación manual (API viva)**

Con el dev corriendo (`pnpm dev`), obtener un JWT de admin y llamar:
Run: `curl -s -H "Authorization: Bearer <JWT>" http://localhost:4000/api/bancos/summary`
Expected: JSON `{ "accounts": [], "totalBs": 0, "totalUsd": 0, "methodsSinCuenta": <n> }`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/bancos/ apps/api/src/app.module.ts
git commit -m "feat: Session 126 - Controlador y modulo bancos registrados en la API"
```

---

### Task 9: Exponer/asignar `bankAccountId` en Métodos de Pago (API)

**Files:**
- Modify: `apps/api/src/modules/payment-methods/dto/create-payment-method.dto.ts`
- Modify: `apps/api/src/modules/payment-methods/payment-methods.service.ts`

- [ ] **Step 1: Agregar el campo al DTO**

En `create-payment-method.dto.ts` agregar:

```typescript
  @IsOptional() @IsString() bankAccountId?: string;
```

- [ ] **Step 2: Persistir el campo en create/update del servicio**

En `payment-methods.service.ts`, en los métodos `create` y `update`, incluir `bankAccountId: dto.bankAccountId ?? null` en el `data`. (Buscar los `prisma.paymentMethod.create/update` existentes y añadir la línea.)

- [ ] **Step 3: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payment-methods/
git commit -m "feat: Session 126 - PaymentMethod acepta bankAccountId (mapeo metodo->cuenta)"
```

---

### Task 10: Menú lateral + página de Resumen + página de Cuentas (web)

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`
- Create: `apps/web/src/app/(dashboard)/bancos/page.tsx`
- Create: `apps/web/src/app/(dashboard)/bancos/cuentas/page.tsx`

- [ ] **Step 1: Agregar la sección "Bancos" al sidebar**

En `apps/web/src/components/sidebar.tsx`, duplicar el bloque de `divisas` (buscar `key: 'divisas'`) y agregar debajo:

```typescript
  {
    key: 'bancos',
    label: 'BANCOS',
    icon: <Landmark size={20} />,
    permission: 'bancos',
    items: [
      { label: 'Resumen', href: '/bancos', icon: <BarChart3 size={18} /> },
      { label: 'Cuentas', href: '/bancos/cuentas', icon: <Landmark size={18} /> },
    ],
  },
```

Importar el icono `Landmark` de `lucide-react` en la parte superior del archivo (agregarlo a la lista de imports existente de lucide).

- [ ] **Step 2: Página de resumen** (espejo de `divisas/page.tsx`)

Crear `apps/web/src/app/(dashboard)/bancos/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Plus, RefreshCw, AlertTriangle } from 'lucide-react';

interface AccountRow {
  id: string; name: string; bankName: string; currency: string;
  accountType: string; balance: number; pendingCount: number;
}
interface Summary { accounts: AccountRow[]; totalBs: number; totalUsd: number; methodsSinCuenta: number; }

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BancosPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Bancos | Trinity ERP'; }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/bancos/summary');
      setData(await res.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-20 text-center text-slate-400">Cargando…</div>;
  if (!data) return null;

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <Landmark className="text-emerald-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Bancos</h1>
            <p className="text-slate-400 text-sm">Saldos, libro banco y conciliación por cuenta.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary flex items-center gap-2"><RefreshCw size={16} /> Actualizar</button>
          <Link href="/bancos/cuentas" className="btn-primary flex items-center gap-2"><Plus size={16} /> Cuentas</Link>
        </div>
      </div>

      {data.methodsSinCuenta > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> Hay {data.methodsSinCuenta} método(s) electrónico(s) sin cuenta bancaria asignada — sus cobros/pagos no entrarán al libro banco.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5 bg-slate-800/50 border border-slate-700/40">
          <p className="text-xs text-slate-500 uppercase">Total en Bs</p>
          <p className="text-2xl font-bold text-sky-400 font-mono">Bs {fmt(data.totalBs)}</p>
        </div>
        <div className="rounded-xl p-5 bg-slate-800/50 border border-slate-700/40">
          <p className="text-xs text-slate-500 uppercase">Total en divisas</p>
          <p className="text-2xl font-bold text-emerald-400 font-mono">$ {fmt(data.totalUsd)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.accounts.map((a) => (
          <Link key={a.id} href={`/bancos/${a.id}`}
            className="rounded-xl p-4 bg-slate-800/50 border border-slate-700/40 hover:bg-slate-800/70 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">{a.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{a.currency}</span>
            </div>
            <p className="text-xs text-slate-500">{a.bankName} · {a.accountType}</p>
            <p className="text-xl font-mono font-bold text-white mt-2">
              {a.currency === 'USD' ? '$ ' : 'Bs '}{fmt(a.balance)}
            </p>
            {a.pendingCount > 0 && (
              <p className="text-[11px] text-amber-400 mt-1">{a.pendingCount} sin conciliar</p>
            )}
          </Link>
        ))}
        {data.accounts.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500">
            No hay cuentas. <Link href="/bancos/cuentas" className="text-emerald-400 hover:underline">Crea la primera</Link>.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Página de cuentas (CRUD básico)**

Crear `apps/web/src/app/(dashboard)/bancos/cuentas/page.tsx` con: título `'Cuentas bancarias | Trinity ERP'`, fetch a `/api/proxy/bancos/accounts`, tabla de cuentas (nombre, banco, nº, tipo, moneda, saldo inicial, activa) y un formulario/modal que hace `POST /api/proxy/bancos/accounts` con los campos del `CreateBankAccountDto` (name, bankName, accountNumber, accountType select CORRIENTE/AHORRO/CUSTODIA/ZELLE/OTRO, currency select VES/USD, openingBalance, exchangeRate, openingDate). Reusar las clases Tailwind del resto del ERP (`btn-primary`, `btn-secondary`, `card`, inputs `bg-slate-900 border border-slate-700`). Incluir para cada cuenta la lista de `paymentMethods` que apuntan a ella (viene en el include del endpoint `listAccounts`).

- [ ] **Step 4: Typecheck web**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "bancos" ; echo done`
Expected: sin líneas de error para `bancos`.

- [ ] **Step 5: Verificación manual (UI)**

Con `pnpm dev` corriendo, entrar a `http://localhost:3000/bancos` (como admin), crear una cuenta en `/bancos/cuentas`, y confirmar que aparece en el resumen con su saldo inicial.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/sidebar.tsx "apps/web/src/app/(dashboard)/bancos/"
git commit -m "feat: Session 126 - Menu Bancos + paginas Resumen y Cuentas (web)"
```

---

## FASE 2 — Enganches automáticos + sync al editar método + libro banco + manuales (UI)

Al terminar la Fase 2, cobros/pagos electrónicos alimentan el libro banco automáticamente (solo si `bancosEnabled=true`), la edición de método de factura procesada re-sincroniza, y la UI de detalle de cuenta muestra el libro banco con registro de movimientos manuales/traspasos.

### Task 11: Enganche en el cobro POS (`invoices.service.pay`)

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts`

- [ ] **Step 1: Importar el helper**

Al inicio de `invoices.service.ts`, junto al import de `writeCashLedger`, agregar:

```typescript
import { recordPaymentToBank } from '../../common/bank-ledger';
```

- [ ] **Step 2: Cargar el flag `bancosEnabled` dentro de la transacción de `pay()`**

Dentro del `this.prisma.$transaction(async (tx) => { ... })` de `pay()`, antes del bucle `for (const payment of dto.payments)`, agregar:

```typescript
      const cfg = await tx.companyConfig.findFirst({ select: { bancosEnabled: true } });
      const bancosEnabled = !!cfg?.bancosEnabled;
```

- [ ] **Step 3: Enganchar el movimiento de banco junto al `writeCashLedger`**

Justo DESPUÉS de la llamada `await writeCashLedger(tx, { ... sourceType: 'SALE_PAYMENT' ... })` dentro del bucle de pagos, agregar:

```typescript
        // Espejo en el libro banco (solo métodos con cuenta bancaria y si el módulo está activo).
        await recordPaymentToBank(tx, {
          bancosEnabled,
          method: { bankAccountId: (paymentMethod as any).bankAccountId ?? null },
          direction: 'IN',
          amountUsd: payment.amountUsd, amountBs: payment.amountBs,
          exchangeRate: invoice.exchangeRate,
          date: new Date(), type: 'COBRO',
          sourceType: 'SALE_PAYMENT', sourceId: id,
          reference: payment.reference ?? null, description: `Factura ${invoice.number}`,
          createdById: user.id,
        });
```

Nota: `paymentMethod` proviene de `methodMap.get(payment.methodId)`. Verificar que ese map incluya `bankAccountId` en su `select`/`findMany`; si no, agregar `bankAccountId: true` al select donde se cargan los métodos (buscar `methodMap` / `paymentMethod.findMany`).

- [ ] **Step 4: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

Con `bancosEnabled=true` (UPDATE en local), un método electrónico con cuenta asignada, cobrar una factura de contado en el POS → verificar en `/bancos/<cuenta>` que apareció el movimiento COBRO. Con un método de efectivo → NO debe aparecer.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts
git commit -m "feat: Session 126 - Cobro POS electronico alimenta el libro banco"
```

---

### Task 12: Enganche en recibos (`receipts.service.post`)

**Files:**
- Modify: `apps/api/src/modules/receipts/receipts.service.ts`

- [ ] **Step 1: Importar el helper y cargar el flag**

Agregar el import `import { recordPaymentToBank } from '../../common/bank-ledger';`. Dentro de la transacción de `post()`, antes del bucle `for (const payment of dto.payments)`, agregar:

```typescript
      const cfg = await tx.companyConfig.findFirst({ select: { bancosEnabled: true } });
      const bancosEnabled = !!cfg?.bancosEnabled;
```

- [ ] **Step 2: Enganchar junto al `writeCashLedger` del recibo**

Justo DESPUÉS del `await writeCashLedger(tx, { ... })` del bucle de pagos del recibo, agregar:

```typescript
        const bankMethod = rMethodMap.get(payment.methodId);
        await recordPaymentToBank(tx, {
          bancosEnabled,
          method: { bankAccountId: (bankMethod as any)?.bankAccountId ?? null },
          direction: isOut ? 'OUT' : 'IN',
          amountUsd: payment.amountUsd, amountBs: payment.amountBs, exchangeRate: postRate,
          date: new Date(),
          type: receipt.type === 'COLLECTION' && !isReintegro ? 'COBRO' : 'PAGO',
          sourceType: receipt.type === 'COLLECTION' ? 'RECEIPT_COLLECTION' : 'RECEIPT_PAYMENT',
          sourceId: receipt.id,
          reference: payment.reference ?? null, description: `Recibo ${receipt.number}`,
          createdById: userId,
        });
```

Nota: `rMethodMap` y `isOut`/`isReintegro` ya existen en ese bloque (ver `receipts.service.ts` líneas ~773-800). Asegurar que `rMethodMap` incluya `bankAccountId` en su select.

- [ ] **Step 3: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Postear un recibo de cobro (CxC) con método electrónico → aparece IN en el banco. Un recibo de pago (CxP) → aparece OUT.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/receipts/receipts.service.ts
git commit -m "feat: Session 126 - Recibos de cobro/pago electronicos alimentan el libro banco"
```

---

### Task 13: Sincronización al editar método de pago de factura procesada

**Files:**
- Modify: `apps/api/src/modules/invoices/invoices.service.ts`

- [ ] **Step 1: Asegurar que `updatePaymentMethods` conozca al usuario**

Revisar la firma de `updatePaymentMethods(id, dto)`. Como el bloque de banco necesita `createdById`, agregar un parámetro `userId: string` a la firma del servicio y pasarlo desde el controlador (el controlador ya tiene `@CurrentUser()`). Si prefieres no tocar la firma, usa `invoice.createdById` (el creador de la factura) como `createdById`.

- [ ] **Step 2: Al final de `updatePaymentMethods()`, recomputar el banco de esa factura**

Dentro de la transacción de `updatePaymentMethods()` (después de que el cash ledger ya quedó sincronizado, cerca del final del `$transaction`), agregar un bloque que borra los movimientos de banco NO conciliados de esta factura y los recrea desde el conjunto final de pagos:

```typescript
      // --- Sincronizar libro banco tras editar métodos ---
      const cfgBank = await tx.companyConfig.findFirst({ select: { bancosEnabled: true } });
      if (cfgBank?.bancosEnabled) {
        // Borrar solo los NO conciliados de esta factura (los conciliados se respetan)
        await tx.bankMovement.deleteMany({
          where: { sourceType: 'SALE_PAYMENT', sourceId: id, reconciled: false },
        });
        // Recrear desde los pagos finales
        const finalPayments = await tx.payment.findMany({ where: { invoiceId: id } });
        const methodIds = [...new Set(finalPayments.map((p) => p.methodId))];
        const methods = await tx.paymentMethod.findMany({
          where: { id: { in: methodIds } },
          select: { id: true, bankAccountId: true },
        });
        const mMap = new Map(methods.map((m) => [m.id, m]));
        for (const p of finalPayments) {
          const m = mMap.get(p.methodId);
          if (!m) continue;
          await recordPaymentToBank(tx, {
            bancosEnabled: true,
            method: { bankAccountId: m.bankAccountId ?? null },
            direction: 'IN',
            amountUsd: p.amountUsd, amountBs: p.amountBs, exchangeRate: p.exchangeRate,
            date: new Date(), type: 'COBRO',
            sourceType: 'SALE_PAYMENT', sourceId: id,
            reference: p.reference ?? null, description: `Factura (método editado)`,
            createdById: userId ?? (invoice as any).createdById,
          });
        }
      }
```

Nota: `userId` es el parámetro agregado en Step 1 (o `invoice.createdById` si se optó por no tocar la firma). El anti-duplicado del helper evita recrear los que ya existían idénticos; el `deleteMany` previo solo borra los NO conciliados, así que un movimiento ya conciliado permanece (edge documentado).

- [ ] **Step 3: Typecheck**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Verificación manual (los 3 casos)**

1. Efectivo→Transferencia Banesco: aparece el movimiento en Banesco.
2. Transferencia Banesco→Efectivo: desaparece de Banesco.
3. Banesco→Mercantil: sale de Banesco, entra a Mercantil.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/invoices/invoices.service.ts
git commit -m "feat: Session 126 - Editar metodo de factura procesada re-sincroniza el libro banco"
```

---

### Task 14: Enganches en gastos y anticipos electrónicos

**Files:**
- Modify: `apps/api/src/modules/expenses/expenses.service.ts`
- Modify: `apps/api/src/modules/customer-advances/customer-advances.service.ts`
- Modify: `apps/api/src/modules/supplier-advances/supplier-advances.service.ts`

- [ ] **Step 1: Gasto de contado electrónico**

En `expenses.service.ts`, en el punto donde se registra el gasto pagado (donde hoy escribe `writeCashLedger` con `sourceType: 'EXPENSE'`), agregar la llamada análoga a `recordPaymentToBank` con `direction: 'OUT'`, `type: 'PAGO'`, `sourceType: 'EXPENSE'`, `sourceId: expense.id`, cargando el flag `bancosEnabled` y el método usado (con su `bankAccountId`). Si el gasto es a crédito (crea Payable) NO se registra en banco al crearlo — el banco se mueve al pagar el Payable vía recibo (Task 12).

- [ ] **Step 2: Anticipos**

En `customer-advances.service.ts` y `supplier-advances.service.ts`, en la creación del anticipo con método electrónico, agregar `recordPaymentToBank` (`ADVANCE`; cliente = IN, proveedor = OUT).

- [ ] **Step 3: Typecheck + commit**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\api && npx tsc --noEmit -p tsconfig.json`

```bash
git add apps/api/src/modules/expenses/ apps/api/src/modules/customer-advances/ apps/api/src/modules/supplier-advances/
git commit -m "feat: Session 126 - Gastos y anticipos electronicos alimentan el libro banco"
```

---

### Task 15: Página de detalle de cuenta / Libro banco + movimiento manual + traspaso (web)

**Files:**
- Create: `apps/web/src/app/(dashboard)/bancos/[id]/page.tsx`

- [ ] **Step 1: Crear la página de detalle**

Crear `apps/web/src/app/(dashboard)/bancos/[id]/page.tsx` con:
- Título dinámico: `useEffect` con `document.title = \`${account.name} | Trinity ERP\`` dependiente de `account`.
- Fetch a `/api/proxy/bancos/accounts/${id}/ledger` con querystring de filtros (`from`, `to`, `type`, `status`).
- Cabecera con: saldo actual (`balance`), saldo conciliado (`reconciledBalance`), y diferencia (partidas conciliatorias = balance − reconciledBalance).
- Tabla del libro: fecha, tipo, referencia, descripción, entrada (si IN), salida (si OUT), `runningBalance`, y checkbox de conciliado.
- Botón "Registrar movimiento manual" → modal que hace `POST /api/proxy/bancos/movements` (campos del `CreateBankMovementDto`: direction, type select COMISION/IGTF/INTERES/NOTA_DEBITO/NOTA_CREDITO/AJUSTE, amount, exchangeRate si la cuenta es USD, reference, description, date).
- Botón "Traspaso" → modal que hace `POST /api/proxy/bancos/transfers` (fromAccountId=esta cuenta, toAccountId select, amountFrom, amountTo, exchangeRate, date).
- Botón borrar (🗑) por fila, visible solo si `sourceType==='MANUAL' && !reconciled`, que hace `DELETE /api/proxy/bancos/movements/:id`.
- Filas con enlace a su documento origen cuando `sourceType` sea SALE_PAYMENT/RECEIPT_* (opcional en esta fase).

Reusar el patrón visual de `divisas/movimientos` y las clases Tailwind del ERP.

- [ ] **Step 2: Typecheck web**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "bancos" ; echo done`
Expected: sin líneas de error para `bancos`.

- [ ] **Step 3: Verificación manual**

Entrar al detalle de una cuenta, registrar una comisión (OUT) manual y ver que el saldo baja; hacer un traspaso a otra cuenta y ver las 2 patas.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(dashboard)/bancos/[id]/"
git commit -m "feat: Session 126 - Detalle de cuenta / libro banco + movimiento manual + traspaso (web)"
```

---

## FASE 3 — Conciliación (check-off) UI + selector de cuenta en Métodos de Pago

### Task 16: Pestaña/flujo de conciliación (check-off) en el detalle de cuenta

**Files:**
- Modify: `apps/web/src/app/(dashboard)/bancos/[id]/page.tsx`

- [ ] **Step 1: Añadir modo "Conciliar"**

En la página de detalle, agregar una pestaña o toggle "Conciliar" que:
- Muestra los movimientos del periodo filtrado con checkboxes (pre-marcados los ya `reconciled`).
- Permite seleccionar/deseleccionar filas y opcionalmente fijar una `statementDate`.
- Panel en vivo: **Saldo según libro** (`balance`), **Saldo conciliado** (recalculado con la selección local), **Partidas conciliatorias** (diferencia).
- Botón "Guardar conciliación" → `POST /api/proxy/bancos/reconcile` con `{ movementIds, reconciled: true, statementDate }` para los recién marcados, y otra llamada con `reconciled: false` para los desmarcados.
- Tras guardar, recargar el ledger.

- [ ] **Step 2: Typecheck + verificación manual**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "bancos" ; echo done`

Manual: marcar 2 de 3 movimientos como conciliados, guardar, y verificar que el "Saldo conciliado" y las "Partidas conciliatorias" cuadran; que persiste al recargar.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/bancos/[id]/page.tsx"
git commit -m "feat: Session 126 - Conciliacion bancaria por check-off (web)"
```

---

### Task 17: Selector de cuenta bancaria en la config de Métodos de Pago (web)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/payment-methods/page.tsx`

- [ ] **Step 1: Agregar el select de cuenta al formulario de método**

En la página de métodos de pago, cuando el método es electrónico (`isCash === false`), mostrar un `<select>` "Cuenta bancaria destino" poblado desde `GET /api/proxy/bancos/accounts`, y enviar `bankAccountId` en el `POST/PATCH` del método. Mostrar un aviso visual si un método electrónico no tiene cuenta asignada (coherente con el aviso del resumen).

- [ ] **Step 2: Typecheck + verificación manual**

Run: `cd C:\Users\Diego\Desktop\Trinity\apps\web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "payment-methods" ; echo done`

Manual: asignar la cuenta Banesco al método "Transferencia Banesco", y confirmar en `/bancos/cuentas` que aparece listado bajo esa cuenta.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/settings/payment-methods/page.tsx"
git commit -m "feat: Session 126 - Asignar cuenta bancaria a metodos de pago electronicos (web)"
```

---

### Task 18: PROGRESS.md / PROJECT.md + deploy checklist

**Files:**
- Modify: `PROGRESS.md`
- Modify: `PROJECT.md`

- [ ] **Step 1: Documentar la sesión**

Agregar en `PROGRESS.md` una entrada "Sesión 126 — Módulo de Bancos" describiendo: modelo, enganches, conciliación, opt-in `bancosEnabled`, y que arranca APAGADO en las 6 empresas. En `PROJECT.md` documentar el permiso/módulo `'bancos'` y la bandera `bancosEnabled`.

- [ ] **Step 2: Pre-deploy checklist (regla del proyecto)**

Verificar: `git status` limpio de archivos necesarios sin commitear; migración commiteada; `app.module.ts` con `BancosModule`; endpoints nuevos usados por el front están commiteados. Recordar que el deploy lo hace Diego: `ssh root@... "cd /opt/Trinity && git pull origin main && bash deploy.sh"`, y que arranca inofensivo porque `bancosEnabled=false` por defecto (los enganches no disparan hasta encenderlo por empresa).

- [ ] **Step 3: Commit + push**

```bash
git add PROGRESS.md PROJECT.md
git commit -m "docs: Session 126 - Documenta modulo de bancos (opt-in bancosEnabled, arranca apagado)"
git push origin main
```

---

## Notas de decisiones (del spec)

- **Fuera de alcance:** reversas por devolución/nota de crédito (el negocio hace cambio de producto, no reembolso); importación de estados de cuenta (fase 2 futura); recarga histórica (arranca desde saldo inicial).
- **Anti-descuadre:** idempotencia por `(sourceType, sourceId, bankAccountId, amount)` + borrar/recrear no-conciliados al editar método.
- **Simplificación vs spec:** el gating fino por acción (`VIEW_BANKS`/`RECONCILE_BANK`) no existe como patrón en el codebase (solo `@RequireModule` por rol); se gatea el módulo completo con el permiso de rol `'bancos'`. El opt-in por empresa es `CompanyConfig.bancosEnabled` (gatea los enganches automáticos).
- **Saldo inicial** vive en los campos `openingBalance*` de la cuenta, no como movimiento (evita doble conteo).
