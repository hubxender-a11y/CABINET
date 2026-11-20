import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { PaymentOrdersEmailService } from '../payment-orders/payment-orders-email.service';

@Module({
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PaymentOrdersEmailService],
})
export class PlatformAdminModule {}
