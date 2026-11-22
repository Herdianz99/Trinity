import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from '../push/push.service';

// Un llamado del totem deja de mostrarse a los 20 min: el cliente ya se fue o ya lo atendieron.
const CALL_WINDOW_MS = 20 * 60_000;

const tagFor = (conversationId: string) => `totem-call-${conversationId}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Llamados del totem Clover a los vendedores (Sesion 193). Cuando una conversacion KIOSK pasa a
 * "Con asesor" (boton "Llamar a un vendedor" o el bot escala solo), se avisa a TODOS los vendedores:
 * dentro de Trinity (timbre + tarjeta, por consulta cada pocos segundos) y por notificacion push.
 * El primero que toca "Voy yo" se queda con el llamado; a los demas se les reemplaza el aviso.
 *
 * Vendedor = usuario activo con rol SELLER o con una ficha de Vendedor activa vinculada
 * (hay vendedores con rol CASHIER/SUPERVISOR/ADMIN). ADMIN puede ver y atender para probar.
 */
@Injectable()
export class TotemCallsService {
  private readonly logger = new Logger(TotemCallsService.name);

  constructor(private prisma: PrismaService, private push: PushService) {}

  private sellerWhere() {
    return {
      isActive: true,
      role: { notIn: ['TOTEM', 'CLIENT'] as any },
      OR: [{ role: 'SELLER' as const }, { seller: { isActive: true } }],
    };
  }

  async isSeller(userId: string) {
    const n = await this.prisma.user.count({ where: { id: userId, ...this.sellerWhere() } });
    return n > 0;
  }

  private async canSee(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!u) return { seller: false, allowed: false };
    const seller = await this.isSeller(userId);
    return { seller, allowed: seller || u.role === 'ADMIN' };
  }

  private async sellerIds(exceptUserId?: string) {
    const rows = await this.prisma.user.findMany({ where: this.sellerWhere(), select: { id: true } });
    return rows.map((r) => r.id).filter((id) => id !== exceptUserId);
  }

  /** Lo que pregunto el cliente (ultimos mensajes) para que el vendedor sepa a que va. */
  private async customerAsked(conversationId: string) {
    const msgs = await this.prisma.chatbotMessage.findMany({
      where: { conversationId, role: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { text: true },
    });
    return msgs.map((m) => m.text.trim()).filter(Boolean).reverse();
  }

  /** Llamado nuevo: push a todos los vendedores. Nunca lanza error (no debe romper al bot). */
  async notifyNew(conversationId: string) {
    try {
      const conv = await this.prisma.chatbotConversation.findUnique({
        where: { id: conversationId },
        select: { channel: true, status: true, attendedById: true },
      });
      if (!conv || conv.channel !== 'KIOSK' || conv.status !== 'ESCALATED' || conv.attendedById) return;
      const asked = await this.customerAsked(conversationId);
      const ids = await this.sellerIds();
      const sent = await this.push.sendToUsers(ids, {
        title: '🙋 Cliente en el tótem pide un vendedor',
        body: asked.length ? `Preguntó: "${clip(asked.join(' · '), 140)}"` : 'Acércate a la pantalla de Clover.',
        tag: tagFor(conversationId),
        url: `/llamados?id=${conversationId}`,
        renotify: true,
        requireInteraction: true,
        actions: [{ action: 'attend-totem', title: '✋ Voy yo' }],
        data: { kind: 'totem-call', conversationId },
      });
      this.logger.log(`Llamado del totem ${conversationId}: push a ${sent} navegador(es) de ${ids.length} vendedor(es)`);
    } catch (e) {
      this.logger.error(`No se pudo avisar el llamado del totem: ${(e as Error).message}`);
    }
  }

  /** Llamados abiertos de los ultimos 20 min (para el aviso dentro de Trinity y la pantalla /llamados). */
  async pending(userId: string) {
    const { seller, allowed } = await this.canSee(userId);
    if (!allowed) return { enabled: false, seller: false, calls: [] };
    const since = new Date(Date.now() - CALL_WINDOW_MS);
    const rows = await this.prisma.chatbotConversation.findMany({
      where: { channel: 'KIOSK', status: 'ESCALATED', escalatedAt: { gte: since } },
      orderBy: { escalatedAt: 'desc' },
      take: 10,
      select: {
        id: true, escalatedAt: true, escalationReason: true, attendedAt: true,
        attendedBy: { select: { id: true, name: true } },
      },
    });
    const calls = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      escalatedAt: r.escalatedAt,
      reason: r.escalationReason,
      asked: await this.customerAsked(r.id),
      attendedAt: r.attendedAt,
      attendedBy: r.attendedBy ? { name: r.attendedBy.name, mine: r.attendedBy.id === userId } : null,
    })));
    return { enabled: true, seller, calls };
  }

  /** "Voy yo": el primero gana (UPDATE condicionado). Devuelve quien quedo atendiendo. */
  async attend(conversationId: string, userId: string) {
    const { allowed } = await this.canSee(userId);
    if (!allowed) throw new ForbiddenException('Solo los vendedores atienden los llamados del tótem');
    const conv = await this.prisma.chatbotConversation.findUnique({ where: { id: conversationId }, select: { channel: true } });
    if (!conv || conv.channel !== 'KIOSK') throw new NotFoundException('Llamado no encontrado');

    const res = await this.prisma.chatbotConversation.updateMany({
      where: { id: conversationId, channel: 'KIOSK', status: 'ESCALATED', attendedById: null },
      data: { attendedById: userId, attendedAt: new Date() },
    });
    const after = await this.prisma.chatbotConversation.findUnique({
      where: { id: conversationId },
      select: { attendedBy: { select: { id: true, name: true } } },
    });
    const name = after?.attendedBy?.name ?? null;
    const mine = after?.attendedBy?.id === userId;

    if (res.count === 1) {
      // A los demas se les reemplaza el aviso (mismo tag) por uno silencioso: "Lo atiende X".
      const others = await this.sellerIds(userId);
      this.push.sendToUsers(others, {
        title: `✅ ${name} va a atender al cliente del tótem`,
        body: 'No hace falta que vayas.',
        tag: tagFor(conversationId),
        url: '/llamados',
        silent: true,
        data: { kind: 'totem-call-taken', conversationId },
      }).catch(() => undefined);
    }
    return { ok: true, taken: res.count === 1, mine, attendedByName: name };
  }

  /** Para la pantalla del totem: ¿ya va alguien? (solo el primer nombre, para decirlo en voz). */
  async statusForTotem(conversationId: string) {
    const c = await this.prisma.chatbotConversation.findUnique({
      where: { id: conversationId },
      select: { status: true, attendedBy: { select: { name: true } } },
    });
    if (!c) throw new NotFoundException('Conversación no encontrada');
    const first = c.attendedBy?.name?.trim().split(/\s+/)[0] ?? null;
    return { status: c.status, attendedByName: first };
  }
}
