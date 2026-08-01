import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { getIntegrationConfig, canReceivePartner } from './integration.config';

// Protege los endpoints ENTRANTES de integracion. Valida el header
// X-Integration-Token contra INTEGRATION_TOKEN. Separado del JWT de usuarios.
@Injectable()
export class IntegrationTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const cfg = getIntegrationConfig();
    if (!canReceivePartner(cfg)) {
      throw new UnauthorizedException('Integracion no habilitada');
    }
    const req = context.switchToHttp().getRequest();
    const token = req.headers['x-integration-token'];
    if (!token || token !== cfg.integrationToken) {
      throw new UnauthorizedException('Token de integracion invalido');
    }
    return true;
  }
}
