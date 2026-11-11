import { Module } from '@nestjs/common';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentOrdersService } from './payment-orders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [PaymentOrdersController],
  imports: [NotificationsModule],
  providers: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
