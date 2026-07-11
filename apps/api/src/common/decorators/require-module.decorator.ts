import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MODULE_KEY = 'require_module';

/**
 * Exige que el rol del usuario tenga habilitado AL MENOS UNO de los modulos/permisos
 * indicados (segun la configuracion de "Permisos por rol").
 * Ej: @RequireModule('inventory') o @RequireModule('inventory', 'inventory-consult').
 */
export const RequireModule = (...modules: string[]) => SetMetadata(REQUIRE_MODULE_KEY, modules);
