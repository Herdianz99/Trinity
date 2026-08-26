import { Module } from '@nestjs/common';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryPdfService } from './disciplinary-pdf.service';
import { DisciplinaryController } from './disciplinary.controller';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [ProductImagesModule], // reutiliza SpacesService para las fotos del acta
  controllers: [DisciplinaryController],
  providers: [DisciplinaryService, DisciplinaryPdfService],
})
export class DisciplinaryModule {}
