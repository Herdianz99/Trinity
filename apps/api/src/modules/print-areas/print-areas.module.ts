import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrintAreasController } from './print-areas.controller';
import { PrintAreasService } from './print-areas.service';

@Module({
  imports: [PrismaModule],
  controllers: [PrintAreasController],
  providers: [PrintAreasService],
  exports: [PrintAreasService],
})
export class PrintAreasModule {}
