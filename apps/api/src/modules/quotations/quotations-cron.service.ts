import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QuotationsService } from './quotations.service';

@Injectable()
export class QuotationsCronService {
  private readonly logger = new Logger(QuotationsCronService.name);

  constructor(private readonly quotationsService: QuotationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyCleanup() {
    this.logger.log('Running daily quotation/invoice cleanup...');

    const expiredCount = await this.quotationsService.expireOldQuotations();
    if (expiredCount > 0) {
      this.logger.log(`Expired ${expiredCount} quotation(s)`);
    }

    const cancelledCount = await this.quotationsService.cancelOldPendingInvoices();
    if (cancelledCount > 0) {
      this.logger.log(`Cancelled ${cancelledCount} pending invoice(s) from previous days`);
    }

    this.logger.log('Daily cleanup complete');
  }
}
