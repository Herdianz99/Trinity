# Exportar pagos a Bancaribe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desde el detalle de una programación de pagos, elegir las facturas que se pagan HOY y bajar un Excel con los datos en el orden exacto de la plantilla "Generador de TXT Bancaribe" (hoja Pagos, pegar en C14), con los Bs calculados a la tasa BCV del día.

**Architecture:** El proveedor gana 2 campos (cuenta de 20 dígitos y tipo de documento R/C/P) validados con los mismos algoritmos módulo 11 de la macro del banco. El módulo `payment-schedules` expone un preview (`GET :id/bank-export`) y la exportación (`POST :id/bank-export` → xlsx). Al exportar se marca cada ítem con fecha/tasa/Bs exportados (anti doble pago) sin marcarlo como pagado. El frontend agrega un modal de selección en `/payment-schedules/[id]` y los campos bancarios en las fichas de proveedor.

**Tech Stack:** NestJS + Prisma (PostgreSQL), `xlsx` (SheetJS, ya instalado en apps/api), Next.js 14 App Router + Tailwind.

## Decisiones de negocio (acordadas con el usuario)

- Solo Bancaribe. Una cuenta por proveedor.
- Monto = **neto USD del ítem (con descuento de la programación aplicado) × tasa BCV de hoy**, para TODAS las facturas (aunque se hayan registrado en Bs: la deuda vive en USD).
- Una línea por proveedor en la hoja Pagos (suma de las facturas seleccionadas de ese proveedor).
- Referencia = número de la programación sin símbolos (ej. `PP-0012` → `PP0012`).
- Si no hay tasa BCV de hoy (`caracasDateKey()`), la exportación se bloquea.
- Exportar NO marca pagado: guarda `bankExportedAt/bankExportRate/bankExportAmountBs` por ítem y la UI avisa si se re-exporta.
- Solo se exportan ítems CxP no pagados (`isPaid=false`). Los ítems NDC no son seleccionables (no son transferencias al proveedor).
- Proveedores sin cuenta/doc o con cuenta/RIF inválido: visibles en el modal, deshabilitados, con el motivo.
- No hay framework de tests en el repo (sin jest): los algoritmos puros se verifican con un script `tsx` contra datos reales que la macro del banco marcó como OK; el resto con `tsc --noEmit` + prueba manual.

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `packages/database/prisma/schema.prisma` | Modify | Campos `Supplier.bankAccount`, `Supplier.bankDocType`; `PaymentScheduleItem.bankExportedAt/bankExportRate/bankExportAmountBs` |
| `packages/database/prisma/migrations/20260930120000_bancaribe_export/migration.sql` | Create | Migración idempotente |
| `deploy/fix-schema.sql` | Modify | Red de seguridad con las mismas columnas |
| `apps/api/src/common/bancaribe.ts` | Create | Funciones puras: validar cuenta/RIF, limpiar nombre/referencia, normalizar documento, validar datos bancarios de un proveedor |
| `apps/api/src/modules/suppliers/dto/create-supplier.dto.ts` | Modify | `bankAccount`, `bankDocType` |
| `apps/api/src/modules/suppliers/suppliers.service.ts` | Modify | Validar cuenta al crear/actualizar |
| `apps/api/src/modules/payment-schedules/payment-schedule-bank-export.service.ts` | Create | Preview + generación del xlsx + marcas de exportación |
| `apps/api/src/modules/payment-schedules/dto/bank-export.dto.ts` | Create | `{ itemIds: string[] }` |
| `apps/api/src/modules/payment-schedules/payment-schedules.controller.ts` | Modify | 2 endpoints |
| `apps/api/src/modules/payment-schedules/payment-schedules.module.ts` | Modify | Registrar el service |
| `apps/web/src/app/(dashboard)/catalog/suppliers/new/page.tsx` | Modify | Campos bancarios |
| `apps/web/src/app/(dashboard)/catalog/suppliers/[id]/page.tsx` | Modify | Campos bancarios |
| `apps/web/src/app/(dashboard)/payment-schedules/[id]/bank-export-modal.tsx` | Create | Modal de selección + descarga |
| `apps/web/src/app/(dashboard)/payment-schedules/[id]/page.tsx` | Modify | Botón "Exportar a Bancaribe", badge "Exportado" |

---

### Task 1: Schema + migración

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (model `Supplier`, model `PaymentScheduleItem`)
- Create: `packages/database/prisma/migrations/20260930120000_bancaribe_export/migration.sql`
- Modify: `deploy/fix-schema.sql` (al final)

- [ ] **Step 1: Agregar campos a `Supplier`** (después de `paymentMethod String?`):

```prisma
  bankAccount       String?            // cuenta bancaria de 20 digitos (pago por Bancaribe)
  bankDocType       String?            // R = RIF, C = cedula, P = pasaporte (plantilla Bancaribe)
```

- [ ] **Step 2: Agregar campos a `PaymentScheduleItem`** (después de `isPaid Boolean @default(false)`):

```prisma
  bankExportedAt     DateTime?        // ultima vez que se exporto al Excel de Bancaribe
  bankExportRate     Float?           // tasa BCV usada en esa exportacion
  bankExportAmountBs Float?           // Bs exportados (neto USD x tasa del dia)
```

- [ ] **Step 3: Crear la migración**

```sql
-- Exportacion de pagos a Bancaribe: datos bancarios del proveedor y marca de exportacion
-- por item de la programacion (anti doble pago). Aditiva e idempotente.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "bankAccount" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "bankDocType" TEXT;

ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "bankExportedAt" TIMESTAMP(3);
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "bankExportRate" DOUBLE PRECISION;
ALTER TABLE "PaymentScheduleItem" ADD COLUMN IF NOT EXISTS "bankExportAmountBs" DOUBLE PRECISION;
```

- [ ] **Step 4: Copiar las mismas 5 líneas `ALTER TABLE` al final de `deploy/fix-schema.sql`** bajo el comentario `-- Session 150: exportacion Bancaribe`.

- [ ] **Step 5: Aplicar y regenerar el cliente**

Run: `cd packages/database && npx prisma migrate deploy && npx prisma generate`
Expected: `1 migration applied` y `Generated Prisma Client`.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma deploy/fix-schema.sql
git commit -m "feat: Session 150 - schema: datos bancarios del proveedor y marca de exportacion Bancaribe"
```

---

### Task 2: Helper puro `bancaribe.ts` (algoritmos de la macro)

**Files:**
- Create: `apps/api/src/common/bancaribe.ts`
- Verify: script temporal en el scratchpad (no se commitea)

- [ ] **Step 1: Escribir el script de verificación** (falla porque el módulo no existe). En el scratchpad, `check-bancaribe.ts`:

```ts
import {
  isValidVeAccount, isValidRif, cleanBankName, cleanBankRef, bankDocument, supplierBankIssues,
} from 'C:/Users/Usuario/Desktop/Trinity/apps/api/src/common/bancaribe';

const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} -> ${JSON.stringify(got)}`);
  if (!ok) process.exitCode = 1;
};
// Cuentas/RIF que la macro de Bancaribe marco "OK" en el archivo real del cliente
eq('cta 0171 ok', isValidVeAccount('01710042486003037096'), true);
eq('cta 0114 ok', isValidVeAccount('0114-0320-41-3200874900'), true);
eq('cta 0134 ok', isValidVeAccount('01340334173343048299'), true);
eq('cta ult digito mal', isValidVeAccount('01710042486003037097'), false);
eq('cta DV mal', isValidVeAccount('01710042496003037096'), false);
eq('cta corta', isValidVeAccount('0171004248600303709'), false);
eq('rif ok', isValidRif('J409907600'), true);
eq('rif con guiones', isValidRif('J-40990760-0'), true);
eq('rif mal', isValidRif('J409907601'), false);
eq('nombre', cleanBankName('Ferretería Muñoz & Hijos, C.A.'), 'FERRETERIA MUNOZ Y HIJOS C A');
eq('ref', cleanBankRef('PP-0012'), 'PP0012');
eq('doc rif', bankDocument('J-40990760-0', 'R'), 'J409907600');
eq('doc pasaporte', bankDocument('ab12345', 'P'), 'PAB12345');
eq('issues ok', supplierBankIssues({ bankAccount: '01710042486003037096', bankDocType: 'R', rif: 'J409907600' }), []);
eq('issues sin cuenta', supplierBankIssues({ bankAccount: null, bankDocType: 'R', rif: 'J409907600' }), ['Sin cuenta bancaria']);
eq('issues rif malo', supplierBankIssues({ bankAccount: '01710042486003037096', bankDocType: 'R', rif: 'J409907601' }), ['RIF inválido']);
eq('issues cedula', supplierBankIssues({ bankAccount: '01710042486003037096', bankDocType: 'C', rif: 'V20271596' }), []);
```

- [ ] **Step 2: Correrlo y verificar que falla**

Run: `npx -y tsx check-bancaribe.ts` (desde el scratchpad)
Expected: error `Cannot find module .../common/bancaribe`.

- [ ] **Step 3: Implementar `apps/api/src/common/bancaribe.ts`**

```ts
// Reglas de la plantilla oficial "Generador de TXT Bancaribe" (macros VBA CodigoCuenta,
// rif y Caracteres), portadas 1:1 para que Trinity rechace antes lo que el banco rechazaria.

const onlyDigits = (s: string) => s.replace(/\D/g, '');

// Digitos verificadores (posiciones 9 y 10) de una cuenta venezolana de 20 digitos.
// Macro Modulo11: suma8 = primeros 8 x [3,2,7,6,5,4,3,2]; suma10 = ultimos 10 x
// [5,4,3,2,7,6,5,4,3,2] + digitos 5..8 x [3,2,7,6]. DV = 11 - resto (10->0, 11->1).
export function isValidVeAccount(raw: string | null | undefined): boolean {
  const a = onlyDigits(String(raw ?? ''));
  if (a.length !== 20) return false;
  const d = [...a].map(Number);
  const F8 = [3, 2, 7, 6, 5, 4, 3, 2];
  const F10 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const AG = [3, 2, 7, 6];
  let s8 = 0;
  for (let i = 0; i < 8; i++) s8 += d[i] * F8[i];
  let s10 = 0;
  for (let i = 0; i < 10; i++) s10 += d[10 + i] * F10[i];
  for (let i = 0; i < 4; i++) s10 += d[4 + i] * AG[i];
  const dv = (s: number) => {
    const r = 11 - (s % 11);
    return r === 10 ? 0 : r === 11 ? 1 : r;
  };
  return d[8] === dv(s8) && d[9] === dv(s10);
}

// Digito verificador del RIF (macro Modulo11Rif). Acepta guiones/espacios.
export function isValidRif(raw: string | null | undefined): boolean {
  let r = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[VEJGPC]\d{1,9}$/.test(r)) return false;
  r = r[0] + r.slice(1).padStart(9, '0');
  const factor: Record<string, number> = { V: 1, E: 2, J: 3, C: 3, P: 4, G: 5 };
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  let s = factor[r[0]] * 4;
  for (let i = 0; i < 8; i++) s += Number(r[1 + i]) * w[i];
  let v = 11 - (s % 11);
  if (v >= 10 || v < 1) v = 0;
  return Number(r[9]) === v;
}

const stripAccents = (s: string) =>
  s.toUpperCase().replace(/Ñ/g, 'N').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Nombre del beneficiario (macro FormatoDataNombre): mayusculas, sin acentos, & -> Y,
// cualquier simbolo -> espacio, maximo 64.
export function cleanBankName(name: string): string {
  return stripAccents(name).replace(/&/g, ' Y ').replace(/[^A-Z0-9]+/g, ' ').trim().slice(0, 64);
}

// Referencia (macro FormatoDataGenerico): mayusculas, sin acentos ni simbolos.
export function cleanBankRef(ref: string): string {
  return stripAccents(ref).replace(/[^A-Z0-9]/g, '');
}

// Documento tal como lo espera la plantilla: letra + numero, sin guiones.
// Pasaporte: la macro antepone "P".
export function bankDocument(rif: string, docType: string): string {
  const doc = String(rif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return docType === 'P' ? `P${doc}` : doc;
}

// Motivos por los que un proveedor NO se puede exportar (vacio = listo).
export function supplierBankIssues(s: {
  bankAccount: string | null;
  bankDocType: string | null;
  rif: string | null;
}): string[] {
  const issues: string[] = [];
  if (!s.bankAccount) issues.push('Sin cuenta bancaria');
  else if (!isValidVeAccount(s.bankAccount)) issues.push('Cuenta bancaria inválida');
  if (!s.bankDocType) issues.push('Sin tipo de documento');
  if (!s.rif) issues.push('Sin RIF/cédula');
  else if (s.bankDocType === 'R' && !isValidRif(s.rif)) issues.push('RIF inválido');
  else if (s.bankDocType === 'C' && !/^[VE]\d{1,9}$/.test(bankDocument(s.rif, 'C'))) issues.push('Cédula inválida');
  return issues;
}
```

- [ ] **Step 4: Correr el script**

Run: `npx -y tsx check-bancaribe.ts`
Expected: todas las líneas `OK`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/bancaribe.ts
git commit -m "feat: Session 150 - helper Bancaribe: validacion de cuenta y RIF (modulo 11) y limpieza de datos"
```

---

### Task 3: Datos bancarios en el API de proveedores

**Files:**
- Modify: `apps/api/src/modules/suppliers/dto/create-supplier.dto.ts`
- Modify: `apps/api/src/modules/suppliers/suppliers.service.ts:40-86`

- [ ] **Step 1: DTO** — agregar `IsIn` al import de `class-validator` y, antes de `isActive`:

```ts
  @ApiProperty({ required: false, description: 'Cuenta bancaria de 20 digitos (pagos por Bancaribe)' })
  @IsOptional()
  @IsString()
  bankAccount?: string | null;

  @ApiProperty({ required: false, enum: ['R', 'C', 'P'], description: 'R=RIF, C=cedula, P=pasaporte' })
  @IsOptional()
  @IsIn(['R', 'C', 'P'])
  bankDocType?: string | null;
```

- [ ] **Step 2: Service** — importar `import { isValidVeAccount } from '../../common/bancaribe';` y agregar el normalizador:

```ts
  // Cuenta bancaria: se guarda solo con digitos; vacia -> null. Invalida -> error
  // (mismo algoritmo modulo 11 que la plantilla de Bancaribe).
  private normalizeBankAccount(raw: string | null | undefined): string | null | undefined {
    if (raw === undefined) return undefined;
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (!isValidVeAccount(digits)) {
      throw new BadRequestException('La cuenta bancaria no es válida (debe tener 20 dígitos y dígito verificador correcto)');
    }
    return digits;
  }
```

En `create`:

```ts
  async create(dto: CreateSupplierDto) {
    await this.checkDuplicateRif(dto.rif);
    const bankAccount = this.normalizeBankAccount(dto.bankAccount);
    return this.prisma.supplier.create({ data: { ...dto, bankAccount } });
  }
```

En `update`:

```ts
  async update(id: string, dto: UpdateSupplierDto) {
    const existing = await this.findOne(id);
    await this.checkDuplicateRif(dto.rif ?? existing.rif, id);
    const bankAccount = this.normalizeBankAccount(dto.bankAccount);
    return this.prisma.supplier.update({
      where: { id },
      data: { ...dto, ...(bankAccount !== undefined ? { bankAccount } : {}) },
    });
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p .`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/suppliers
git commit -m "feat: Session 150 - proveedores: cuenta bancaria y tipo de documento validados"
```

---

### Task 4: Service de exportación (preview + xlsx)

**Files:**
- Create: `apps/api/src/modules/payment-schedules/payment-schedule-bank-export.service.ts`
- Create: `apps/api/src/modules/payment-schedules/dto/bank-export.dto.ts`

- [ ] **Step 1: DTO**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BankExportDto {
  @ApiProperty({ type: [String], description: 'IDs de PaymentScheduleItem a pagar hoy' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  itemIds: string[];
}
```

- [ ] **Step 2: Service**

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDateKey } from '../../common/timezone';
import { effectivePct, itemNet, round2 } from './payment-schedule-discount';
import { bankDocument, cleanBankName, cleanBankRef, supplierBankIssues } from '../../common/bancaribe';

// Exportacion de la programacion al Excel que se pega en la plantilla "Generador de TXT
// Bancaribe" (hoja Pagos, celda C14). Bs = neto USD del item (con descuento) x tasa BCV de
// HOY: la deuda vive en USD aunque la factura se haya registrado en Bs.
@Injectable()
export class PaymentScheduleBankExportService {
  constructor(private readonly prisma: PrismaService) {}

  private async todayRate(): Promise<number | null> {
    const r = await this.prisma.exchangeRate.findUnique({ where: { date: caracasDateKey() } });
    return r?.rate ?? null;
  }

  // Items de la programacion con neto USD, proveedor y sus datos bancarios.
  private async loadRows(scheduleId: string) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        supplierDiscounts: true,
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            payable: {
              select: {
                documentNumber: true,
                purchaseOrder: { select: { supplierInvoiceNumber: true } },
                supplier: {
                  select: {
                    id: true, name: true, rif: true, phone: true, email: true,
                    bankAccount: true, bankDocType: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Programación no encontrada');
    const discountMap = new Map(schedule.supplierDiscounts.map((d) => [d.supplierName, d.discountPct]));
    const rows = schedule.items.map((item) => {
      const pct = effectivePct(item.discountPct, discountMap.get(item.supplierName) ?? 0);
      const { netUsd } = itemNet(item.plannedAmountUsd, item.plannedAmountBs, pct);
      const supplier = item.payable?.supplier ?? null;
      const docNumber = item.payable?.documentNumber || item.payable?.purchaseOrder?.supplierInvoiceNumber || item.description;
      let blockedReason: string | null = null;
      if (!item.payableId) blockedReason = 'Nota de crédito/débito: no se paga por banco';
      else if (item.isPaid) blockedReason = 'Ya pagado';
      else if (!supplier) blockedReason = 'Sin proveedor';
      else {
        const issues = supplierBankIssues(supplier);
        if (issues.length) blockedReason = issues.join(', ');
      }
      return { item, supplier, docNumber, netUsd, blockedReason };
    });
    return { schedule, rows };
  }

  async preview(scheduleId: string) {
    const [{ schedule, rows }, rate] = await Promise.all([this.loadRows(scheduleId), this.todayRate()]);
    return {
      scheduleNumber: schedule.number,
      rate,
      items: rows.map(({ item, supplier, docNumber, netUsd, blockedReason }) => ({
        id: item.id,
        supplierId: supplier?.id ?? null,
        supplierName: item.supplierName,
        docNumber,
        netUsd,
        bsToday: rate ? round2(netUsd * rate) : null,
        blockedReason,
        bankExportedAt: item.bankExportedAt,
        bankExportRate: item.bankExportRate,
        bankExportAmountBs: item.bankExportAmountBs,
      })),
    };
  }

  async generate(scheduleId: string, itemIds: string[]): Promise<{ buffer: Buffer; filename: string }> {
    const rate = await this.todayRate();
    if (!rate) throw new BadRequestException('No hay tasa BCV registrada para hoy. Cárgala antes de exportar.');

    const { schedule, rows } = await this.loadRows(scheduleId);
    if (schedule.status === 'CANCELLED') {
      throw new BadRequestException('No se puede exportar una programación cancelada');
    }
    const wanted = new Set(itemIds);
    const selected = rows.filter((r) => wanted.has(r.item.id));
    if (selected.length !== wanted.size) throw new BadRequestException('Algún documento no pertenece a esta programación');
    const blocked = selected.find((r) => r.blockedReason);
    if (blocked) {
      throw new BadRequestException(`${blocked.item.supplierName} (${blocked.docNumber}): ${blocked.blockedReason}`);
    }

    // Una transferencia por proveedor = suma de sus items (Bs redondeado por item).
    const ref = cleanBankRef(schedule.number);
    const bySupplier = new Map<string, { s: NonNullable<(typeof rows)[number]['supplier']>; bs: number }>();
    const detail: any[][] = [['Proveedor', 'Documento', 'Neto USD', 'Tasa', 'Monto Bs']];
    for (const r of selected) {
      const bs = round2(r.netUsd * rate);
      const g = bySupplier.get(r.supplier!.id) ?? { s: r.supplier!, bs: 0 };
      g.bs = round2(g.bs + bs);
      bySupplier.set(r.supplier!.id, g);
      detail.push([r.item.supplierName, r.docNumber, r.netUsd, rate, bs]);
    }

    const phone11 = (p: string | null) => {
      const d = String(p ?? '').replace(/\D/g, '');
      return d.length === 11 ? d : '';
    };
    const email = (e: string | null) => (e && e.includes('@') ? e.trim().slice(0, 64) : '');

    // Hoja Pagos: MISMO orden que TablaPagos (C..J): Nombre, Monto, Referencia, Cuenta,
    // Tipo, Documento, Telefono, E-Mail. Se copia desde A2 y se pega en C14.
    const pagos: any[][] = [['Nombre Beneficiario', 'Monto', 'Referencia', 'Cuenta', 'Tipo', 'Documento', 'Teléfono', 'E-Mail']];
    const afiliacion: any[][] = [['Nombre Beneficiario', 'Tipo', 'C.I./RIF/Pasaporte', 'Cuenta Beneficiario', 'Teléfono', 'Correo Electrónico']];
    for (const { s, bs } of bySupplier.values()) {
      const name = cleanBankName(s.name);
      const doc = bankDocument(s.rif!, s.bankDocType!);
      pagos.push([name, bs, ref, s.bankAccount!, s.bankDocType!, doc, phone11(s.phone), email(s.email)]);
      afiliacion.push([name, s.bankDocType!, doc, s.bankAccount!, phone11(s.phone), email(s.email)]);
    }

    const wb = XLSX.utils.book_new();
    const wsPagos = XLSX.utils.aoa_to_sheet(pagos);
    // Cuenta/Documento/Telefono como TEXTO (no perder ceros a la izquierda); Monto numerico 2 dec.
    for (let r = 1; r < pagos.length; r++) {
      const monto = wsPagos[XLSX.utils.encode_cell({ r, c: 1 })];
      if (monto) monto.z = '0.00';
      for (const c of [2, 3, 5, 6]) {
        const cell = wsPagos[XLSX.utils.encode_cell({ r, c })];
        if (cell) { cell.t = 's'; cell.v = String(cell.v); }
      }
    }
    wsPagos['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsPagos, 'Pagos');

    const wsAf = XLSX.utils.aoa_to_sheet(afiliacion);
    for (let r = 1; r < afiliacion.length; r++) {
      for (const c of [2, 3, 4]) {
        const cell = wsAf[XLSX.utils.encode_cell({ r, c })];
        if (cell) { cell.t = 's'; cell.v = String(cell.v); }
      }
    }
    wsAf['!cols'] = [{ wch: 40 }, { wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsAf, 'Afiliacion');

    const wsDet = XLSX.utils.aoa_to_sheet(detail);
    wsDet['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsDet, 'Detalle');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // Marca anti doble pago (NO marca pagado).
    const now = new Date();
    await this.prisma.$transaction(
      selected.map((r) =>
        this.prisma.paymentScheduleItem.update({
          where: { id: r.item.id },
          data: { bankExportedAt: now, bankExportRate: rate, bankExportAmountBs: round2(r.netUsd * rate) },
        }),
      ),
    );

    return { buffer, filename: `Bancaribe-${ref}.xlsx` };
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && npx tsc --noEmit --incremental false -p .`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payment-schedules/payment-schedule-bank-export.service.ts apps/api/src/modules/payment-schedules/dto/bank-export.dto.ts
git commit -m "feat: Session 150 - servicio de exportacion de pagos a Excel Bancaribe"
```

---

### Task 5: Endpoints

**Files:**
- Modify: `apps/api/src/modules/payment-schedules/payment-schedules.module.ts`
- Modify: `apps/api/src/modules/payment-schedules/payment-schedules.controller.ts`

- [ ] **Step 1: Módulo** — agregar `PaymentScheduleBankExportService` al import y a `providers`.

- [ ] **Step 2: Controller** — importar `BankExportDto` y el service, inyectarlo en el constructor como `private readonly bankExport: PaymentScheduleBankExportService`, y agregar al final de la clase (las rutas tienen sufijo `/bank-export`, no chocan con `:id`):

```ts
  // Preview para el modal "Exportar a Bancaribe": items, neto USD, Bs a la tasa de hoy,
  // motivo si no es exportable y marca de exportaciones anteriores.
  @Get(':id/bank-export')
  bankExportPreview(@Param('id') id: string) {
    return this.bankExport.preview(id);
  }

  // Excel para pegar en la plantilla "Generador de TXT Bancaribe" (hoja Pagos, C14).
  @Post(':id/bank-export')
  async bankExportExcel(@Param('id') id: string, @Body() dto: BankExportDto, @Res() res: Response) {
    const { buffer, filename } = await this.bankExport.generate(id, dto.itemIds);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  }
```

- [ ] **Step 3: Probar con la API corriendo** (`npx -y pnpm@9.1.0 dev` desde la raíz)

Run: `curl -s -H "Authorization: Bearer <token>" http://localhost:4000/payment-schedules/<id>/bank-export`
Expected: JSON con `rate` (o `null` si no hay tasa hoy) e `items[]` con `blockedReason` = "Sin cuenta bancaria" para proveedores sin datos.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payment-schedules
git commit -m "feat: Session 150 - endpoints preview y Excel de exportacion Bancaribe"
```

---

### Task 6: Campos bancarios en las fichas de proveedor (web)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/catalog/suppliers/new/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/catalog/suppliers/[id]/page.tsx`

- [ ] **Step 1: `new/page.tsx`** — en `defaultForm` agregar `bankAccount: '', bankDocType: 'R',`; en el `body` de `handleSave` agregar `bankAccount: form.bankAccount || undefined, bankDocType: form.bankAccount ? form.bankDocType : undefined,`; y después del bloque "Metodo de pago" (`md:col-span-2`) agregar:

```tsx
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Cuenta bancaria (20 dígitos)</label>
            <input type="text" inputMode="numeric" value={form.bankAccount}
              onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value.replace(/[^0-9-\s]/g, '') }))}
              className="input-field !py-2 text-sm font-mono" placeholder="0114..." />
            <p className="text-[10px] text-slate-500 mt-1">Para exportar pagos a Bancaribe. Se valida el dígito verificador.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de documento (banco)</label>
            <select value={form.bankDocType} onChange={e => setForm(f => ({ ...f, bankDocType: e.target.value }))} className="input-field !py-2 text-sm">
              <option value="R">RIF</option>
              <option value="C">Cédula</option>
              <option value="P">Pasaporte</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1">El número es el del campo RIF.</p>
          </div>
```

- [ ] **Step 2: `[id]/page.tsx`** — en `setForm({...})` de `fetchSupplier` agregar `bankAccount: data.bankAccount || '', bankDocType: data.bankDocType || 'R',`; en el `body` de `handleSave` agregar `bankAccount: form.bankAccount || null, bankDocType: form.bankAccount ? form.bankDocType : null,`; en la interfaz del proveedor agregar `bankAccount: string | null; bankDocType: string | null;`; y el mismo JSX del Step 1 después de "Metodo de pago", cambiando `setForm(f => ...)` por `setForm((f: any) => ...)` y `value={form.bankAccount}` por `value={form.bankAccount || ''}`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: sin errores.

- [ ] **Step 4: Prueba manual** — editar un proveedor con cuenta `01710042486003037097` → error "La cuenta bancaria no es válida"; con `01710042486003037096` → guarda.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/catalog/suppliers"
git commit -m "feat: Session 150 - fichas de proveedor: cuenta bancaria y tipo de documento"
```

---

### Task 7: Modal "Exportar a Bancaribe" en la programación

**Files:**
- Create: `apps/web/src/app/(dashboard)/payment-schedules/[id]/bank-export-modal.tsx`
- Modify: `apps/web/src/app/(dashboard)/payment-schedules/[id]/page.tsx`

- [ ] **Step 1: Crear el modal**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, X, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { fmtRate } from '@/lib/format';

interface ExportItem {
  id: string;
  supplierId: string | null;
  supplierName: string;
  docNumber: string;
  netUsd: number;
  bsToday: number | null;
  blockedReason: string | null;
  bankExportedAt: string | null;
  bankExportRate: number | null;
  bankExportAmountBs: number | null;
}
interface Preview { scheduleNumber: string; rate: number | null; items: ExportItem[] }

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BankExportModal({ scheduleId, onClose, onExported }: {
  scheduleId: string; onClose: () => void; onExported: () => void;
}) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`/api/proxy/payment-schedules/${scheduleId}/bank-export`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Error'); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [scheduleId]);

  const groups = useMemo(() => {
    const m = new Map<string, ExportItem[]>();
    for (const it of data?.items ?? []) m.set(it.supplierName, [...(m.get(it.supplierName) ?? []), it]);
    return [...m.entries()];
  }, [data]);

  const chosen = (data?.items ?? []).filter((i) => selected.has(i.id));
  const totalBs = chosen.reduce((s, i) => s + (i.bsToday ?? 0), 0);
  const reExport = chosen.filter((i) => i.bankExportedAt);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function download() {
    if (reExport.length && !confirm(`${reExport.length} documento(s) ya se exportaron antes. ¿Exportarlos de nuevo? Verifica que no se hayan pagado.`)) return;
    setDownloading(true); setError('');
    try {
      const res = await fetch(`/api/proxy/payment-schedules/${scheduleId}/bank-export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [...selected] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Error al exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bancaribe-${data?.scheduleNumber ?? 'pagos'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      onExported();
      onClose();
    } catch (e: any) { setError(e.message); } finally { setDownloading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-700/50">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><FileSpreadsheet size={18} className="text-green-400" /> Exportar a Bancaribe</h2>
            <p className="text-xs text-slate-400 mt-0.5">Marca los documentos que se pagan hoy. Los Bs se calculan con la tasa BCV de hoy.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
          {!data && !error && <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-green-500" size={28} /></div>}
          {data && !data.rate && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
              <AlertTriangle size={16} className="flex-shrink-0" /> No hay tasa BCV registrada para hoy. Cárgala antes de exportar.
            </div>
          )}
          {data && groups.map(([supplier, items]) => (
            <div key={supplier} className="rounded-lg border border-slate-700/50">
              <div className="px-3 py-2 bg-slate-800/40 text-sm font-medium text-slate-200 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{supplier}</span>
                {items[0].blockedReason && items[0].supplierId && (
                  <Link href={`/catalog/suppliers/${items[0].supplierId}`} target="_blank" className="text-xs text-blue-400 hover:underline flex-shrink-0">Completar datos</Link>
                )}
              </div>
              {items.map((it) => (
                <label key={it.id} className={`flex items-center gap-3 px-3 py-2 border-t border-slate-700/30 text-sm ${it.blockedReason ? 'opacity-60' : 'cursor-pointer hover:bg-slate-800/30'}`}>
                  <input type="checkbox" disabled={!!it.blockedReason || !data.rate} checked={selected.has(it.id)} onChange={() => toggle(it.id)} className="w-4 h-4 accent-green-500" />
                  <span className="font-mono text-xs text-slate-300 flex-1 min-w-0 truncate">{it.docNumber}</span>
                  <span className="text-right">
                    <span className="block text-slate-200 font-mono">${fmt(it.netUsd)}</span>
                    {it.bsToday != null && <span className="block text-[11px] text-slate-500 font-mono">Bs {fmt(it.bsToday)}</span>}
                  </span>
                  <span className="w-44 text-[11px] text-right">
                    {it.blockedReason
                      ? <span className="text-red-400">{it.blockedReason}</span>
                      : it.bankExportedAt
                        ? <span className="text-amber-400">Exportado {new Date(it.bankExportedAt).toLocaleDateString('es-VE')} · Bs {fmt(it.bankExportAmountBs ?? 0)}</span>
                        : null}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700/50 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="text-sm text-slate-300 flex-1">
            {data?.rate ? <>Tasa hoy: <span className="font-mono">{fmtRate(data.rate)}</span> · </> : null}
            {chosen.length} doc. · <span className="font-mono text-green-400">Bs {fmt(totalBs)}</span>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button onClick={onClose} className="btn-secondary">Cancelar</button>
            <button onClick={download} disabled={!chosen.length || downloading || !data?.rate} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
              {downloading ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />} Descargar Excel
            </button>
          </div>
        </div>
        <p className="px-4 pb-4 text-[11px] text-slate-500">En el Excel, copia desde la celda A2 de la hoja “Pagos” y pégalo en la celda C14 de la plantilla de Bancaribe. La hoja “Afiliacion” sirve para afiliar proveedores nuevos.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `page.tsx`** — importar `FileSpreadsheet` de lucide-react y `BankExportModal` from `./bank-export-modal`; agregar estado `const [showBankExport, setShowBankExport] = useState(false);`; agregar `bankExportedAt?: string | null; bankExportAmountBs?: number | null;` a `ScheduleItem`; agregar el botón justo antes del `<div className="relative">` del menú Reportes:

```tsx
          {schedule.status !== 'CANCELLED' && (
            <button
              onClick={() => setShowBankExport(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
            >
              <FileSpreadsheet size={16} className="text-green-400" />
              Exportar a Bancaribe
            </button>
          )}
```

Al final del JSX, antes del `</div>` de cierre de la página:

```tsx
      {showBankExport && (
        <BankExportModal scheduleId={schedule.id} onClose={() => setShowBankExport(false)} onExported={fetchSchedule} />
      )}
```

Y en la celda de tipo (junto al badge "Pagado"):

```tsx
                            {!item.isPaid && item.bankExportedAt && (
                              <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-400 border-amber-500/20" title={`Bs ${fmt(item.bankExportAmountBs ?? 0)}`}>
                                Exportado {new Date(item.bankExportedAt).toLocaleDateString('es-VE')}
                              </span>
                            )}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p .`
Expected: sin errores.

- [ ] **Step 4: Prueba manual end-to-end**
1. Proveedor con cuenta válida + RIF válido en una programación.
2. Abrir `/payment-schedules/<id>` → "Exportar a Bancaribe": el proveedor sin datos aparece deshabilitado con "Sin cuenta bancaria"; el válido seleccionable con Bs = neto USD × tasa hoy.
3. Descargar: hoja Pagos con una fila por proveedor; Monto con 2 decimales; Cuenta como texto (20 dígitos con ceros).
4. Pegar A2:H2 en C14 de la plantilla real de Bancaribe → "Validar" da OK → "Generar TXT" crea el archivo.
5. Volver al detalle: badge "Exportado <fecha>"; al re-exportar pide confirmación.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/payment-schedules/[id]"
git commit -m "feat: Session 150 - programacion de pagos: modal Exportar a Bancaribe"
```

---

### Task 8: Cierre

- [ ] `git push origin main`
- [ ] Actualizar `PROGRESS.md` y `PROJECT.md` (Sesión 149 + toda la Sesión 150), commit `docs: Session 150 - ...` y push.
- [ ] Deploy según CLAUDE.md (pre-deploy checklist: migración commiteada, fix-schema.sql actualizado).
