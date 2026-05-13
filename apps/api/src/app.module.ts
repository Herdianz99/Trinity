import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { CustomersModule } from './modules/customers/customers.module';
import { CashRegistersModule } from './modules/cash-registers/cash-registers.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PrintAreasModule } from './modules/print-areas/print-areas.module';
import { ImportModule } from './modules/import/import.module';
import { PrintJobsModule } from './modules/print-jobs/print-jobs.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';
import { PayablesModule } from './modules/payables/payables.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { RedisModule } from './redis/redis.module';
import { RolePermissionsModule } from './modules/role-permissions/role-permissions.module';
import { SellersModule } from './modules/sellers/sellers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RedisModule,
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
    CustomersModule,
    CashRegistersModule,
    InvoicesModule,
    PrintAreasModule,
    ImportModule,
    PrintJobsModule,
    QuotationsModule,
    ReceivablesModule,
    PayablesModule,
    FiscalModule,
    RolePermissionsModule,
    SellersModule,
  ],
})
export class AppModule {}
