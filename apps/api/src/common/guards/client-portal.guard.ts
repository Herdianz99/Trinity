import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PORTAL_ALLOWED_KEY } from '../decorators/portal-allowed.decorator';

/**
 * Candado del portal de clientes (rol CLIENT). Corre como guard GLOBAL (APP_GUARD), ANTES
 * que el AuthGuard('jwt') de cada controlador, por eso decodifica el token por su cuenta:
 *  - Sin token / token invalido / rol distinto de CLIENT -> no hace nada (el resto de roles
 *    queda exactamente igual; el AuthGuard de la ruta decide como siempre).
 *  - Rol CLIENT -> LISTA BLANCA: solo rutas marcadas con @PortalAllowed(). Todo lo demas da
 *    403, aunque la ruta no tenga candado propio (la mayoria del API solo exige JWT).
 *  - Rol CLIENT con el portal apagado en /config -> 403 en todo.
 */
@Injectable()
export class ClientPortalGuard implements CanActivate {
  private readonly jwt = new JwtService();

  constructor(
    private reflector: Reflector,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) return true;

    let payload: any;
    try {
      payload = this.jwt.verify(header.slice(7), {
        secret: this.config.get('JWT_SECRET', 'default-secret'),
      });
    } catch {
      return true; // token vencido/invalido: lo rechaza el AuthGuard de la ruta (401)
    }
    if (payload?.role !== 'CLIENT') return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(PORTAL_ALLOWED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) {
      throw new ForbiddenException('Esta opción no está disponible en el portal de clientes.');
    }

    const cfg = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { clientPortalEnabled: true },
    });
    if (!cfg?.clientPortalEnabled) {
      throw new ForbiddenException({ code: 'PORTAL_DISABLED', message: 'El portal de clientes no está habilitado.' });
    }
    return true;
  }
}
