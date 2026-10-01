import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { isValidVeAccount } from '../../common/bancaribe';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  // Cuenta bancaria: se guarda solo con digitos; vacia -> null. Invalida -> error
  // (mismo algoritmo modulo 11 que la plantilla de Bancaribe).
  private normalizeBankAccount(raw: string | null | undefined): string | null | undefined {
    if (raw === undefined) return undefined;
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (!isValidVeAccount(digits)) {
      throw new BadRequestException('La cuenta bancaria no es válida (debe tener 20 dígitos y dígito verificador correcto)');
    }
    return digits;
  }

  private normalizeRif(rif: string): string {
    return rif.replace(/[-\s]/g, '').toUpperCase();
  }

  private async checkDuplicateRif(rif: string | undefined | null, excludeId?: string) {
    if (!rif || !rif.trim()) return;
    const normalized = this.normalizeRif(rif);
    if (!normalized) return;

    const where: any = {
      isActive: true,
      rif: { not: null },
    };
    if (excludeId) where.id = { not: excludeId };

    const suppliers = await this.prisma.supplier.findMany({
      where,
      select: { id: true, name: true, rif: true },
    });

    const match = suppliers.find(s => {
      if (!s.rif) return false;
      return this.normalizeRif(s.rif) === normalized;
    });

    if (match) {
      throw new BadRequestException(`Ya existe un proveedor activo con este RIF: ${match.name} (${match.rif})`);
    }
  }

  async create(dto: CreateSupplierDto) {
    await this.checkDuplicateRif(dto.rif);
    const bankAccount = this.normalizeBankAccount(dto.bankAccount);
    return this.prisma.supplier.create({ data: { ...dto, bankAccount } });
  }

  // isActive='true' -> solo activos (selectores para crear compras/gastos/CxP); 'false' -> solo
  // inactivos; sin el parametro -> todos (listado de proveedores, filtros de reportes).
  async findAll(query?: { search?: string; isRetentionAgent?: string; isActive?: string; limit?: string }) {
    const where: any = {};
    if (query?.isActive === 'true') where.isActive = true;
    if (query?.isActive === 'false') where.isActive = false;

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { rif: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query?.isRetentionAgent === 'true') where.isRetentionAgent = true;
    if (query?.isRetentionAgent === 'false') where.isRetentionAgent = false;

    return this.prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      take: query?.limit ? Number(query.limit) : undefined,
      include: { _count: { select: { products: true } } },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        islrConcept: { select: { id: true, codigo: true, descripcion: true } },
        _count: { select: { products: true, purchaseOrders: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const existing = await this.findOne(id);
    await this.checkDuplicateRif(dto.rif ?? existing.rif, id);
    const bankAccount = this.normalizeBankAccount(dto.bankAccount);
    return this.prisma.supplier.update({
      where: { id },
      data: { ...dto, ...(bankAccount !== undefined ? { bankAccount } : {}) },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
