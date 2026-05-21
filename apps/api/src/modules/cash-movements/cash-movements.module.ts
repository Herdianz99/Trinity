import { Module } from '@nestjs/common';
import { CashMovementsController } from './cash-movements.controller';
import { CashMovementsService } from './cash-movements.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [CashMovementsController],
  providers: [CashMovementsService],
  exports: [CashMovementsService],
})
export class CashMovementsModule {}
