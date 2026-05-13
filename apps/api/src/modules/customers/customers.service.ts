import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { search?: string; isActive?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const where: any = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { rif: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            number: true,
            status: true,
            totalUsd: true,
            totalBs: true,
            createdAt: true,
          },
        },
        receivables: {
          where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
          select: {
            id: true,
            amountUsd: true,
            status: true,
            dueDate: true,
            type: true,
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const pendingDebt = customer.receivables.reduce((sum, r) => sum + r.amountUsd, 0);
    const availableCredit = customer.creditLimit - pendingDebt;

    return { ...customer, pendingDebt, availableCredit };
  }

  async create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const exists = await this.prisma.customer.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  parseSeniatHtml(html: string) {
    try {
      // Extract data using the SENIAT response patterns
      // The SENIAT returns info like: "NOMBRE O RAZÓN SOCIAL: ..."
      // or in table cells with specific labels

      let documentType = '';
      let documentNumber = '';
      let name = '';
      let commercialName: string | undefined;
      let fiscalName: string | undefined;

      // Try to extract RIF pattern: V-12345678-9, J-12345678-9, etc.
      const rifMatch = html.match(/([VEJGCP])-?(\d{5,9})-?(\d)/i);
      if (rifMatch) {
        documentType = rifMatch[1].toUpperCase();
        documentNumber = `${rifMatch[2]}-${rifMatch[3]}`;
      }

      // Try to extract name — look for "Nombre o Razón Social" or "RAZÓN SOCIAL"
      const namePatterns = [
        /Raz[oó]n\s*Social\s*[:：]\s*([^<\n]+)/i,
        /Nombre\s*o\s*Raz[oó]n\s*Social\s*[:：]\s*([^<\n]+)/i,
        /NOMBRE\s*[:：]\s*([^<\n]+)/i,
      ];
      for (const pattern of namePatterns) {
        const match = html.match(pattern);
        if (match) {
          name = match[1].trim();
          break;
        }
      }

      // If name has format "COMMERCIAL NAME (FISCAL NAME)" extract both
      const parenMatch = name.match(/^(.+?)\s*\((.+?)\)\s*$/);
      if (parenMatch) {
        commercialName = parenMatch[1].trim();
        fiscalName = parenMatch[2].trim();
      }

      // Fallback: try cheerio-based parsing if available
      if (!name) {
        try {
          const cheerio = require('cheerio');
          const $ = cheerio.load(html);
          // Look for common SENIAT result patterns in table cells
          $('td').each((_: number, el: any) => {
            const text = $(el).text().trim();
            if (text.match(/Raz[oó]n Social/i)) {
              const next = $(el).next('td').text().trim();
              if (next) name = next;
            }
            if (text.match(/Nombre Comercial/i)) {
              const next = $(el).next('td').text().trim();
              if (next) commercialName = next;
            }
          });
        } catch { /* cheerio not critical */ }
      }

      // Clean up name
      name = name.replace(/\s+/g, ' ').trim();

      return { documentType, documentNumber, name, commercialName, fiscalName };
    } catch {
      return { documentType: '', documentNumber: '', name: '', error: 'No se pudo parsear la respuesta del SENIAT' };
    }
  }

  async remove(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          where: { status: { in: ['DRAFT', 'PENDING', 'PAID', 'PARTIAL', 'CREDIT'] } },
          take: 1,
        },
      },
    });

    if (!customer) throw new NotFoundException('Cliente no encontrado');

    if (customer.invoices.length > 0) {
      throw new BadRequestException('No se puede eliminar un cliente con facturas activas');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
