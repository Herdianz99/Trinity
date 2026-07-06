import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QuotationsService } from './quotations.service';

@Injectable()
export class QuotationsCronService {
  private readonly logger = new Logger(QuotationsCronService.name);

  constructor(private readonly quotationsService: QuotationsService) {}

  // Medianoche hora Caracas (el server corre en UTC; sin timeZone dispararia a las
  // 8 PM Caracas del dia anterior y limpiaria con ~1 dia de desfase).
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'America/Caracas' })
  async handleDailyCleanup() {
    this.logger.log('Running daily quotation/invoice cleanup...');

    const expiredCount = await this.quotationsService.expireOldQuotations();
    if (expiredCount > 0) {
      this.logger.log(`Expired ${expiredCount} quotation(s)`);
    }

    const deletedCount = await this.quotationsService.deleteOldPendingInvoices();
    if (deletedCount > 0) {
      this.logger.log(`Deleted ${deletedCount} pending invoice(s) from previous days`);
    }

    this.logger.log('Daily cleanup complete');
  }
}
