import { Injectable, ForbiddenException } from '@nestjs/common';
import * as https from 'https';
import * as cheerio from 'cheerio';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UserRole, ExchangeRateSource } from '@prisma/client';
import { caracasDateKey } from '../../common/timezone';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';

// Permiso configurable que habilita registrar/actualizar la tasa del dia (ademas de ADMIN,
// que siempre puede). Se asigna por rol desde "Permisos por rol".
const RATE_PERMISSION = 'MANAGE_EXCHANGE_RATE';

@Injectable()
export class ExchangeRateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  async getToday() {
    const today = caracasDateKey();

    return this.prisma.exchangeRate.findUnique({
      where: { date: today },
    });
  }

  async getByDate(dateStr: string) {
    const date = caracasDateKey(dateStr);

    return this.prisma.exchangeRate.findUnique({
      where: { date },
    });
  }

  async getHistory(filters: { from?: string; to?: string }) {
    const where: any = {};

    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.date.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.date.lte = toDate;
      }
    }

    return this.prisma.exchangeRate.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 60,
    });
  }

  async create(dto: CreateExchangeRateDto, user: { id: string; role: UserRole }) {
    // ADMIN siempre puede; los demas roles necesitan el permiso MANAGE_EXCHANGE_RATE
    // (configurable desde "Permisos por rol").
    if (user.role !== UserRole.ADMIN) {
      const modules = await this.rolePermissions.getModulesForRole(user.role);
      if (!modules.includes(RATE_PERMISSION)) {
        throw new ForbiddenException('No tiene permiso para registrar la tasa de cambio');
      }
    }

    const today = caracasDateKey();

    return this.prisma.exchangeRate.upsert({
      where: { date: today },
      create: {
        rate: dto.rate,
        date: today,
        source: dto.source || 'MANUAL',
        createdById: user.id,
      },
      update: {
        rate: dto.rate,
        source: dto.source || 'MANUAL',
        createdById: user.id,
      },
    });
  }

  private fetchBcvHtml(): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        'https://www.bcv.org.ve/',
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          rejectUnauthorized: false, // BCV uses a government cert not in Node's CA store
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        },
      );
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  async fetchFromBcv(): Promise<number | null> {
    try {
      const html = await this.fetchBcvHtml();
      const $ = cheerio.load(html);

      // The BCV page has the dollar rate inside #dolar strong
      const dolarText = $('#dolar strong').text().trim();
      if (dolarText) {
        // Format is like "36,71880000" or "1.236,50" — replace dots (thousands) and comma (decimal)
        const rateStr = dolarText.replace(/\./g, '').replace(',', '.');
        const rate = parseFloat(rateStr);
        if (!isNaN(rate) && rate > 0) return rate;
      }

      // Fallback: try the field-content span pattern
      const altText = $('div#dolar .field-content').text().trim();
      if (altText) {
        const rateStr = altText.replace(/\./g, '').replace(',', '.');
        const rate = parseFloat(rateStr);
        if (!isNaN(rate) && rate > 0) return rate;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Scrapea BCV y guarda la tasa bajo la fecha dada (upsert, fuente BCV).
   * - Si BCV no responde (null) NO toca nada: se conserva la tasa existente.
   * - Si ya hay una tasa MANUAL para esa fecha, la respeta (no la pisa).
   * Devuelve la tasa guardada o null si no se guardó.
   */
  async fetchAndSave(dateKey: Date): Promise<{ rate: number; date: Date } | null> {
    const rate = await this.fetchFromBcv();
    if (rate === null) return null; // BCV caído o HTML cambió → dejar la existente

    const existing = await this.prisma.exchangeRate.findUnique({ where: { date: dateKey } });
    if (existing && existing.source === ExchangeRateSource.MANUAL) {
      return null; // no pisar una corrección manual
    }

    await this.prisma.exchangeRate.upsert({
      where: { date: dateKey },
      create: { rate, date: dateKey, source: ExchangeRateSource.BCV },
      update: { rate, source: ExchangeRateSource.BCV },
    });
    return { rate, date: dateKey };
  }
}
