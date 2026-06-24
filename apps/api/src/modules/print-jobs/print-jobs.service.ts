import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ListPrintJobsDto } from './dto/list-print-jobs.dto';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

@Injectable()
export class PrintJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async findPending(printAreaId: string) {
    return this.prisma.printJob.findMany({
      where: {
        printAreaId,
        status: 'PENDING',
      },
      include: {
        invoice: { select: { id: true, number: true } },
        printArea: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markPrinted(id: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Trabajo de impresion no encontrado');

    return this.prisma.printJob.update({
      where: { id },
      data: { status: 'PRINTED' },
    });
  }

  async markFailed(id: string, reason?: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Trabajo de impresion no encontrado');

    return this.prisma.printJob.update({
      where: { id },
      data: {
        status: 'FAILED',
        failureReason: reason?.slice(0, 500) ?? null,
      },
    });
  }

  /**
   * Reserva atomica de una comanda: solo tiene exito si seguia PENDING.
   * Pasa la comanda a PRINTING. Si varias pestanas/PCs de la misma zona
   * consultan a la vez, solo UNA obtiene count === 1; las demas reciben
   * false y no imprimen. Asi se evita la impresion duplicada.
   */
  async claim(id: string): Promise<{ claimed: boolean }> {
    const result = await this.prisma.printJob.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PRINTING' },
    });
    return { claimed: result.count === 1 };
  }

  async findAll(query: ListPrintJobsDto) {
    const where: any = {};

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = caracasDayStart(query.from);
      }
      if (query.to) {
        where.createdAt.lte = caracasDayEnd(query.to);
      }
    }

    if (query.printAreaId) where.printAreaId = query.printAreaId;
    if (query.status) where.status = query.status;
    if (query.invoiceNumber) {
      where.invoice = {
        number: { contains: query.invoiceNumber, mode: 'insensitive' },
      };
    }

    return this.prisma.printJob.findMany({
      where,
      include: {
        invoice: { select: { id: true, number: true } },
        printArea: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /**
   * Reimprime TODAS las comandas de una factura. Por cada zona toma la comanda
   * mas reciente y crea un clon nuevo (isReprint=true, status=PENDING) que la
   * PC de esa zona imprimira en su siguiente poll. Devuelve cuantas zonas se
   * reencolaron. Multi-tabla -> transaccion.
   */
  async reprintByInvoice(invoiceId: string): Promise<{ zones: number }> {
    const jobs = await this.prisma.printJob.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });

    if (jobs.length === 0) {
      throw new NotFoundException('Esta factura no tiene comandas');
    }

    // Una comanda (la mas reciente) por zona
    const byArea = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) {
      if (!byArea.has(job.printAreaId)) byArea.set(job.printAreaId, job);
    }

    const originals = Array.from(byArea.values());

    await this.prisma.$transaction(
      originals.map((job) =>
        this.prisma.printJob.create({
          data: {
            invoiceId: job.invoiceId,
            printAreaId: job.printAreaId,
            items: job.items as any,
            isReprint: true,
            reprintOfId: job.id,
            status: 'PENDING',
          },
        }),
      ),
    );

    return { zones: originals.length };
  }
}
