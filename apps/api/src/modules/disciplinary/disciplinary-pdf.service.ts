import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const LEVEL_LABEL: Record<string, string> = {
  LLAMADO: 'LLAMADO DE ATENCIÓN',
  NOTIFICACION: 'NOTIFICACIÓN',
  AMONESTACION: 'AMONESTACIÓN',
};
const fmtDate = (d: Date) => new Date(d).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });

@Injectable()
export class DisciplinaryPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(id: string): Promise<Buffer> {
    const a = await this.prisma.disciplinaryAction.findUnique({
      where: { id },
      include: {
        faultType: { select: { name: true } },
        employee: {
          include: {
            customer: { select: { name: true, documentType: true, rif: true } },
            position: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    });
    if (!a) throw new NotFoundException('Llamado no encontrado');

    const c = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { companyName: true, rif: true },
    });
    const company = { name: c?.companyName || 'Trinity', rif: c?.rif || '' };

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (ch) => chunks.push(ch as Buffer));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const L = 50;
    const W = doc.page.width - 100;
    let y = 50;

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000').text(company.name, L, y, { width: W, align: 'center' });
    y += 17;
    if (company.rif) {
      doc.fontSize(9).font('Helvetica').fillColor('#333').text(`RIF: ${company.rif}`, L, y, { width: W, align: 'center' });
      y += 14;
    }
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#b91c1c').text(LEVEL_LABEL[a.level] || a.level, L, y, { width: W, align: 'center' });
    y += 22;
    doc.moveTo(L, y).lineTo(L + W, y).stroke('#999');
    y += 14;

    const cust = a.employee.customer;
    doc.fillColor('#111');
    const row = (label: string, value: string) => {
      doc.fontSize(10).font('Helvetica-Bold').text(label, L, y, { width: 140 });
      doc.font('Helvetica').text(value, L + 140, y, { width: W - 140 });
      y += 16;
    };
    row('N° de acta:', a.number);
    row('Empleado:', cust?.name || '-');
    row('Cédula:', cust ? `${cust.documentType || 'V'}-${cust.rif || ''}` : '-');
    row('Cargo:', a.employee.position?.name || '-');
    row('Departamento:', a.employee.department?.name || '-');
    row('Tipo de falta:', a.faultType.name);
    row('Nivel:', LEVEL_LABEL[a.level] || a.level);
    row('Fecha del suceso:', fmtDate(a.occurredAt));
    y += 8;

    doc.fontSize(10).font('Helvetica-Bold').text('Motivo / Descripción:', L, y);
    y += 15;
    doc.font('Helvetica').fillColor('#111').text(a.reason, L, y, { width: W });
    y += Math.max(40, doc.heightOfString(a.reason, { width: W })) + 30;

    // Firmas al pie
    const sigY = Math.max(y, doc.page.height - 130);
    const half = W / 2;
    doc.moveTo(L, sigY).lineTo(L + half - 20, sigY).stroke('#333');
    doc.moveTo(L + half + 20, sigY).lineTo(L + W, sigY).stroke('#333');
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text('Firma del empleado', L, sigY + 4, { width: half - 20, align: 'center' });
    doc.text('Firma del supervisor / RRHH', L + half + 20, sigY + 4, { width: half - 20, align: 'center' });

    doc.end();
    return done;
  }
}
