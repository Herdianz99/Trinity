import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SetEmployeeStatusDto, QueryEmployeesDto } from './dto/set-employee-status.dto';
import { EMPLOYEE_STATUS_KEYS, statusInPayroll } from './employee-status';

const EMPLOYEE_INCLUDE = {
  customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true, defaultSalaryUsd: true, defaultBonusUsd: true } },
};

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  /** Normaliza la cédula/RIF igual que CustomersService: sin separadores, mayúsculas. */
  private normalizeRif(rif?: string | null): string {
    return (rif || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

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

  /** Filtros del listado (también los usan los reportes Excel/PDF). */
  buildWhere(query?: QueryEmployeesDto) {
    const where: any = {};
    if (query?.isActive === 'true') where.isActive = true;
    if (query?.isActive === 'false') where.isActive = false;
    if (query?.departmentId) where.departmentId = query.departmentId;
    const statuses = (query?.status || '').split(',').map((x) => x.trim()).filter((x) => (EMPLOYEE_STATUS_KEYS as string[]).includes(x));
    if (statuses.length) where.status = { in: statuses };
    if (query?.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { position: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { rif: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  async findAll(query?: QueryEmployeesDto) {
    return this.prisma.employee.findMany({
      where: this.buildWhere(query),
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
        const nc = dto.newCustomer;
        const docType = nc.documentType || 'V';

        // Dedupe por cédula: si ya existe una ficha con ese documento (activa o inactiva),
        // REUTILIZARLA en vez de crear una duplicada. Este hueco causaba dos fichas por
        // persona (una de nómina + la de cliente). Ver también CustomersService.checkDuplicateRif.
        const normalized = this.normalizeRif(nc.rif);
        if (normalized) {
          const candidates = await tx.customer.findMany({
            where: { rif: { not: null } },
            select: { id: true, name: true, rif: true, documentType: true },
          });
          const match = candidates.find(
            (c) => c.rif && this.normalizeRif(c.rif) === normalized && c.documentType === docType,
          );
          if (match) {
            const existingEmp = await tx.employee.findUnique({ where: { customerId: match.id } });
            if (existingEmp) {
              throw new BadRequestException(
                `Ya existe un cliente con esa cédula que está registrado como empleado: ${match.name} (${existingEmp.code || existingEmp.id})`,
              );
            }
            await tx.customer.update({ where: { id: match.id }, data: { isEmployee: true } });
            customerId = match.id;
          }
        }

        // No había ficha con esa cédula → crear una nueva.
        if (!customerId) {
          const created = await tx.customer.create({
            data: {
              name: nc.name,
              documentType: docType,
              rif: nc.rif || null,
              phone: nc.phone || null,
              isEmployee: true,
            },
          });
          customerId = created.id;
        }
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
          status: dto.isActive === false ? 'INACTIVE' : 'ACTIVE',
        },
        include: EMPLOYEE_INCLUDE,
      });
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    // isActive suelto (compatibilidad): se traduce a estado Activo/Inactivo para no desincronizarlos.
    const { isActive, ...rest } = dto;
    const data: any = { ...rest };
    if (isActive !== undefined) Object.assign(data, this.statusData({ status: isActive ? 'ACTIVE' : 'INACTIVE' }));
    return this.prisma.employee.update({
      where: { id },
      data,
      include: EMPLOYEE_INCLUDE,
    });
  }

  async toggleActive(id: string) {
    const employee = await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: this.statusData({ status: employee.isActive ? 'INACTIVE' : 'ACTIVE' }),
      include: EMPLOYEE_INCLUDE,
    });
  }

  /** Campos a guardar para un estado. isActive = entra en nómina. Fechas date-only (medianoche UTC). */
  private statusData(dto: SetEmployeeStatusDto) {
    const keepDetail = dto.status !== 'ACTIVE';
    const from = keepDetail && dto.statusFrom ? new Date(dto.statusFrom.slice(0, 10)) : null;
    const to = keepDetail && dto.statusTo ? new Date(dto.statusTo.slice(0, 10)) : null;
    if (from && to && to < from) throw new BadRequestException('La fecha "hasta" no puede ser anterior a "desde"');
    return {
      status: dto.status,
      isActive: statusInPayroll(dto.status),
      statusFrom: from,
      statusTo: to,
      statusNote: keepDetail ? dto.statusNote?.trim() || null : null,
    };
  }

  async setStatus(id: string, dto: SetEmployeeStatusDto) {
    await this.findOne(id);
    return this.prisma.employee.update({
      where: { id },
      data: this.statusData(dto),
      include: EMPLOYEE_INCLUDE,
    });
  }
}
