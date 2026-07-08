import { Module } from '@nestjs/common';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateCronService } from './exchange-rate-cron.service';
import { RolePermissionsModule } from '../role-permissions/role-permissions.module';

@Module({
  imports: [RolePermissionsModule],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService, ExchangeRateCronService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
