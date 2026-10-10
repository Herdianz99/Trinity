import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { normalizeEmail } from '../../common/email';
import { IpAccessService } from '../../common/ip-access.service';
import { RedisService } from '../../redis/redis.service';

// Limite de intentos fallidos de login por IP + correo (no solo IP: los empleados del local
// comparten la IP publica y un limite por IP bloquearia a todos por los errores de uno).
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_S = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private rolePermissionsService: RolePermissionsService,
    private ipAccess: IpAccessService,
    private redis: RedisService,
  ) {}

  private loginFailKey(ip: string | undefined, email: string) {
    return `login-fail:${ip || 'noip'}:${normalizeEmail(email)}`;
  }

  // Un CLIENT solo entra si el portal esta encendido y su ficha de cliente existe y esta activa.
  private async assertClientCanLogin(customerId: string | null) {
    const cfg = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { clientPortalEnabled: true },
    });
    if (!cfg?.clientPortalEnabled) throw new ForbiddenException('El portal de clientes no está habilitado.');
    if (!customerId) throw new ForbiddenException('Tu usuario no está vinculado a un cliente.');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { isActive: true } });
    if (!customer?.isActive) throw new ForbiddenException('Tu ficha de cliente está inactiva.');
  }

  async login(email: string, password: string, ip?: string) {
    const failKey = this.loginFailKey(ip, email);
    const fails = Number(await this.redis.get(failKey)) || 0;
    if (fails >= LOGIN_MAX_FAILS) {
      throw new HttpException(
        'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const registerFail = () => this.redis.set(failKey, String(fails + 1), LOGIN_WINDOW_S);

    // Busqueda case-insensitive: el casing del email no debe impedir entrar.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } },
    });
    if (!user) {
      await registerFail();
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Usuario inactivo');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await registerFail();
      throw new UnauthorizedException('Credenciales invalidas');
    }
    await this.redis.del(failKey);

    if (user.role === 'CLIENT') await this.assertClientCanLogin(user.customerId);

    // IP-lock ("acceso solo en sitio"): bloquea solo si el usuario esta restringido, no es
    // ADMIN, hay whitelist configurada y la IP no esta permitida. Inerte por defecto.
    if (await this.ipAccess.shouldBlock(ip || '', { restrict: user.restrictToOnSiteIp, role: user.role })) {
      throw new ForbiddenException({
        code: 'OFFSITE_BLOCKED',
        message: 'Acceso permitido solo desde el local.',
      });
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
      restrictToOnSiteIp: user.restrictToOnSiteIp,
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
      if (user.role === 'CLIENT') await this.assertClientCanLogin(user.customerId);
      const permissions = await this.rolePermissionsService.getModulesForRole(user.role);
      const newPayload = {
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions,
        mustChangePassword: user.mustChangePassword,
        // Sin esto el IP-lock dejaba de aplicar tras el primer refresco del token.
        restrictToOnSiteIp: user.restrictToOnSiteIp,
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
      include: { seller: { select: { id: true, name: true, code: true } } },
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
