import { Module } from '@nestjs/common';
import { BancosService } from './bancos.service';
import { BancosController } from './bancos.controller';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [BancosController],
  providers: [BancosService],
  exports: [BancosService],
})
export class BancosModule {}
