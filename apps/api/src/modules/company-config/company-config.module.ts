import { Module } from '@nestjs/common';
import { CompanyConfigController } from './company-config.controller';
import { CompanyConfigService } from './company-config.service';

@Module({
  controllers: [CompanyConfigController],
  providers: [CompanyConfigService],
  exports: [CompanyConfigService],
})
export class CompanyConfigModule {}
