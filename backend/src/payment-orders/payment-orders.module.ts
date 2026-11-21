import { Module } from '@nestjs/common';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentOrdersService } from './payment-orders.service';
import { PaymentOrdersEmailService } from './payment-orders-email.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailSettingsModule } from '../mail-settings/mail-settings.module';

@Module({
  controllers: [PaymentOrdersController],
  imports: [NotificationsModule, MailSettingsModule],
  providers: [PaymentOrdersService, PaymentOrdersEmailService],
})
export class PaymentOrdersModule {}
