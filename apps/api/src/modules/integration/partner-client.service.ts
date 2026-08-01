import { Injectable, Logger } from '@nestjs/common';
import { getIntegrationConfig, canCallPartner } from './integration.config';

export interface PartnerCallResult<T> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
}

// Encapsula las llamadas SALIENTES al socio. NUNCA lanza hacia el flujo de
// usuario: si el socio no responde devuelve { ok:false } y se registra en log.
@Injectable()
export class PartnerClient {
  private readonly logger = new Logger(PartnerClient.name);

  isConfigured(): boolean {
    return canCallPartner();
  }

  async get<T>(path: string, timeoutMs = 5000): Promise<PartnerCallResult<T>> {
    return this.request<T>('GET', path, undefined, timeoutMs);
  }

  async post<T>(path: string, body: unknown, timeoutMs = 8000): Promise<PartnerCallResult<T>> {
    return this.request<T>('POST', path, body, timeoutMs);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<PartnerCallResult<T>> {
    const cfg = getIntegrationConfig();
    if (!canCallPartner(cfg)) return { ok: false, error: 'partner-not-configured' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.partnerApiUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'X-Integration-Token': cfg.partnerApiToken,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        this.logger.warn(`Socio ${method} ${path} -> HTTP ${res.status}`);
        return { ok: false, status: res.status, error: `http-${res.status}` };
      }
      const data = (await res.json()) as T;
      return { ok: true, status: res.status, data };
    } catch (e) {
      this.logger.warn(`Socio ${method} ${path} fallo: ${(e as Error).message}`);
      return { ok: false, error: (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
}
