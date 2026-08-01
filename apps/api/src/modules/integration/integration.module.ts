import { Module } from '@nestjs/common';
import { StoreExportModule } from '../store-export/store-export.module';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { PartnerTransfersService } from './partner-transfers.service';
import { IntegrationCron } from './integration.cron';
import { PartnerClient } from './partner-client.service';

@Module({
  imports: [StoreExportModule],
  controllers: [IntegrationController],
  providers: [IntegrationService, PartnerTransfersService, PartnerClient, IntegrationCron],
  exports: [PartnerClient, IntegrationService],
})
export class IntegrationModule {}
