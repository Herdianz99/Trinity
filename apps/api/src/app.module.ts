import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompanyConfigModule } from './modules/company-config/company-config.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { BrandsModule } from './modules/brands/brands.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ProductsModule } from './modules/products/products.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { StockModule } from './modules/stock/stock.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { InventoryCountsModule } from './modules/inventory-counts/inventory-counts.module';
import { StockMovementsModule } from './modules/stock-movements/stock-movements.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CompanyConfigModule,
    CategoriesModule,
    BrandsModule,
    SuppliersModule,
    ProductsModule,
    WarehousesModule,
    StockModule,
    TransfersModule,
    InventoryCountsModule,
    StockMovementsModule,
    PurchaseOrdersModule,
    ExchangeRateModule,
  ],
})
export class AppModule {}
