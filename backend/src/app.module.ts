import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FiscalIntegrationModule } from './fiscal-integration/fiscal-integration.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CashVouchersModule } from './cash-vouchers/cash-vouchers.module';
import { PaymentOrdersModule } from './payment-orders/payment-orders.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CompanyModule } from './company/company.module';
import { InventoryModule } from './inventory/inventory.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { ArchivesModule } from './archives/archives.module';
import { BackupsModule } from './backups/backups.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    NotificationsModule,
    DatabaseModule,
    UsersModule,
    CompanyModule,
    InventoryModule,
    FixedAssetsModule,
    ArchivesModule,
    BackupsModule,
    CustomersModule,
    DashboardModule,
    InvoicesModule,
    PaymentsModule,
    ExpensesModule,
    CashVouchersModule,
    PaymentOrdersModule,
    FiscalIntegrationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
