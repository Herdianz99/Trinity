import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { ProductsModule } from '../products/products.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MeModule } from '../me/me.module';

@Module({
  imports: [ProductsModule, InvoicesModule, MeModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
