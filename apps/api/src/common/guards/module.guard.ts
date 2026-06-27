import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';
import { RolePermissionsService } from '../../modules/role-permissions/role-permissions.service';

/**
 * Bloquea el acceso si el rol del usuario no tiene el modulo requerido
 * (respeta la configuracion de "Permisos por rol", igual que el menu).
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rolePermissions: RolePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    const modules = await this.rolePermissions.getModulesForRole(user.role);
    if (modules.includes('*') || modules.includes(required)) return true;

    throw new ForbiddenException('No tienes permiso para esta accion');
  }
}
