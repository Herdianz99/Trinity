import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePayrollParamDto } from './dto/update-payroll-param.dto';

const SINGLETON = 'singleton';

@Injectable()
export class PayrollParamsService {
  constructor(private prisma: PrismaService) {}

  // Devuelve el singleton, creándolo con los defaults del schema si aún no existe.
  async get() {
    const existing = await this.prisma.payrollParam.findUnique({ where: { id: SINGLETON } });
    if (existing) return existing;
    return this.prisma.payrollParam.create({ data: { id: SINGLETON } });
  }

  async update(dto: UpdatePayrollParamDto) {
    return this.prisma.payrollParam.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...dto },
      update: dto,
    });
  }
}
