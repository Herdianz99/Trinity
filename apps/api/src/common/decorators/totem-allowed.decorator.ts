import { SetMetadata } from '@nestjs/common';

export const TOTEM_ALLOWED_KEY = 'totem_allowed';

/**
 * Marca rutas que un usuario rol TOTEM (pantalla Clover del piso de venta) SI puede llamar.
 * Todo lo demas le da 403 (TotemGuard). No afecta a ningun otro rol.
 */
export const TotemAllowed = () => SetMetadata(TOTEM_ALLOWED_KEY, true);
