import { Module } from '@nestjs/common';
import { ClientOrdersController } from './client-orders.controller';
import { ClientOrdersService } from './client-orders.service';

@Module({
  controllers: [ClientOrdersController],
  providers: [ClientOrdersService],
})
export class ClientOrdersModule {}
