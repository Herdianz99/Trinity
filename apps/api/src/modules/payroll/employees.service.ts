import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const EMPLOYEE_INCLUDE = {
  customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true, defaultSalaryUsd: true, defaultBonusUsd: true } },
};

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  private async generateCode(): Promise<string> {
    const last = await this.prisma.employee.findFirst({
      where: { code: { not: null } },
      orderBy: { code: 'desc' },
    });
    let next = 1;
    if (last?.code) {
      const m = last.code.match(/EMP-(\d+)/);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return `EMP-${next.toString().padStart(4, '0')}`;
  }

  async findAll(query?: { search?: string; isActive?: string; departmentId?: string }) {
    const where: any = {};
    if (query?.isActive === 'true') where.isActive = true;
    if (query?.isActive === 'false') where.isActive = false;
    if (query?.departmentId) where.departmentId = query.departmentId;
    if (query?.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { position: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { rif: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.employee.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      include: EMPLOYEE_INCLUDE,
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: EMPLOYEE_INCLUDE,
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Resolver la ficha Customer: enlazar una existente o crear una nueva.
      let customerId = dto.customerId;
      if (!customerId) {
        if (!dto.newCustomer?.name) {
          throw new BadRequestException('Debe enlazar un cliente existente o ingresar los datos de uno nuevo');
        }
        const created = await tx.customer.create({
          data: {
            name: dto.newCustomer.name,
            documentType: dto.newCustomer.documentType || 'V',
            rif: dto.newCustomer.rif || null,
            phone: dto.newCustomer.phone || null,
            isEmployee: true,
          },
        });
        customerId = created.id;
      } else {
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new BadRequestException('El cliente seleccionado no existe');
        // Ya empleado?
        const existing = await tx.employee.findUnique({ where: { customerId } });
        if (existing) {
          throw new BadRequestException(`Ese cliente ya está registrado como empleado (${existing.code || existing.id})`);
        }
        await tx.customer.update({ where: { id: customerId }, data: { isEmployee: true } });
      }

      // 2. Crear el empleado con correlativo EMP-####.
      const code = await this.generateCode();
      return tx.employee.create({
        data: {
          code,
          customerId,
          departmentId: dto.departmentId || null,
          positionId: dto.positionId || null,
          bank: dto.bank || null,
          salaryBaseUsd: dto.salaryBaseUsd ?? 0,
          bonusUsd: dto.bonusUsd ?? 0,
          frequency: dto.frequency || 'WEEKLY',
          isActive: dto.isActive ?? true,
        },
        include: EMPLOYEE_INCLUDE,
      });
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: dto,
      include: EMPLOYEE_INCLUDE,
    });
  }

  async toggleActive(id: string) {
    const employee = await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: { isActive: !employee.isActive },
      include: EMPLOYEE_INCLUDE,
    });
  }
}
