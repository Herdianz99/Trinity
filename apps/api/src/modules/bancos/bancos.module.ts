import { Module } from '@nestjs/common';
import { BancosService } from './bancos.service';
import { BancosController } from './bancos.controller';

@Module({
  controllers: [BancosController],
  providers: [BancosService],
  exports: [BancosService],
})
export class BancosModule {}
