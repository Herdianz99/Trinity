import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { PartnerClient } from './partner-client.service';

@Module({
  controllers: [IntegrationController],
  providers: [IntegrationService, PartnerClient],
  exports: [PartnerClient, IntegrationService],
})
export class IntegrationModule {}
