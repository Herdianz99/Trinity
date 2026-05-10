import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PayablesService } from './payables.service';

@Injectable()
export class PayablesCronService {
  private readonly logger = new Logger(PayablesCronService.name);

  constructor(private readonly payablesService: PayablesService) {}

  @Cron('0 2 0 * * *') // Daily at 00:02
  async handleOverduePayables() {
    const count = await this.payablesService.markOverdue();
    if (count > 0) {
      this.logger.log(`Marked ${count} payables as OVERDUE`);
    }
  }
}
