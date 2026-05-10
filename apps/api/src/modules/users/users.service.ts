import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PermissionKey } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(crypto.randomInt(chars.length));
  }
  return password;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('El email ya esta registrado');

    const tempPassword = dto.password || generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        role: dto.role,
        isActive: dto.isActive ?? true,
        mustChangePassword: true,
      },
    });
    const { password, ...result } = user;
    return { ...result, temporaryPassword: tempPassword };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return users;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const { password, ...rest } = user;
    return rest;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== id) {
        throw new ConflictException('El email ya esta registrado');
      }
    }
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const user = await this.prisma.user.update({ where: { id }, data });
    const { password, ...result } = user;
    return result;
  }

  async resetPassword(id: string) {
    await this.findOne(id);
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword, mustChangePassword: true },
    });
    return { temporaryPassword: tempPassword };
  }

  async toggleActive(id: string) {
    const user = await this.findOne(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });
    const { password, ...result } = updated;
    return result;
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({
        where: { role: 'ADMIN', isActive: true },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('No se puede eliminar el ultimo administrador del sistema');
      }
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuario eliminado' };
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
