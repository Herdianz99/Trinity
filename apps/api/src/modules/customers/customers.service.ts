import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as http from 'http';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const SENIAT_BASE = 'http://contribuyente.seniat.gob.ve/BuscaRif';

// In-memory store for SENIAT sessions (JSESSIONID cookie ↔ sessionId)
const seniatSessions = new Map<string, { cookies: string; createdAt: number }>();

// Clean up sessions older than 5 minutes
function cleanSeniatSessions() {
  const now = Date.now();
  for (const [key, val] of seniatSessions) {
    if (now - val.createdAt > 5 * 60 * 1000) seniatSessions.delete(key);
  }
}

function httpGet(url: string, headers?: Record<string, string>): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout conectando al SENIAT')); });
  });
}

function httpPost(url: string, body: string, headers?: Record<string, string>): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout conectando al SENIAT')); });
    req.write(body);
    req.end();
  });
}

function extractCookies(headers: http.IncomingHttpHeaders): string {
  const raw = headers['set-cookie'];
  if (!raw) return '';
  return raw.map(c => c.split(';')[0]).join('; ');
}

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

  private normalizeRif(rif: string): string {
    return rif.replace(/[-\s]/g, '').toUpperCase();
  }

  private async checkDuplicateRif(rif: string | undefined | null, documentType: string | undefined, excludeId?: string) {
    if (!rif || !rif.trim()) return;
    const normalized = this.normalizeRif(rif);
    if (!normalized) return;

    const where: any = {
      isActive: true,
      rif: { not: null },
    };
    if (excludeId) where.id = { not: excludeId };

    const customers = await this.prisma.customer.findMany({
      where,
      select: { id: true, name: true, rif: true, documentType: true },
    });

    const match = customers.find(c => {
      if (!c.rif) return false;
      const cNorm = this.normalizeRif(c.rif);
      const sameRif = cNorm === normalized;
      const sameType = !documentType || c.documentType === documentType;
      return sameRif && sameType;
    });

    if (match) {
      throw new BadRequestException(`Ya existe un cliente activo con este documento: ${match.name} (${match.documentType}-${match.rif})`);
    }
  }

  async create(dto: CreateCustomerDto) {
    await this.checkDuplicateRif(dto.rif, dto.documentType);
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const exists = await this.prisma.customer.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Cliente no encontrado');
    await this.checkDuplicateRif(dto.rif ?? exists.rif, dto.documentType ?? exists.documentType, id);
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

  async getSeniatCaptcha(): Promise<{ sessionId: string; captchaBase64: string }> {
    cleanSeniatSessions();
    try {
      // Step 1: GET the page to obtain session cookie
      const pageRes = await httpGet(`${SENIAT_BASE}/BuscaRif.jsp`);
      const cookies = extractCookies(pageRes.headers);

      // Step 2: GET the captcha image with the session cookie
      const captchaRes = await httpGet(`${SENIAT_BASE}/Captcha.jpg`, {
        Cookie: cookies,
        Referer: `${SENIAT_BASE}/BuscaRif.jsp`,
      });

      if (!captchaRes.body.length) {
        throw new BadRequestException('No se pudo obtener el captcha del SENIAT');
      }

      // Step 3: Store session and return captcha
      const sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      seniatSessions.set(sessionId, { cookies, createdAt: Date.now() });

      const captchaBase64 = captchaRes.body.toString('base64');
      return { sessionId, captchaBase64 };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('No se pudo conectar con el SENIAT: ' + (err.message || 'Error desconocido'));
    }
  }

  async lookupSeniat(dto: { sessionId: string; rif?: string; cedula?: string; captcha: string }) {
    cleanSeniatSessions();
    const session = seniatSessions.get(dto.sessionId);
    if (!session) {
      throw new BadRequestException('Sesion SENIAT expirada. Intente de nuevo.');
    }

    try {
      // Build form data
      const params = new URLSearchParams();
      params.set('p_rif', dto.rif || '');
      params.set('p_cedula', dto.cedula || '');
      params.set('codigo', dto.captcha);
      params.set('busca', ' Buscar ');

      const res = await httpPost(`${SENIAT_BASE}/BuscaRif.jsp`, params.toString(), {
        Cookie: session.cookies,
        Referer: `${SENIAT_BASE}/BuscaRif.jsp`,
      });

      // Clean up session
      seniatSessions.delete(dto.sessionId);

      // Decode response (SENIAT uses windows-1252)
      const html = res.body.toString('latin1');

      // Check for common SENIAT error patterns before parsing
      if (html.includes('codigo de validacion incorrecto') || html.includes('codigo incorrecto') || html.includes('captcha')) {
        return { documentType: '', documentNumber: '', name: '', error: 'Captcha incorrecto. Intente de nuevo.' };
      }

      // Use existing parser
      const result = this.parseSeniatHtml(html);

      // If parser found nothing and no explicit error, the captcha was likely wrong
      if (!result.name && !result.documentNumber && !result.error) {
        return { ...result, error: 'No se encontraron datos. Verifique el RIF y el captcha.' };
      }

      return result;
    } catch (err: any) {
      seniatSessions.delete(dto.sessionId);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Error al consultar el SENIAT: ' + (err.message || 'Error desconocido'));
    }
  }

  async getCreditBalance(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    // Get today's rate for Bs conversion
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    const todayRate = rate?.rate || 0;

    // Find NCV (credit notes) that are POSTED but not yet applied via a receipt
    const customerInvoices = await this.prisma.invoice.findMany({
      where: { customerId: id },
      select: { id: true, number: true },
    });
    const invoiceIds = customerInvoices.map((inv) => inv.id);
    const invoiceMap = new Map(customerInvoices.map((inv) => [inv.id, inv.number]));

    let creditNotes: any[] = [];
    if (invoiceIds.length > 0) {
      creditNotes = await this.prisma.creditDebitNote.findMany({
        where: {
          invoiceId: { in: invoiceIds },
          type: 'NCV',
          status: 'POSTED',
          appliedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    const items = creditNotes.map((n) => ({
      id: n.id,
      description: `${n.number} - Devolucion ${invoiceMap.get(n.invoiceId) || ''}`,
      amountUsd: n.totalUsd,
      paidAmountUsd: n.paidAmountUsd || 0,
      remainingUsd: Math.round((n.totalUsd - (n.paidAmountUsd || 0)) * 100) / 100,
    })).filter((i) => i.remainingUsd > 0.01);

    const totalUsd = items.reduce((sum, i) => sum + i.remainingUsd, 0);
    const totalBs = Math.round(totalUsd * todayRate * 100) / 100;

    return {
      hasBalance: totalUsd > 0,
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalBs,
      items,
    };
  }

  async remove(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            invoices: true,
            quotations: true,
            receivables: true,
            receipts: true,
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const totalDocs = customer._count.invoices + customer._count.quotations
      + customer._count.receivables + customer._count.receipts;

    if (totalDocs === 0) {
      await this.prisma.customer.delete({ where: { id } });
      return { deleted: true, message: 'Cliente eliminado permanentemente' };
    }

    // Has documents — only allow soft delete if no active invoices
    if (customer._count.invoices > 0) {
      const activeInvoices = await this.prisma.invoice.count({
        where: { customerId: id, status: { in: ['PENDING', 'PAID', 'PARTIAL_RETURN'] } },
      });
      if (activeInvoices > 0) {
        throw new BadRequestException('No se puede eliminar un cliente con facturas activas. Solo se puede desactivar.');
      }
    }

    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
    return { deleted: false, message: 'Cliente desactivado (tiene documentos asociados)' };
  }
}
