import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PermissionKey } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('El email ya está registrado');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
    });
    const { password, ...result } = user;
    return result;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        permissions: { select: { permissionKey: true } },
      },
    });
    return users.map((u) => ({
      ...u,
      permissions: u.permissions.map((p) => p.permissionKey),
    }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { permissions: { select: { permissionKey: true } } },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const { password, permissions, ...rest } = user;
    return {
      ...rest,
      permissions: permissions.map((p) => p.permissionKey),
    };
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }
    const user = await this.prisma.user.update({ where: { id }, data });
    const { password, ...result } = user;
    return result;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { message: 'Usuario desactivado' };
  }

  async setPermissions(userId: string, permissionKeys: PermissionKey[]) {
    await this.findOne(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });
      if (permissionKeys.length > 0) {
        await tx.userPermission.createMany({
          data: permissionKeys.map((key) => ({ userId, permissionKey: key })),
        });
      }
    });

    return this.findOne(userId);
  }
}
