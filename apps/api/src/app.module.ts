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
import { InventoryAdjustmentsModule } from './modules/inventory-adjustments/inventory-adjustments.module';
import { InventoryReplacementsModule } from './modules/inventory-replacements/inventory-replacements.module';
import { LabelsModule } from './modules/labels/labels.module';
import { LostSalesModule } from './modules/lost-sales/lost-sales.module';
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
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { CreditDebitNotesModule } from './modules/credit-debit-notes/credit-debit-notes.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { PaymentSchedulesModule } from './modules/payment-schedules/payment-schedules.module';
import { DynamicKeysModule } from './modules/dynamic-keys/dynamic-keys.module';
import { CashMovementsModule } from './modules/cash-movements/cash-movements.module';
import { InventoryAnalysisModule } from './modules/inventory-analysis/inventory-analysis.module';
import { IvaRetentionModule } from './modules/iva-retention/iva-retention.module';
import { PurchaseBookModule } from './modules/purchase-book/purchase-book.module';
import { SalesBookModule } from './modules/sales-book/sales-book.module';
import { ZReportsModule } from './modules/z-reports/z-reports.module';
import { RetentionVouchersModule } from './modules/retention-vouchers/retention-vouchers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { SeriesModule } from './modules/series/series.module';
import { CustomerAdvancesModule } from './modules/customer-advances/customer-advances.module';
import { SupplierAdvancesModule } from './modules/supplier-advances/supplier-advances.module';
import { IslrRetentionTypesModule } from './modules/islr-retention-types/islr-retention-types.module';
import { IslrRetentionVouchersModule } from './modules/islr-retention-vouchers/islr-retention-vouchers.module';
import { CustomerIvaRetentionsModule } from './modules/customer-iva-retentions/customer-iva-retentions.module';
import { ProductImagesModule } from './modules/product-images/product-images.module';
import { StoreExportModule } from './modules/store-export/store-export.module';
import { PublicModule } from './modules/public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RedisModule,
    PrismaModule,
    HealthModule,
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
    InventoryAdjustmentsModule,
    InventoryReplacementsModule,
    LabelsModule,
    LostSalesModule,
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
    PaymentMethodsModule,
    ReceiptsModule,
    CreditDebitNotesModule,
    ExpensesModule,
    PaymentSchedulesModule,
    DynamicKeysModule,
    CashMovementsModule,
    InventoryAnalysisModule,
    IvaRetentionModule,
    PurchaseBookModule,
    SalesBookModule,
    ZReportsModule,
    RetentionVouchersModule,
    DashboardModule,
    ReportsModule,
    SeriesModule,
    CustomerAdvancesModule,
    SupplierAdvancesModule,
    IslrRetentionTypesModule,
    IslrRetentionVouchersModule,
    CustomerIvaRetentionsModule,
    ProductImagesModule,
    StoreExportModule,
    PublicModule,
  ],
})
export class AppModule {}
