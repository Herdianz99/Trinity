import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IvaType } from '@prisma/client';

const IVA_RATES: Record<IvaType, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

@Injectable()
export class FiscalService {
  constructor(private readonly prisma: PrismaService) {}

  async libroVentas(from: string, to: string) {
    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: 'PAID',
        createdAt: { gte: fromDate, lte: toDate },
      },
      include: {
        customer: { select: { id: true, name: true, rif: true, documentType: true } },
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalBaseExenta = 0;
    let totalBaseReducida = 0;
    let totalBaseGeneral = 0;
    let totalBaseEspecial = 0;
    let totalIvaReducido = 0;
    let totalIvaGeneral = 0;
    let totalIvaEspecial = 0;
    let totalIgtf = 0;
    let totalFacturas = 0;

    const rows = invoices.map((inv, index) => {
      let baseExenta = 0;
      let baseReducida = 0;
      let baseGeneral = 0;
      let baseEspecial = 0;
      let ivaReducido = 0;
      let ivaGeneral = 0;
      let ivaEspecial = 0;

      for (const item of inv.items) {
        const base = item.unitPrice * item.quantity;
        const iva = item.ivaAmount;

        switch (item.ivaType) {
          case 'EXEMPT':
            baseExenta += base;
            break;
          case 'REDUCED':
            baseReducida += base;
            ivaReducido += iva;
            break;
          case 'GENERAL':
            baseGeneral += base;
            ivaGeneral += iva;
            break;
          case 'SPECIAL':
            baseEspecial += base;
            ivaEspecial += iva;
            break;
        }
      }

      totalBaseExenta += baseExenta;
      totalBaseReducida += baseReducida;
      totalBaseGeneral += baseGeneral;
      totalBaseEspecial += baseEspecial;
      totalIvaReducido += ivaReducido;
      totalIvaGeneral += ivaGeneral;
      totalIvaEspecial += ivaEspecial;
      totalIgtf += inv.igtfUsd;
      totalFacturas += inv.totalUsd;

      return {
        numero: index + 1,
        fecha: inv.createdAt,
        numeroFactura: inv.number,
        numeroControl: inv.controlNumber || '',
        rifCliente: inv.customer
          ? `${inv.customer.documentType}-${inv.customer.rif || 'S/R'}`
          : 'S/R',
        nombreCliente: inv.customer?.name || 'Cliente General',
        tipoPago: inv.paymentType,
        baseImponibleExenta: round2(baseExenta),
        baseImponibleReducida: round2(baseReducida),
        baseImponibleGeneral: round2(baseGeneral),
        baseImponibleEspecial: round2(baseEspecial),
        ivaReducido: round2(ivaReducido),
        ivaGeneral: round2(ivaGeneral),
        ivaEspecial: round2(ivaEspecial),
        igtf: inv.igtfUsd,
        totalFactura: inv.totalUsd,
      };
    });

    return {
      periodo: { from: fromDate, to: toDate },
      rows,
      totales: {
        totalFacturas: invoices.length,
        baseImponibleExenta: round2(totalBaseExenta),
        baseImponibleReducida: round2(totalBaseReducida),
        baseImponibleGeneral: round2(totalBaseGeneral),
        baseImponibleEspecial: round2(totalBaseEspecial),
        ivaReducido: round2(totalIvaReducido),
        ivaGeneral: round2(totalIvaGeneral),
        ivaEspecial: round2(totalIvaEspecial),
        igtf: round2(totalIgtf),
        totalVentas: round2(totalFacturas),
      },
    };
  }

  async libroCompras(from: string, to: string) {
    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    // Now reads from PurchaseBookEntry instead of PurchaseOrder directly
    const entries = await this.prisma.purchaseBookEntry.findMany({
      where: {
        entryDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { entryDate: 'asc' },
    });

    let totalExento = 0;
    let totalBaseImponible = 0;
    let totalCreditoFiscal = 0;
    let totalRetentionIva = 0;
    let totalCompras = 0;

    const rows = entries.map((entry, index) => {
      totalExento += entry.exemptAmountBs;
      totalBaseImponible += entry.taxableBaseBs;
      totalCreditoFiscal += entry.ivaAmountBs;
      totalRetentionIva += entry.retentionAmountBs;
      totalCompras += entry.totalBs;

      return {
        numero: index + 1,
        fecha: entry.entryDate,
        numeroControl: entry.supplierControlNumber || '',
        numeroFactura: entry.supplierInvoiceNumber || '',
        nombreProveedor: entry.supplierName,
        rifProveedor: entry.supplierRif || 'S/R',
        comprasExentas: round2(entry.exemptAmountBs),
        baseImponible: round2(entry.taxableBaseBs),
        creditoFiscal: round2(entry.ivaAmountBs),
        comprobanteRetencion: entry.retentionVoucherNumber || '',
        retencionIva: round2(entry.retentionAmountBs),
        total: round2(entry.totalBs),
      };
    });

    return {
      periodo: { from: fromDate, to: toDate },
      rows,
      totales: {
        totalOrdenes: entries.length,
        comprasExentas: round2(totalExento),
        baseImponible: round2(totalBaseImponible),
        creditoFiscal: round2(totalCreditoFiscal),
        retencionIva: round2(totalRetentionIva),
        totalCompras: round2(totalCompras),
      },
    };
  }

  async resumen(from: string, to: string) {
    const ventas = await this.libroVentas(from, to);
    const compras = await this.libroCompras(from, to);

    const ventasTotales = ventas.totales;
    const comprasTotales = compras.totales;

    const ivaDebitoFiscal =
      ventasTotales.ivaReducido + ventasTotales.ivaGeneral + ventasTotales.ivaEspecial;
    const ivaCreditoFiscal = comprasTotales.creditoFiscal;

    return {
      ventas: {
        totalFacturas: ventasTotales.totalFacturas,
        baseImponibleTotal: round2(
          ventasTotales.baseImponibleExenta +
            ventasTotales.baseImponibleReducida +
            ventasTotales.baseImponibleGeneral +
            ventasTotales.baseImponibleEspecial,
        ),
        ivaTotal: round2(ivaDebitoFiscal),
        totalVentas: ventasTotales.totalVentas,
      },
      compras: {
        totalOrdenes: comprasTotales.totalOrdenes,
        baseImponibleTotal: round2(
          comprasTotales.comprasExentas + comprasTotales.baseImponible,
        ),
        ivaTotal: round2(ivaCreditoFiscal),
        retencionesIva: comprasTotales.retencionIva,
        totalCompras: comprasTotales.totalCompras,
      },
      balance: {
        ivaDebitoFiscal: round2(ivaDebitoFiscal),
        ivaCreditoFiscal: round2(ivaCreditoFiscal),
        ivaPorPagar: round2(ivaDebitoFiscal - ivaCreditoFiscal),
      },
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
