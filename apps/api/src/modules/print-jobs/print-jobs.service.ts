import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

  /**
   * Reserva atomica de una comanda: solo tiene exito si seguia PENDING.
   * Si varias pestanas/PCs de la misma zona consultan a la vez, solo UNA
   * obtiene count === 1; las demas reciben false y no imprimen. Asi se
   * evita la impresion duplicada de la misma comanda.
   */
  async claim(id: string): Promise<{ claimed: boolean }> {
    const result = await this.prisma.printJob.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PRINTED' },
    });
    return { claimed: result.count === 1 };
  }
}
