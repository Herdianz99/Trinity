import { Module } from '@nestjs/common';
import { SalesBookController } from './sales-book.controller';
import { SalesBookService } from './sales-book.service';

@Module({
  controllers: [SalesBookController],
  providers: [SalesBookService],
  exports: [SalesBookService],
})
export class SalesBookModule {}
