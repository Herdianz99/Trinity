import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { UserRole } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../auth/role-permissions';

export const VALID_MODULES = [
  'dashboard', 'sales', 'commands', 'quotations', 'catalog', 'inventory',
  'inventory-consult',
  'purchases', 'pedidos', 'cash', 'receivables', 'payables', 'fiscal',
  'users', 'settings', 'expenses', 'payment-schedules', 'store', 'payroll', 'incidents', 'divisas', 'bancos', 'almacen', 'exhibicion', 'mi-perfil', 'pedidos-clientes', 'portal', 'chatbot', 'chatbot-config', 'bitacora-precios', 'campana-whatsapp',
  'RETURN_INVOICE', 'CREDIT_NOTE_SALE', 'DEBIT_NOTE_SALE',
  'RETURN_PURCHASE', 'CREDIT_NOTE_PURCHASE', 'DEBIT_NOTE_PURCHASE',
  'MANAGE_EXPENSES', 'MANAGE_EXCHANGE_RATE', 'MANAGE_CUSTOMER_CREDIT',
];

const CACHE_PREFIX = 'role-permissions:';
const USER_EXTRA_PREFIX = 'user-extra-modules:';
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

    // Read from DB. Si el rol aún no tiene registro (p.ej. recién agregado al enum),
    // caer al mapa de permisos por defecto en vez de solo 'dashboard', para que el
    // rol tenga sus módulos esperados desde el primer login (sin esperar al seed).
    const rp = await this.prisma.rolePermission.findUnique({ where: { role } });
    let modules: string[];
    if (rp) {
      modules = rp.modules;
    } else {
      const def = ROLE_PERMISSIONS[role] || ['dashboard'];
      modules = def.includes('*') ? VALID_MODULES : def;
    }

    // Cache it
    await this.redis.set(`${CACHE_PREFIX}${role}`, JSON.stringify(modules), CACHE_TTL);
    return modules;
  }

  /**
   * Modulos efectivos de un usuario = los de su rol + sus modulos extra (User.extraModules).
   * Es la fuente para el token (middleware/menu web), /auth/me y los guards del API.
   */
  async getModulesForUser(userId: string, role: UserRole): Promise<string[]> {
    const roleModules = await this.getModulesForRole(role);
    if (roleModules.includes('*')) return roleModules;
    const extra = await this.getUserExtraModules(userId);
    if (extra.length === 0) return roleModules;
    return Array.from(new Set([...roleModules, ...extra]));
  }

  private async getUserExtraModules(userId: string): Promise<string[]> {
    const cached = await this.redis.get(`${USER_EXTRA_PREFIX}${userId}`);
    if (cached) return JSON.parse(cached);
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { extraModules: true } });
    const extra = (u?.extraModules ?? []).filter((m) => VALID_MODULES.includes(m));
    await this.redis.set(`${USER_EXTRA_PREFIX}${userId}`, JSON.stringify(extra), CACHE_TTL);
    return extra;
  }

  async invalidateUser(userId: string) {
    await this.redis.del(`${USER_EXTRA_PREFIX}${userId}`);
  }

  async update(role: UserRole, modules: string[]) {
    if (role === 'ADMIN') {
      throw new BadRequestException('No se pueden modificar los permisos del rol ADMIN');
    }

    // Filtrar modulos desconocidos (ej. keys legacy como 'reports' que quedaron guardados en un
    // rol) en vez de rechazar TODO el guardado con 400. Se conservan solo los validos.
    const cleaned = modules.filter((m) => VALID_MODULES.includes(m));

    const updated = await this.prisma.rolePermission.upsert({
      where: { role },
      update: { modules: cleaned },
      create: { role, modules: cleaned },
    });

    // Invalidate cache for this role
    await this.redis.del(`${CACHE_PREFIX}${role}`);

    return updated;
  }
}
