import { Injectable, ForbiddenException } from '@nestjs/common';
import * as https from 'https';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class ExchangeRateService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    return this.prisma.exchangeRate.findUnique({
      where: { date: today },
    });
  }

  async getByDate(dateStr: string) {
    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);

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
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo ADMIN puede registrar tasas de cambio');
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

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
      const cheerio = await import('cheerio');
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
}
