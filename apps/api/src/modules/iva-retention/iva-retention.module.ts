import { Module } from '@nestjs/common';
import { IvaRetentionController } from './iva-retention.controller';
import { IvaRetentionService } from './iva-retention.service';

@Module({
  controllers: [IvaRetentionController],
  providers: [IvaRetentionService],
  exports: [IvaRetentionService],
})
export class IvaRetentionModule {}
