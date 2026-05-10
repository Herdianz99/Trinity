import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReceivablesService } from './receivables.service';

@Injectable()
export class ReceivablesCronService {
  private readonly logger = new Logger(ReceivablesCronService.name);

  constructor(private readonly receivablesService: ReceivablesService) {}

  @Cron('0 1 0 * * *') // Every day at 00:01
  async handleOverdueCheck() {
    this.logger.log('Checking for overdue receivables...');
    const count = await this.receivablesService.markOverdue();
    if (count > 0) {
      this.logger.log(`Marked ${count} receivable(s) as OVERDUE`);
    }
    this.logger.log('Overdue check complete');
  }
}
