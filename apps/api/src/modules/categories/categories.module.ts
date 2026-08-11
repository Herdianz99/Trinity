import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CompanyConfigModule } from '../company-config/company-config.module';

@Module({
  imports: [CompanyConfigModule], // para recalcular precios al cambiar la brecha de una categoria
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
