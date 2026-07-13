import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryPayablesDto } from './dto/query-payables.dto';
import { CreatePayableDto } from './dto/create-payable.dto';
import { caracasDateKey, caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { nextRetentionSeq, formatRetentionNumber } from '../../common/retention-number';

@Injectable()
export class PayablesService {
  constructor(private readonly prisma: PrismaService) {}

  // Eliminar una CxP manual (no proveniente de factura de compra) si no fue cruzada/pagada.
  async remove(id: string) {
    const p = await this.prisma.payable.findUnique({
      where: { id },
      include: { payments: true, receiptItems: true, paymentScheduleItems: true },
    });
    if (!p) throw new NotFoundException('Cuenta por pagar no encontrada');
    if (p.purchaseOrderId) {
      throw new BadRequestException('Solo se pueden eliminar CxP manuales; las de una factura de compra se gestionan desde la factura');
    }
    if (p.status === 'PAID' || p.status === 'PARTIAL' || (p.paidAmountUsd || 0) > 0 || p.payments.length > 0 || p.receiptItems.length > 0) {
      throw new BadRequestException('No se puede eliminar: la CxP ya fue cruzada o pagada en un recibo');
    }
    if (p.paymentScheduleItems.length > 0) {
      throw new BadRequestException('No se puede eliminar: la CxP esta incluida en una programacion de pagos');
    }
    await this.prisma.$transaction(async (tx) => {
      // Borrar el/los comprobante(s) de retencion IVA creados junto a esta CxP (las lineas del
      // comprobante se borran en cascada). Si el comprobante era el ULTIMO emitido, devolver el
      // correlativo para no quemar el numero (importante al continuar la numeracion del sistema viejo).
      const retLines = await tx.retentionVoucherLine.findMany({
        where: { payableId: id },
        select: { retentionVoucherId: true },
      });
      const voucherIds = [
        ...new Set(retLines.map((l) => l.retentionVoucherId).filter((x): x is string => !!x)),
      ];
      if (voucherIds.length > 0) {
        const vouchers = await tx.retentionVoucher.findMany({
          where: { id: { in: voucherIds } },
          select: { number: true },
        });
        await tx.retentionVoucher.deleteMany({ where: { id: { in: voucherIds } } });

        const cfg = await tx.companyConfig.findUnique({
          where: { id: 'singleton' },
          select: { retentionNextNumber: true },
        });
        if (cfg) {
          // consecutivo = ultimos 8 digitos del numero (formato YYYYMM + 8 digitos)
          const consecutivos = vouchers
            .map((v) => parseInt((v.number || '').slice(-8), 10))
            .filter((n) => !Number.isNaN(n));
          const maxCons = consecutivos.length ? Math.max(...consecutivos) : 0;
          if (maxCons > 0 && maxCons === cfg.retentionNextNumber - 1) {
            await tx.companyConfig.update({
              where: { id: 'singleton' },
              data: { retentionNextNumber: maxCons },
            });
          }
        }
      }

      await tx.purchaseBookEntry.deleteMany({ where: { payableId: id } });
      await tx.payable.delete({ where: { id } });
    });
    return { message: 'Cuenta por pagar eliminada' };
  }

  // Busca otra CxP (NO facturas de compra) con el mismo N° de documento del proveedor.
  // Solo contra Payable a proposito: una factura de compra y una CxP pueden compartir numero.
  private async findDuplicatePayable(
    supplierId: string | undefined,
    documentNumber: string | null | undefined,
    excludeId?: string,
  ) {
    const doc = documentNumber?.trim();
    if (!supplierId || !doc) return null;
    return this.prisma.payable.findFirst({
      where: { supplierId, documentNumber: doc, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, number: true, createdAt: true },
    });
  }

  /** Chequeo liviano para el frontend: avisar CxP duplicada al escribir, sin crear nada. */
  async checkDuplicateDocument(supplierId: string, documentNumber: string) {
    const dup = await this.findDuplicatePayable(supplierId, documentNumber);
    return dup ? { duplicate: true, id: dup.id, number: dup.number } : { duplicate: false };
  }

  async create(dto: CreatePayableDto, userId?: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    // Evitar cargar dos veces la misma CxP del mismo proveedor (solo contra CxP).
    const dupDoc = await this.findDuplicatePayable(dto.supplierId, dto.documentNumber);
    if (dupDoc) {
      throw new BadRequestException(
        `Ya existe una CxP con el documento N° ${dto.documentNumber!.trim()} para este proveedor (cargada como ${dupDoc.number || 'CxP'}). Verifique antes de volver a cargarla.`,
      );
    }

    // Tasa: la que envia el usuario (editable) tiene prioridad; si no, la registrada de hoy
    let r: number;
    if (dto.exchangeRate && dto.exchangeRate > 0) {
      r = dto.exchangeRate;
    } else {
      const today = caracasDateKey();
      const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
      if (!rate) throw new BadRequestException('No hay tasa de cambio registrada para hoy');
      r = rate.rate;
    }

    // Resolve serie and fiscal status
    let serie: any = null;
    let isFiscal = false;
    if (dto.serieId) {
      serie = await this.prisma.serie.findUnique({ where: { id: dto.serieId } });
      if (!serie) throw new BadRequestException('Serie no encontrada');
      if (serie.type !== 'PURCHASES') throw new BadRequestException('La serie debe ser de tipo COMPRAS');
      isFiscal = serie.isFiscal;
    }

    const currency = dto.currency || 'USD';

    // Fiscal breakdown in input currency
    const exemptBase = dto.exemptBase || 0;
    const taxableBase8 = dto.taxableBase8 || 0;
    const taxableBase16 = dto.taxableBase16 || 0;
    const taxableBase31 = dto.taxableBase31 || 0;

    // Auto-calculate IVA
    const iva8 = Math.round(taxableBase8 * 0.08 * 100) / 100;
    const iva16 = Math.round(taxableBase16 * 0.16 * 100) / 100;
    const iva31 = Math.round(taxableBase31 * 0.31 * 100) / 100;
    const totalIva = Math.round((iva8 + iva16 + iva31) * 100) / 100;

    // IGTF
    const igtfPct = dto.igtfPct || 0;
    const subtotal = exemptBase + taxableBase8 + taxableBase16 + taxableBase31 + totalIva;
    const igtf = Math.round(subtotal * (igtfPct / 100) * 100) / 100;
    const total = Math.round((subtotal + igtf) * 100) / 100;

    // Convert to both currencies
    const toUsd = (val: number) => currency === 'USD' ? val : Math.round((val / r) * 100) / 100;
    const toBs = (val: number) => currency === 'USD' ? Math.round((val * r) * 100) / 100 : val;

    const amountUsd = toUsd(total);
    const amountBs = toBs(total);

    // For manual CxP, retention is handled as a separate document
    const retentionUsd = 0;
    const retentionBs = 0;
    const netPayableUsd = amountUsd;
    const netPayableBs = amountBs;

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const originalDate = dto.originalDate ? new Date(dto.originalDate) : null;
    const receptionDate = dto.receptionDate ? new Date(dto.receptionDate) : null;

    return this.prisma.$transaction(async (tx) => {
      // Generate correlative number
      const config = await tx.companyConfig.findUnique({
        where: { id: 'singleton' },
      });
      // @ts-ignore - field just added
      const nextNum = config?.payableNextNumber || 1;
      const yearSuffix = new Date().getFullYear().toString().slice(-2);
      const number = `CXP/${yearSuffix}-${nextNum.toString().padStart(6, '0')}`;

      await tx.companyConfig.update({
        where: { id: 'singleton' },
        data: { payableNextNumber: nextNum + 1 } as any,
      });

      const payable = await tx.payable.create({
        data: {
          number,
          supplierId: dto.supplierId,
          purchaseOrderId: null,
          documentNumber: dto.documentNumber || null,
          description: dto.description || null,
          amountUsd,
          amountBs,
          exchangeRate: r,
          retentionUsd,
          retentionBs,
          netPayableUsd,
          netPayableBs,
          dueDate,
          notes: dto.notes || null,
          serieId: dto.serieId || null,
          serieProveedor: dto.serie || null,
          controlFiscal: dto.controlFiscal || null,
          currency,
          originalDate,
          receptionDate,
          paymentTerms: dto.paymentTerms || null,
          exemptBaseUsd: toUsd(exemptBase),
          exemptBaseBs: toBs(exemptBase),
          taxableBase8Usd: toUsd(taxableBase8),
          taxableBase8Bs: toBs(taxableBase8),
          taxableBase16Usd: toUsd(taxableBase16),
          taxableBase16Bs: toBs(taxableBase16),
          taxableBase31Usd: toUsd(taxableBase31),
          taxableBase31Bs: toBs(taxableBase31),
          iva8Usd: toUsd(iva8),
          iva8Bs: toBs(iva8),
          iva16Usd: toUsd(iva16),
          iva16Bs: toBs(iva16),
          iva31Usd: toUsd(iva31),
          iva31Bs: toBs(iva31),
          totalIvaUsd: toUsd(totalIva),
          totalIvaBs: toBs(totalIva),
          igtfPct,
          igtfUsd: toUsd(igtf),
          igtfBs: toBs(igtf),
          createdById: userId || null,
        },
        include: {
          supplier: { select: { id: true, name: true, rif: true } },
          serie: { select: { id: true, name: true, isFiscal: true } },
        },
      });

      // If fiscal (determined by serie), create PurchaseBookEntry
      if (isFiscal && userId) {
        const totalBsForBook = toBs(total);
        const exemptBs = toBs(exemptBase);
        const taxableBs = toBs(taxableBase8 + taxableBase16 + taxableBase31);
        const ivaBs = toBs(totalIva);

        await tx.purchaseBookEntry.create({
          data: {
            payableId: payable.id,
            // Periodo del libro = fecha recepcion (cuando se declara). Display = fecha original.
            entryDate: receptionDate || originalDate || new Date(),
            documentDate: originalDate || receptionDate || new Date(),
            supplierControlNumber: dto.controlFiscal || null,
            supplierInvoiceNumber: dto.documentNumber || number,
            supplierSerie: dto.serie || null,
            supplierName: supplier.name,
            supplierRif: supplier.rif || '',
            exemptAmountBs: exemptBs,
            taxableBaseBs: taxableBs,
            ivaAmountBs: ivaBs,
            totalBs: totalBsForBook,
            isManual: true,
            createdById: userId,
          },
        });
      }

      // If createRetention requested and fiscal, create RetentionVoucher
      if (dto.createRetention && isFiscal && userId && totalIva > 0) {
        const retPct = dto.retentionPct ?? (config as any)?.ivaRetentionPct ?? 75;

        // Calculate retention amounts
        const totalIvaUsd = toUsd(totalIva);
        const totalIvaBs = toBs(totalIva);
        const retAmountUsd = Math.round(totalIvaUsd * (retPct / 100) * 100) / 100;
        const retAmountBs = Math.round(totalIvaBs * (retPct / 100) * 100) / 100;

        // Numero de retencion auto-sanable: evita colision si el contador quedo por
        // detras de un numero ya emitido (ver common/retention-number.ts)
        const retNextNum = await nextRetentionSeq(tx);
        const retNumber = formatRetentionNumber(retNextNum);

        await tx.companyConfig.update({
          where: { id: 'singleton' },
          data: { retentionNextNumber: retNextNum + 1 } as any,
        });

        // Taxable base for retention line (sum of all taxable bases)
        const taxableBaseTotalCurr = taxableBase8 + taxableBase16 + taxableBase31;

        const retentionVoucher = await tx.retentionVoucher.create({
          data: {
            number: retNumber,
            supplierId: dto.supplierId,
            serieId: dto.serieId || null,
            status: 'ISSUED',
            // La retencion se declara con su documento (periodo de recepcion)
            issueDate: receptionDate || originalDate || new Date(),
            retentionPct: retPct,
            retentionAmountUsd: retAmountUsd,
            retentionAmountBs: retAmountBs,
            exchangeRate: r,
            notes: `Retencion IVA ${retPct}% sobre CxP ${number}`,
            createdById: userId,
            lines: {
              create: {
                payableId: payable.id,
                supplierInvoiceNumber: dto.documentNumber || null,
                supplierControlNumber: dto.controlFiscal || null,
                invoiceDate: originalDate || new Date(),
                invoiceTotalUsd: amountUsd,
                invoiceTotalBs: amountBs,
                taxableBaseUsd: toUsd(taxableBaseTotalCurr),
                taxableBaseBs: toBs(taxableBaseTotalCurr),
                ivaAmountUsd: totalIvaUsd,
                ivaAmountBs: totalIvaBs,
                retentionPct: retPct,
                retentionAmountUsd: retAmountUsd,
                retentionAmountBs: retAmountBs,
                exchangeRate: r,
                isManual: true,
              },
            },
          },
        });

        // Create PurchaseBookEntry for retention (negative line)
        await tx.purchaseBookEntry.create({
          data: {
            retentionVoucherId: retentionVoucher.id,
            retentionVoucherNumber: retNumber,
            payableId: payable.id,
            // Misma fecha que su factura: periodo recepcion, display original
            entryDate: receptionDate || originalDate || new Date(),
            documentDate: originalDate || receptionDate || new Date(),
            supplierControlNumber: dto.controlFiscal || null,
            supplierInvoiceNumber: dto.documentNumber || number,
            supplierName: supplier.name,
            supplierRif: supplier.rif || '',
            exemptAmountBs: 0,
            taxableBaseBs: 0,
            ivaAmountBs: -retAmountBs,
            totalBs: -retAmountBs,
            isRetentionLine: true,
            isManual: true,
            createdById: userId,
          },
        });

        // NOTA: la retencion NO reduce el neto de la CxP. El neteo se hace en el recibo
        // de pago seleccionando la CxP (+) y este comprobante (-). El neto queda = monto.
      }

      // Retencion ISLR inline (documento aparte, NO reduce el neto)
      // Base imponible ISLR = solo bases gravables (sin exento ni IVA). El exento no es
      // ingreso del proveedor por el concepto (ej. valor nominal de tickets de alimentacion).
      const islrBaseCurr = taxableBase8 + taxableBase16 + taxableBase31;
      if (dto.createIslrRetention && dto.islrRetentionTypeId && isFiscal && userId && islrBaseCurr > 0) {
        const tipo = await tx.islrRetentionType.findUnique({ where: { id: dto.islrRetentionTypeId } });
        if (!tipo) throw new BadRequestException('Tipo de retencion ISLR no encontrado');

        const valorUT = (config as any)?.unidadTributaria ?? 43;
        const baseUsd = toUsd(islrBaseCurr);
        const baseBs = toBs(islrBaseCurr);

        let sustraendoBs = 0;
        if (tipo.sustraendoUt > 0 && supplier.supplierType === 'NATURAL_RESIDENTE') {
          sustraendoBs = Math.round(tipo.sustraendoUt * valorUT * 100) / 100;
        }
        const baseAjustadaBs = baseBs * (tipo.baseImponiblePct / 100);
        const retBs = Math.max(0, Math.round((baseAjustadaBs * (tipo.retentionPct / 100) - sustraendoBs) * 100) / 100);
        const baseAjustadaUsd = baseUsd * (tipo.baseImponiblePct / 100);
        const sustraendoUsd = r > 0 ? Math.round((sustraendoBs / r) * 100) / 100 : 0;
        const retUsd = Math.max(0, Math.round((baseAjustadaUsd * (tipo.retentionPct / 100) - sustraendoUsd) * 100) / 100);

        const islrNext = (config as any)?.islrRetentionNextNumber || 1;
        // Numero de retencion ISLR: secuencia "pelada". A diferencia del comprobante de IVA,
        // el de ISLR no exige el formato AAAAMM+consecutivo del SENIAT.
        const islrNumber = `${islrNext}`;
        await tx.companyConfig.update({
          where: { id: 'singleton' },
          data: { islrRetentionNextNumber: islrNext + 1 } as any,
        });

        const islrVoucher = await tx.islrRetentionVoucher.create({
          data: {
            number: islrNumber,
            supplierId: dto.supplierId,
            serieId: dto.serieId || null,
            status: 'ISSUED',
            issueDate: receptionDate || originalDate || new Date(),
            retentionAmountUsd: retUsd,
            retentionAmountBs: retBs,
            exchangeRate: r,
            unidadTributaria: valorUT,
            notes: `Retencion ISLR sobre CxP ${number}`,
            createdById: userId,
            lines: {
              create: {
                payableId: payable.id,
                islrRetentionTypeId: tipo.id,
                supplierInvoiceNumber: dto.documentNumber || null,
                supplierControlNumber: dto.controlFiscal || null,
                invoiceDate: originalDate || new Date(),
                invoiceTotalUsd: amountUsd,
                invoiceTotalBs: amountBs,
                taxableBaseUsd: baseUsd,
                taxableBaseBs: baseBs,
                baseImponiblePct: tipo.baseImponiblePct,
                retentionPct: tipo.retentionPct,
                sustraendoUt: tipo.sustraendoUt,
                sustraendoBs,
                retentionAmountUsd: retUsd,
                retentionAmountBs: retBs,
                exchangeRate: r,
                isManual: false,
              },
            },
          },
        });

        await tx.purchaseBookEntry.create({
          data: {
            islrRetentionVoucherId: islrVoucher.id,
            islrRetentionVoucherNumber: islrNumber,
            payableId: payable.id,
            entryDate: receptionDate || originalDate || new Date(),
            documentDate: originalDate || receptionDate || new Date(),
            supplierControlNumber: dto.controlFiscal || null,
            supplierInvoiceNumber: dto.documentNumber || number,
            supplierName: supplier.name,
            supplierRif: supplier.rif || '',
            exemptAmountBs: 0,
            taxableBaseBs: 0,
            ivaAmountBs: 0,
            islrRetentionAmountBs: retBs,
            totalBs: -retBs,
            isIslrRetentionLine: true,
            isManual: true,
            createdById: userId,
          },
        });
      }

      return payable;
    });
  }

  async getNextNumber() {
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const nextNum = (config as any)?.payableNextNumber || 1;
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    return { nextNumber: `CXP/${yearSuffix}-${nextNum.toString().padStart(6, '0')}` };
  }

  private buildWhere(query: QueryPayablesDto): any {
    const where: any = {};

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = caracasDayStart(query.from);
      }
      if (query.to) {
        where.createdAt.lte = caracasDayEnd(query.to);
      }
    }
    if (query.overdue) {
      // Vencida = fecha pasada y aun no pagada. Incluye OVERDUE (ya marcada por el cron)
      // Y las PENDING/PARTIAL que el cron todavia no marco, para no dejar ninguna fuera.
      const now = caracasDateKey();
      where.dueDate = { lt: now };
      where.status = { in: ['PENDING', 'PARTIAL', 'OVERDUE'] };
    } else if (query.dueWithinDays !== undefined && query.dueWithinDays !== null && !Number.isNaN(query.dueWithinDays)) {
      // Proximas a vencer: dueDate entre el inicio de hoy y el fin del dia (hoy+N) en
      // hora Caracas (aun no vencidas, no pagadas). El dueDate lleva hora, por eso se
      // usan los limites de dia-Caracas (no la medianoche-UTC de caracasDateKey).
      const start = caracasDayStart();
      const end = caracasDayEnd(new Date(Date.now() + query.dueWithinDays * 24 * 60 * 60 * 1000));
      where.dueDate = { gte: start, lte: end };
      where.status = { in: ['PENDING', 'PARTIAL'] };
    }
    return where;
  }

  async findAll(query: QueryPayablesDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.payable.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
          serie: { select: { id: true, name: true, isFiscal: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, amountUsd: true, createdAt: true, receiptId: true, method: { select: { id: true, name: true } }, receipt: { select: { id: true, number: true } } },
          },
        },
      }),
      this.prisma.payable.count({ where }),
    ]);

    const enriched = data.map((p) => ({
      ...p,
      balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Todos los registros que matchean el filtro (sin paginar), para el reporte PDF.
  async findAllForReport(query: QueryPayablesDto) {
    const where = this.buildWhere(query);
    const data = await this.prisma.payable.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, number: true } },
      },
    });
    return data.map((p) => ({
      ...p,
      balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
    }));
  }

  async findOne(id: string) {
    const payable = await this.prisma.payable.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseOrder: {
          select: { id: true, number: true, supplierInvoiceNumber: true, totalUsd: true, createdAt: true },
        },
        serie: { select: { id: true, name: true, isFiscal: true } },
        retentionVoucherLines: {
          include: {
            retentionVoucher: { select: { id: true, number: true, status: true, retentionAmountUsd: true, retentionAmountBs: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            method: true,
            receipt: { select: { id: true, number: true } },
          },
        },
      },
    });
    if (!payable) throw new NotFoundException('Cuenta por pagar no encontrada');
    return {
      ...payable,
      balanceUsd: Math.round((payable.netPayableUsd - payable.paidAmountUsd) * 100) / 100,
    };
  }

  async summary() {
    const pending = await this.prisma.payable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    let totalRetentionUsd = 0;
    const supplierMap: Record<string, { supplierName: string; totalUsd: number; count: number }> = {};
    // Vencida = fecha de vencimiento ya pasada (no depende del status OVERDUE del cron),
    // asi la tarjeta coincide con el filtro "Solo vencidas".
    const todayKey = caracasDateKey();

    for (const p of pending) {
      const balance = p.netPayableUsd - p.paidAmountUsd;
      totalPendingUsd += balance;

      if (p.dueDate && p.dueDate < todayKey) {
        totalOverdueUsd += balance;
      }

      if (p.retentionUsd > 0) {
        totalRetentionUsd += p.retentionUsd;
      }

      if (!supplierMap[p.supplierId]) {
        supplierMap[p.supplierId] = {
          supplierName: p.supplier.name,
          totalUsd: 0,
          count: 0,
        };
      }
      supplierMap[p.supplierId].totalUsd += balance;
      supplierMap[p.supplierId].count += 1;
    }

    return {
      totalPendingUsd: Math.round(totalPendingUsd * 100) / 100,
      totalOverdueUsd: Math.round(totalOverdueUsd * 100) / 100,
      totalRetentionUsd: Math.round(totalRetentionUsd * 100) / 100,
      supplierCount: Object.keys(supplierMap).length,
      bySupplier: Object.values(supplierMap).map((s) => ({
        supplierName: s.supplierName,
        totalUsd: Math.round(s.totalUsd * 100) / 100,
        count: s.count,
      })),
    };
  }

  async findBySupplier(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const payables = await this.prisma.payable.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      include: {
        purchaseOrder: { select: { id: true, number: true } },
        serie: { select: { id: true, name: true, isFiscal: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, amountUsd: true, createdAt: true, method: { select: { id: true, name: true } } },
        },
      },
    });

    const pending = payables.filter((p) =>
      ['PENDING', 'PARTIAL', 'OVERDUE'].includes(p.status),
    );
    const totalDebt = pending.reduce((sum, p) => sum + (p.netPayableUsd - p.paidAmountUsd), 0);
    // Vencida = fecha pasada y no pagada (coincide con la tarjeta y el filtro).
    const todayKey = caracasDateKey();
    const totalOverdue = pending
      .filter((p) => p.dueDate && p.dueDate < todayKey)
      .reduce((sum, p) => sum + (p.netPayableUsd - p.paidAmountUsd), 0);
    const totalRetention = pending.reduce((sum, p) => sum + p.retentionUsd, 0);

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        rif: supplier.rif,
        isRetentionAgent: supplier.isRetentionAgent,
      },
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      totalRetention: Math.round(totalRetention * 100) / 100,
      payables: payables.map((p) => ({
        ...p,
        balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
      })),
    };
  }

  async markOverdue(): Promise<number> {
    const now = caracasDateKey();

    const result = await this.prisma.payable.updateMany({
      where: {
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      data: { status: 'OVERDUE' },
    });

    return result.count;
  }
}
