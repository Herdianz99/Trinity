// Lee la configuracion del puente desde variables de entorno. Opt-in:
// si falta PARTNER_API_URL o los tokens, el modulo queda dormido (isEnabled=false).
export interface IntegrationConfig {
  partnerApiUrl: string;
  partnerApiToken: string;
  integrationToken: string;
  partnerName: string;
  selfCode: string;
}

export function getIntegrationConfig(): IntegrationConfig {
  return {
    partnerApiUrl: (process.env.PARTNER_API_URL || '').replace(/\/+$/, ''),
    partnerApiToken: process.env.PARTNER_API_TOKEN || '',
    integrationToken: process.env.INTEGRATION_TOKEN || '',
    partnerName: process.env.PARTNER_NAME || 'Empresa socia',
    selfCode: process.env.SELF_CODE || 'SELF',
  };
}

// Puedo LLAMAR al socio si tengo URL + token de salida.
export function canCallPartner(cfg = getIntegrationConfig()): boolean {
  return !!cfg.partnerApiUrl && !!cfg.partnerApiToken;
}

// ACEPTO llamadas del socio si tengo token de entrada configurado.
export function canReceivePartner(cfg = getIntegrationConfig()): boolean {
  return !!cfg.integrationToken;
}
