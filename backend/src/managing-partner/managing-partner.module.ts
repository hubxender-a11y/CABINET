import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentOrdersModule } from '../payment-orders/payment-orders.module';
import { ManagingPartnerController } from './managing-partner.controller';
import { ManagingPartnerService } from './managing-partner.service';

@Module({
  imports: [NotificationsModule, PaymentOrdersModule],
  controllers: [ManagingPartnerController],
  providers: [ManagingPartnerService],
})
export class ManagingPartnerModule {}
