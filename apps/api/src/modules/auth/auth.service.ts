import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { permissions: { select: { permissionKey: true } } },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions.map((p) => p.permissionKey),
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
      const newPayload = { sub: user.id, email: user.email, role: user.role };
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
      include: { permissions: { select: { permissionKey: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const { password, permissions, ...result } = user;
    return {
      ...result,
      permissions: permissions.map((p) => p.permissionKey),
    };
  }
}
