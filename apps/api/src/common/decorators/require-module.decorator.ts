import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MODULE_KEY = 'require_module';

/**
 * Exige que el rol del usuario tenga habilitado un modulo/permiso (segun la
 * configuracion de "Permisos por rol"). Ej: @RequireModule('inventory').
 */
export const RequireModule = (module: string) => SetMetadata(REQUIRE_MODULE_KEY, module);
