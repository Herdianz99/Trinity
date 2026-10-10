import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerPortalAccessService } from './customer-portal-access.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerPortalAccessService],
  exports: [CustomersService],
})
export class CustomersModule {}
