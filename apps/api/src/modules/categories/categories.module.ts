import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CompanyConfigModule } from '../company-config/company-config.module';
import { StoreExportModule } from '../store-export/store-export.module';

@Module({
  imports: [CompanyConfigModule, StoreExportModule], // recalcular precios (brecha) + re-export tienda (icono)
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
