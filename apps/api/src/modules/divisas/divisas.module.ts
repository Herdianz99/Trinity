import { Module } from '@nestjs/common';
import { DivisasService } from './divisas.service';
import { DivisasController } from './divisas.controller';

@Module({
  controllers: [DivisasController],
  providers: [DivisasService],
})
export class DivisasModule {}
