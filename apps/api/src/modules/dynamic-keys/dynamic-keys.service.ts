import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDynamicKeyDto } from './dto/create-dynamic-key.dto';
import { UpdateDynamicKeyDto } from './dto/update-dynamic-key.dto';
import { ValidateKeyDto } from './dto/validate-key.dto';
import * as bcrypt from 'bcrypt';
import { DynamicKeyPerm } from '@prisma/client';

const VALID_PERMS = Object.values(DynamicKeyPerm);

@Injectable()
export class DynamicKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const keys = await this.prisma.dynamicKey.findMany({
      include: {
        permissions: { select: { permission: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { logs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      isActive: k.isActive,
      permissions: k.permissions.map((p) => p.permission),
      createdBy: k.createdBy,
      logCount: k._count.logs,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    }));
  }

  async findLogs(
    id: string,
    filters: { from?: string; to?: string; page?: number; limit?: number },
  ) {
    const key = await this.prisma.dynamicKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Clave no encontrada');

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const where: any = { dynamicKeyId: id };

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.dynamicKeyLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dynamicKeyLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(dto: CreateDynamicKeyDto, userId: string) {
    // Validate permissions
    for (const perm of dto.permissions) {
      if (!VALID_PERMS.includes(perm as DynamicKeyPerm)) {
        throw new BadRequestException(`Permiso invalido: ${perm}`);
      }
    }

    const keyHash = await bcrypt.hash(dto.key, 10);

    return this.prisma.dynamicKey.create({
      data: {
        name: dto.name,
        keyHash,
        createdById: userId,
        permissions: {
          create: dto.permissions.map((p) => ({
            permission: p as DynamicKeyPerm,
          })),
        },
      },
      include: {
        permissions: { select: { permission: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateDynamicKeyDto) {
    const existing = await this.prisma.dynamicKey.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Clave no encontrada');

    // Validate permissions
    for (const perm of dto.permissions) {
      if (!VALID_PERMS.includes(perm as DynamicKeyPerm)) {
        throw new BadRequestException(`Permiso invalido: ${perm}`);
      }
    }

    const data: any = { name: dto.name };
    if (dto.key) {
      data.keyHash = await bcrypt.hash(dto.key, 10);
    }

    return this.prisma.$transaction(async (tx) => {
      // Delete old permissions and recreate
      await tx.dynamicKeyPermission.deleteMany({ where: { dynamicKeyId: id } });

      return tx.dynamicKey.update({
        where: { id },
        data: {
          ...data,
          permissions: {
            create: dto.permissions.map((p) => ({
              permission: p as DynamicKeyPerm,
            })),
          },
        },
        include: {
          permissions: { select: { permission: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });
    });
  }

  async toggleActive(id: string) {
    const key = await this.prisma.dynamicKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Clave no encontrada');

    return this.prisma.dynamicKey.update({
      where: { id },
      data: { isActive: !key.isActive },
    });
  }

  async remove(id: string) {
    const key = await this.prisma.dynamicKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('Clave no encontrada');

    return this.prisma.dynamicKey.delete({ where: { id } });
  }

  async validate(dto: ValidateKeyDto) {
    if (!VALID_PERMS.includes(dto.permission as DynamicKeyPerm)) {
      throw new BadRequestException(`Permiso invalido: ${dto.permission}`);
    }

    // Get all active keys
    const activeKeys = await this.prisma.dynamicKey.findMany({
      where: { isActive: true },
      include: { permissions: { select: { permission: true } } },
    });

    // Compare against each key
    for (const dynamicKey of activeKeys) {
      const match = await bcrypt.compare(dto.key, dynamicKey.keyHash);
      if (!match) continue;

      // Key matched — check permission
      const hasPermission = dynamicKey.permissions.some(
        (p) => p.permission === dto.permission,
      );

      if (!hasPermission) {
        throw new UnauthorizedException(
          'Clave correcta pero sin permisos para esta accion',
        );
      }

      // Authorized — create log
      await this.prisma.dynamicKeyLog.create({
        data: {
          dynamicKeyId: dynamicKey.id,
          permission: dto.permission as DynamicKeyPerm,
          action: dto.action,
          entityType: dto.entityType || null,
          entityId: dto.entityId || null,
        },
      });

      return { authorized: true, keyName: dynamicKey.name };
    }

    // No key matched
    throw new UnauthorizedException('Clave incorrecta');
  }
}
