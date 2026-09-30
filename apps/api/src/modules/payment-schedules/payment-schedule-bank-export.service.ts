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
