import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';

/** Lo que recibe el service worker (`apps/web/public/sw.js`, evento 'push'). */
export interface PushPayload {
  title: string;
  body: string;
  /** Agrupa/reemplaza: una notificacion nueva con el mismo tag reemplaza a la anterior. */
  tag: string;
  /** Pantalla que se abre al tocar la notificacion. */
  url: string;
  /** true = suena y vibra aunque reemplace a otra con el mismo tag. */
  renotify?: boolean;
  /** true = sin sonido (p. ej. "Lo atiende Juan" que reemplaza el llamado). */
  silent?: boolean;
  /** Se queda en pantalla hasta que la toquen (Android lo respeta en Chrome). */
  requireInteraction?: boolean;
  /** Botones de la notificacion; el service worker sabe ejecutar 'attend-totem'. */
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Notificaciones push (Web Push con llaves VAPID). Llegan a la tablet/PC aunque Trinity este cerrado
 * o la pantalla bloqueada. Llaves en el .env del API: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y
 * VAPID_SUBJECT (mailto:...). Sin llaves, todo sigue funcionando y simplemente no se envian.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private publicKey: string | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private rolePermissions: RolePermissionsService,
  ) {}

  onModuleInit() {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:soporte@eltrebol.app';
    if (!pub || !priv) {
      this.logger.warn('Push desactivado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el .env');
      return;
    }
    try {
      webpush.setVapidDetails(subject, pub, priv);
      this.publicKey = pub;
    } catch (e) {
      this.logger.error(`Push desactivado: llaves VAPID invalidas (${(e as Error).message})`);
    }
  }

  get enabled() {
    return this.publicKey !== null;
  }

  getPublicKey() {
    return { publicKey: this.publicKey };
  }

  async subscribe(userId: string, sub: SubscriptionInput, userAgent?: string) {
    // El mismo navegador puede pasar a otro usuario (tablet compartida): el endpoint se reasigna.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
    });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
    return { ok: true };
  }

  /** ¿Este navegador (endpoint) esta registrado para este usuario? */
  async status(userId: string, endpoint?: string) {
    if (!endpoint) return { enabled: this.enabled, subscribed: false };
    const found = await this.prisma.pushSubscription.findFirst({ where: { endpoint, userId }, select: { id: true } });
    return { enabled: this.enabled, subscribed: !!found };
  }

  /** Envia a todos los navegadores registrados de esos usuarios. Nunca lanza error. */
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<number> {
    if (!this.enabled || userIds.length === 0) return 0;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    return this.sendToSubscriptions(subs, payload);
  }

  /** Usuarios activos que tienen el modulo (respeta Permisos por rol y modulos extra). */
  async usersWithModule(module: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, pushSubscriptions: { some: {} } },
      select: { id: true, role: true },
    });
    const out: string[] = [];
    for (const u of users) {
      const mods = await this.rolePermissions.getModulesForUser(u.id, u.role);
      if (mods.includes('*') || mods.includes(module)) out.push(u.id);
    }
    return out;
  }

  private async sendToSubscriptions(
    subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
    payload: PushPayload,
  ): Promise<number> {
    const body = JSON.stringify(payload);
    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        // urgency high: Android entrega aunque el equipo este en ahorro de energia (Doze).
        // TTL 10 min: un llamado del totem mas viejo ya no sirve.
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 600, urgency: 'high' },
        );
        ok++;
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          // El navegador ya no existe o quitaron el permiso: se borra el registro.
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        } else {
          this.logger.warn(`Push fallo (${code ?? 'sin codigo'}): ${e?.body || e?.message}`);
        }
      }
    }));
    return ok;
  }
}
