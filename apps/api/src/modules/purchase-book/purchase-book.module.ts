import { Module } from '@nestjs/common';
import { PurchaseBookController } from './purchase-book.controller';
import { PurchaseBookService } from './purchase-book.service';

@Module({
  controllers: [PurchaseBookController],
  providers: [PurchaseBookService],
  exports: [PurchaseBookService],
})
export class PurchaseBookModule {}
