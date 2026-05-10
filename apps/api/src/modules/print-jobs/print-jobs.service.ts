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
}
