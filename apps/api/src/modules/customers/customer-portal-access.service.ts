import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail } from '../../common/email';
import { generateTempPassword } from '../../common/temp-password';
import { CreatePortalAccessDto, UpdatePortalAccessDto } from './dto/portal-access.dto';

const USER_SELECT = {
  id: true, email: true, name: true, isActive: true, lastLoginAt: true, mustChangePassword: true,
} as const;

// Usuario rol CLIENT vinculado a una ficha de cliente (portal de pedidos).
@Injectable()
export class CustomerPortalAccessService {
  constructor(private prisma: PrismaService) {}

  private async assertCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async get(customerId: string) {
    await this.assertCustomer(customerId);
    const user = await this.prisma.user.findUnique({ where: { customerId }, select: USER_SELECT });
    return { user };
  }

  async create(customerId: string, dto: CreatePortalAccessDto) {
    const customer = await this.assertCustomer(customerId);
    if (await this.prisma.user.findUnique({ where: { customerId } })) {
      throw new ConflictException('Este cliente ya tiene acceso al portal');
    }
    const email = normalizeEmail(dto.email);
    const dup = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (dup) throw new ConflictException('El email ya esta registrado');

    const temporaryPassword = generateTempPassword();
    const user = await this.prisma.user.create({
      data: {
        name: customer.name,
        email,
        password: await bcrypt.hash(temporaryPassword, 10),
        role: 'CLIENT',
        customerId,
        isActive: true,
        mustChangePassword: true,
      },
      select: USER_SELECT,
    });
    return { user, temporaryPassword };
  }

  async update(customerId: string, dto: UpdatePortalAccessDto) {
    const user = await this.prisma.user.findUnique({ where: { customerId } });
    if (!user) throw new NotFoundException('Este cliente no tiene acceso al portal');
    const data: Prisma.UserUpdateInput = {};
    let temporaryPassword: string | undefined;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.resetPassword) {
      temporaryPassword = generateTempPassword();
      data.password = await bcrypt.hash(temporaryPassword, 10);
      data.mustChangePassword = true;
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data, select: USER_SELECT });
    return { user: updated, temporaryPassword };
  }
}
