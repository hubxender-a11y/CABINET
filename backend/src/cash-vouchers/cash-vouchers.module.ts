import { Module } from '@nestjs/common';
import { CashVouchersController } from './cash-vouchers.controller';
import { CashVouchersService } from './cash-vouchers.service';

@Module({
  controllers: [CashVouchersController],
  providers: [CashVouchersService],
})
export class CashVouchersModule {}
