import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

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

  async findAll(query?: { search?: string; isActive?: string; department?: string }) {
    const where: any = {};
    if (query?.isActive === 'true') where.isActive = true;
    if (query?.isActive === 'false') where.isActive = false;
    if (query?.department) where.department = query.department;
    if (query?.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { cargo: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { rif: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.employee.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      include: {
        customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
      },
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
      },
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
          department: dto.department,
          cargo: dto.cargo || null,
          bank: dto.bank || null,
          salaryBaseUsd: dto.salaryBaseUsd ?? 0,
          frequency: dto.frequency || 'WEEKLY',
          isActive: dto.isActive ?? true,
        },
        include: {
          customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
        },
      });
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: dto,
      include: {
        customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
      },
    });
  }

  async toggleActive(id: string) {
    const employee = await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: { isActive: !employee.isActive },
      include: {
        customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
      },
    });
  }
}
