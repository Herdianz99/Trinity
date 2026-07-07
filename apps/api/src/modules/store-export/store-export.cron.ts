import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StoreExportService } from './store-export.service';

@Injectable()
export class StoreExportCron {
  private readonly logger = new Logger(StoreExportCron.name);

  constructor(private service: StoreExportService) {}

  // Cada 10 minutos. timeZone Caracas por consistencia con los demás crons del proyecto.
  @Cron(CronExpression.EVERY_10_MINUTES, { timeZone: 'America/Caracas' })
  async handle() {
    try {
      await this.service.exportCatalog();
    } catch (e) {
      this.logger.error(`Fallo el export de tienda: ${(e as Error).message}`);
    }
  }
}
