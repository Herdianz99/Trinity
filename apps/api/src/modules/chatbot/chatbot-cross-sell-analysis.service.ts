import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart } from '../../common/timezone';
import { ChatbotCrossSellService } from './chatbot-cross-sell.service';
import { countPairs, firstSignificantWord, normalizeTerm, ruleKey, selectSuggestions } from './cross-sell-utils';

const WINDOW_DAYS = 90;
const THRESHOLDS = { minBase: 20, minPct: 15, minLift: 2, maxPerTrigger: 3 };

// "lavamanos" y "lavamano" son lo mismo: compara sin la s/es final. Y como el analisis agrupa por la primera
// palabra, la sugerencia "esmeril -> disco" ya esta cubierta por una regla "esmeril -> disco de corte".
const singular = (t: string) => normalizeTerm(t).replace(/(es|s)$/, '');
const sameTerm = (a: string, b: string) => singular(a) === singular(b);

// Analisis de "que se compra junto": SOLO propone (status SUGGESTED); el bot usa solo reglas ACTIVE.
@Injectable()
export class ChatbotCrossSellAnalysisService {
  private readonly logger = new Logger(ChatbotCrossSellAnalysisService.name);
  private running = false;

  constructor(
    private prisma: PrismaService,
    private crossSell: ChatbotCrossSellService,
  ) {}

  @Cron('0 0 3 * * 1', { timeZone: 'America/Caracas' }) // lunes 3:00 AM Caracas
  async weekly() {
    try {
      const r = await this.analyze();
      this.logger.log(`Venta cruzada: ${r.suggestions} sugerencias de ${r.invoices} facturas`);
    } catch (e) {
      this.logger.error(`Venta cruzada: analisis fallo: ${(e as Error).message}`);
    }
  }

  async analyze() {
    if (this.running) throw new ConflictException('El análisis ya se está ejecutando');
    this.running = true;
    try {
      const from = caracasDayStart(new Date(Date.now() - WINDOW_DAYS * 86_400_000));
      const lines = await this.prisma.$queryRaw<{ invoiceId: string; productId: string }[]>`
        SELECT DISTINCT ii."invoiceId", ii."productId"
        FROM "InvoiceItem" ii
        JOIN "Invoice" i ON i.id = ii."invoiceId"
        LEFT JOIN "Customer" c ON c.id = i."customerId"
        WHERE i.status IN ('PAID', 'PARTIAL_RETURN') AND i."paidAt" >= ${from}
          AND COALESCE(c."isGroupCompany", false) = false`;
      const productIds = [...new Set(lines.map((l) => l.productId))];
      const names = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
      const group = new Map(names.map((p) => [p.id, firstSignificantWord(p.name)]));

      const perInvoice = new Map<string, Set<string>>();
      for (const l of lines) {
        const g = group.get(l.productId);
        if (!g) continue;
        const set = perInvoice.get(l.invoiceId) ?? new Set<string>();
        set.add(g);
        perInvoice.set(l.invoiceId, set);
      }
      const suggestions = selectSuggestions(countPairs([...perInvoice.values()]), THRESHOLDS);

      const now = new Date();
      const existing = await this.prisma.chatbotCrossSellRule.findMany({
        select: { id: true, trigger: true, offerTerms: true, status: true },
      });
      const keepSuggested: string[] = [];
      for (const s of suggestions) {
        const stats = { statsBaseCount: s.base, statsPairPct: s.pct, statsLift: s.lift, statsAt: now };
        const match = existing.find(
          (r) => sameTerm(r.trigger, s.trigger) && r.offerTerms.some((o) => sameTerm(o, s.offer) || sameTerm(firstSignificantWord(o) ?? o, s.offer)),
        );
        if (match) {
          await this.prisma.chatbotCrossSellRule.update({ where: { id: match.id }, data: stats });
          if (match.status === 'SUGGESTED') keepSuggested.push(match.id);
          continue;
        }
        const created = await this.prisma.chatbotCrossSellRule.create({
          data: { key: ruleKey(s.trigger, [s.offer]), trigger: s.trigger, offerTerms: [s.offer], status: 'SUGGESTED', ...stats },
        });
        keepSuggested.push(created.id);
      }
      await this.prisma.chatbotCrossSellRule.deleteMany({ where: { status: 'SUGGESTED', id: { notIn: keepSuggested } } });
      await this.prisma.chatbotConfig.upsert({
        where: { id: 'default' },
        create: { id: 'default', crossSellAnalyzedAt: now },
        update: { crossSellAnalyzedAt: now },
      });
      this.crossSell.invalidate();
      return { invoices: perInvoice.size, suggestions: suggestions.length, analyzedAt: now };
    } finally {
      this.running = false;
    }
  }
}
