import { Module } from '@nestjs/common';
import { WhatsappCampaignController } from './whatsapp-campaign.controller';
import { WhatsappCampaignService } from './whatsapp-campaign.service';

@Module({
  controllers: [WhatsappCampaignController],
  providers: [WhatsappCampaignService],
})
export class WhatsappCampaignModule {}
