import { Module } from '@nestjs/common';
import { CashVouchersController } from './cash-vouchers.controller';
import { CashVouchersService } from './cash-vouchers.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [CashVouchersController],
  imports: [NotificationsModule],
  providers: [CashVouchersService],
})
export class CashVouchersModule {}
