import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 30_000;

// Normaliza IPv4-mapped-IPv6 (::ffff:a.b.c.d -> a.b.c.d) y recorta espacios.
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  const s = ip.trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

// ¿La IP coincide con la entrada (IP exacta o CIDR IPv4)? IPv6 solo match exacto.
export function matchEntry(ip: string, entry: string): boolean {
  const target = normalizeIp(ip);
  const e = entry.trim();
  if (!e) return false;
  if (e.includes('/')) {
    const [base, bitsStr] = e.split('/');
    const bits = Number(bitsStr);
    const ipInt = ipv4ToInt(target);
    const baseInt = ipv4ToInt(base.trim());
    if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  }
  return target === normalizeIp(e);
}

@Injectable()
export class IpAccessService {
  private cache: { entries: string[]; at: number } | null = null;

  constructor(private prisma: PrismaService) {}

  private async getEntries(): Promise<string[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.entries;
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { allowedIps: true },
    });
    const entries = (config?.allowedIps || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    this.cache = { entries, at: now };
    return entries;
  }

  async hasWhitelist(): Promise<boolean> {
    return (await this.getEntries()).length > 0;
  }

  async isAllowed(ip: string): Promise<boolean> {
    const entries = await this.getEntries();
    return entries.some((e) => matchEntry(ip, e));
  }

  /**
   * Regla fail-safe: bloquea SOLO si el usuario está restringido, NO es ADMIN,
   * hay whitelist configurada y la IP no está permitida. Cualquier otro caso: NO bloquea.
   */
  async shouldBlock(ip: string, opts: { restrict: boolean; role: UserRole }): Promise<boolean> {
    if (!opts.restrict) return false;
    if (opts.role === UserRole.ADMIN) return false;
    if (!(await this.hasWhitelist())) return false;
    return !(await this.isAllowed(ip));
  }
}
