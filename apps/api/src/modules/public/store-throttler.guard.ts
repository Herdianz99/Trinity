import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

// Los pedidos de la tienda online llegan desde los servidores de Vercel, no desde el
// navegador del cliente: limitar por req.ip metería a TODOS los clientes en el mismo cupo
// (y no frenaría a un abusador real). La tienda reenvía la IP del cliente en
// `x-store-client-ip` firmada con la clave compartida `x-store-key` (= env STORE_ORDERS_KEY).
// Con la clave correcta se limita por esa IP; sin clave (o sin STORE_ORDERS_KEY en el .env)
// se limita por req.ip como antes, así que desplegar esto no rompe la tienda actual.

function sameSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

@Injectable()
export class StoreThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const secret = process.env.STORE_ORDERS_KEY;
    const key = req.headers?.['x-store-key'];
    const clientIp = String(req.headers?.['x-store-client-ip'] || '').trim().slice(0, 64);
    if (secret && typeof key === 'string' && clientIp && sameSecret(key, secret)) {
      return `store:${clientIp}`;
    }
    return req.ip;
  }
}
