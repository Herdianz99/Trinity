import { Injectable, ForbiddenException } from '@nestjs/common';
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

  async fetchFromBcv(): Promise<number | null> {
    try {
      const response = await fetch('https://www.bcv.org.ve/');
      const html = await response.text();

      // Parse the BCV page for dollar rate
      // The BCV site has the dollar rate in a div with id "dolar"
      const dolarMatch = html.match(/<div[^>]*id="dolar"[^>]*>[\s\S]*?<strong>([\d,.]+)<\/strong>/i);
      if (!dolarMatch) {
        // Try alternative pattern
        const altMatch = html.match(/<span[^>]*class="[^"]*field-content[^"]*"[^>]*>([\d,]+[\d.]*)<\/span>/);
        if (altMatch) {
          return parseFloat(altMatch[1].replace(',', '.'));
        }
        return null;
      }

      const rateStr = dolarMatch[1].replace('.', '').replace(',', '.');
      return parseFloat(rateStr);
    } catch {
      return null;
    }
  }
}
