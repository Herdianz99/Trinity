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
      // BuscaRif.jsp response parsing
      // Based on the SENIAT BuscaRif response format:
      // The HTML contains a section starting with "VISUALIZAR"
      // followed by the name after a semicolon and the RIF before &nbsp

      let documentType = '';
      let documentNumber = '';
      let name = '';
      let commercialName: string | undefined;
      let fiscalName: string | undefined;

      // Normalize: collapse to single line
      let code = html.replace(/\r?\n/g, '');

      // Extract from VISUALIZAR section (BuscaRif format)
      const vizMatch = code.match(/VISUALIZAR.*/gi);
      if (vizMatch) {
        const vizCode = vizMatch.join('');

        // Check for "No existe el contribuyente"
        if (vizCode.includes('No existe el contribuyente')) {
          return { documentType: '', documentNumber: '', name: '', error: 'No existe el contribuyente solicitado' };
        }

        // Extract name: after semicolon, grab text with name-valid characters
        const nameMatch = vizCode.match(/;[;\)\(\.\,\'\&\´ñÑ\w\s]+/gi);
        if (nameMatch) {
          name = nameMatch[0]
            .replace(/amp;/g, '')
            .replace(/;/g, '')
            .trim();
        }

        // Extract RIF: letter + digits before &nbsp
        const rifMatch = vizCode.match(/[VEJGCP]\d+(?=&nbsp)/gi);
        if (rifMatch) {
          const ci = rifMatch.join('');
          documentType = ci[0].toUpperCase();
          documentNumber = ci.replace(/^[A-Za-z]/, '');
        }
      }

      // Fallback: try generic RIF pattern if VISUALIZAR method didn't find it
      if (!documentNumber) {
        const rifFallback = html.match(/([VEJGCP])-?(\d{5,9})-?(\d)/i);
        if (rifFallback) {
          documentType = rifFallback[1].toUpperCase();
          documentNumber = `${rifFallback[2]}-${rifFallback[3]}`;
        }
      }

      // Fallback: try "Razon Social" label patterns
      if (!name) {
        const namePatterns = [
          /Raz[oó]n\s*Social\s*[:：]\s*([^<\n]+)/i,
          /Nombre\s*o\s*Raz[oó]n\s*Social\s*[:：]\s*([^<\n]+)/i,
        ];
        for (const pattern of namePatterns) {
          const match = html.match(pattern);
          if (match) {
            name = match[1].trim();
            break;
          }
        }
      }

      // If name has format "COMMERCIAL NAME (FISCAL NAME)" extract both
      const parenMatch = name.match(/^(.+?)\s*\((.+?)\)\s*$/);
      if (parenMatch) {
        commercialName = parenMatch[1].trim();
        fiscalName = parenMatch[2].trim();
        name = commercialName;
      }

      // Clean up
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
          where: { status: { in: ['PENDING', 'PAID', 'PARTIAL_RETURN'] } },
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
