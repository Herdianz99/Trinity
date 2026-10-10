import { SetMetadata } from '@nestjs/common';

export const PORTAL_ALLOWED_KEY = 'portal_allowed';

/**
 * Marca rutas que un usuario rol CLIENT (portal de pedidos) SI puede llamar.
 * Todo lo demas le da 403 (ClientPortalGuard). No afecta a ningun otro rol.
 */
export const PortalAllowed = () => SetMetadata(PORTAL_ALLOWED_KEY, true);
