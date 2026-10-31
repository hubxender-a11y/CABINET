import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FiscalIntegrationModule } from './fiscal-integration/fiscal-integration.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompanyModule } from './company/company.module';
import { InventoryModule } from './inventory/inventory.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    DatabaseModule,
    UsersModule,
    CompanyModule,
    InventoryModule,
    CustomersModule,
    DashboardModule,
    InvoicesModule,
    PaymentsModule,
    ExpensesModule,
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
