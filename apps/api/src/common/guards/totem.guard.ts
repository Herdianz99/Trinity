import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TOTEM_ALLOWED_KEY } from '../decorators/totem-allowed.decorator';

/**
 * Candado del rol TOTEM (Sesion 189). Guard GLOBAL igual que ClientPortalGuard: corre antes del
 * AuthGuard de cada ruta y decodifica el token por su cuenta.
 *  - Sin token / invalido / otro rol -> no hace nada.
 *  - Rol TOTEM -> LISTA BLANCA: solo rutas con @TotemAllowed(). Asi la pantalla del piso de venta no
 *    puede leer conversaciones de WhatsApp, productos con costo, etc., aunque alguien lo intente.
 */
@Injectable()
export class TotemGuard implements CanActivate {
  private readonly jwt = new JwtService();

  constructor(private reflector: Reflector, private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const header: string | undefined = context.switchToHttp().getRequest().headers?.authorization;
    if (!header || !header.startsWith('Bearer ')) return true;

    let payload: any;
    try {
      payload = this.jwt.verify(header.slice(7), { secret: this.config.get('JWT_SECRET', 'default-secret') });
    } catch {
      return true; // vencido/invalido: lo rechaza el AuthGuard de la ruta (401)
    }
    if (payload?.role !== 'TOTEM') return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(TOTEM_ALLOWED_KEY, [context.getHandler(), context.getClass()]);
    if (!allowed) throw new ForbiddenException('Esta opción no está disponible en el tótem.');
    return true;
  }
}
