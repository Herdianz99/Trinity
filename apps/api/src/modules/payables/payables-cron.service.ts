import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PayablesService } from './payables.service';

@Injectable()
export class PayablesCronService {
  private readonly logger = new Logger(PayablesCronService.name);

  constructor(private readonly payablesService: PayablesService) {}

  // 00:02 hora Caracas (el server corre en UTC; ver nota en ReceivablesCronService).
  @Cron('0 2 0 * * *', { timeZone: 'America/Caracas' })
  async handleOverduePayables() {
    const count = await this.payablesService.markOverdue();
    if (count > 0) {
      this.logger.log(`Marked ${count} payables as OVERDUE`);
    }
  }
}
