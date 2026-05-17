import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { UserRole } from '@prisma/client';

const VALID_MODULES = [
  'dashboard', 'sales', 'quotations', 'catalog', 'inventory',
  'purchases', 'cash', 'receivables', 'payables', 'fiscal',
  'users', 'settings', 'expenses', 'payment-schedules',
  'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE',
  'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE',
  'MANAGE_EXPENSES',
];

const CACHE_PREFIX = 'role-permissions:';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class RolePermissionsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAll() {
    const existing = await this.prisma.rolePermission.findMany({
      orderBy: { role: 'asc' },
    });

    // Ensure all roles from the enum have a record
    const existingRoles = new Set(existing.map((rp) => rp.role));
    const allRoles = Object.values(UserRole);
    const missing = allRoles.filter((r) => !existingRoles.has(r));

    if (missing.length > 0) {
      const { ROLE_PERMISSIONS } = await import('../auth/role-permissions');
      for (const role of missing) {
        const modules = ROLE_PERMISSIONS[role] || ['dashboard'];
        const created = await this.prisma.rolePermission.create({
          data: { role, modules: modules.includes('*') ? VALID_MODULES : modules },
        });
        existing.push(created);
      }
      existing.sort((a, b) => a.role.localeCompare(b.role));
    }

    return existing;
  }

  async getModulesForRole(role: UserRole): Promise<string[]> {
    // Try cache first
    const cached = await this.redis.get(`${CACHE_PREFIX}${role}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Read from DB
    const rp = await this.prisma.rolePermission.findUnique({ where: { role } });
    const modules = rp?.modules || ['dashboard'];

    // Cache it
    await this.redis.set(`${CACHE_PREFIX}${role}`, JSON.stringify(modules), CACHE_TTL);
    return modules;
  }

  async update(role: UserRole, modules: string[]) {
    if (role === 'ADMIN') {
      throw new BadRequestException('No se pueden modificar los permisos del rol ADMIN');
    }

    // Validate modules
    const invalid = modules.filter((m) => !VALID_MODULES.includes(m));
    if (invalid.length > 0) {
      throw new BadRequestException(`Modulos invalidos: ${invalid.join(', ')}`);
    }

    const updated = await this.prisma.rolePermission.upsert({
      where: { role },
      update: { modules },
      create: { role, modules },
    });

    // Invalidate cache for this role
    await this.redis.del(`${CACHE_PREFIX}${role}`);

    return updated;
  }
}
