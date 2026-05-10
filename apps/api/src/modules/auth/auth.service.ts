import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private rolePermissionsService: RolePermissionsService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Usuario inactivo');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const permissions = await this.rolePermissionsService.getModulesForRole(user.role);
    const payload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions,
      mustChangePassword: user.mustChangePassword,
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions,
        mustChangePassword: user.mustChangePassword,
      },
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'default-refresh-secret'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET', 'default-refresh-secret'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) {
        throw new UnauthorizedException();
      }
      const permissions = await this.rolePermissionsService.getModulesForRole(user.role);
      const newPayload = {
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions,
        mustChangePassword: user.mustChangePassword,
      };
      return {
        accessToken: this.jwtService.sign(newPayload),
        refreshToken: this.jwtService.sign(newPayload, {
          secret: this.configService.get('JWT_REFRESH_SECRET', 'default-refresh-secret'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', '7d'),
        }),
      };
    } catch {
      throw new UnauthorizedException('Token de refresco invalido');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new UnauthorizedException();
    const { password, ...result } = user;
    return {
      ...result,
      permissions: await this.rolePermissionsService.getModulesForRole(user.role),
    };
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (!user.mustChangePassword) {
      if (!currentPassword) {
        throw new BadRequestException('Debe proporcionar la contrasena actual');
      }
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        throw new BadRequestException('Contrasena actual incorrecta');
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, mustChangePassword: false },
    });

    return { message: 'Contrasena actualizada exitosamente' };
  }
}
