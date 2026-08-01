import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntegrationService } from './integration.service';
import { PartnerTransfersService } from './partner-transfers.service';
import { canCallPartner } from './integration.config';

// Red de seguridad: reconcilia las altas del socio no sincronizadas por push y
// reintenta los envios de traslado no notificados. Solo si la integracion esta configurada.
@Injectable()
export class IntegrationCron {
  private readonly logger = new Logger(IntegrationCron.name);

  constructor(
    private readonly service: IntegrationService,
    private readonly transfers: PartnerTransfersService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES, { timeZone: 'America/Caracas' })
  async handle() {
    if (!canCallPartner()) return;
    try {
      const r = await this.service.reconcileFromPartner();
      if (r.created > 0) this.logger.log(`Reconciliacion socio: ${r.created} altas creadas`);
    } catch (e) {
      this.logger.error(`Reconciliacion socio fallo: ${(e as Error).message}`);
    }
    try {
      const n = await this.transfers.retryUnnotified();
      if (n > 0) this.logger.log(`Traslados reintentados: ${n}`);
    } catch (e) {
      this.logger.error(`Reintento de traslados fallo: ${(e as Error).message}`);
    }
  }
}
