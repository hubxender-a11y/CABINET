import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CancelPaymentDto, CreatePaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List cabinet payments' })
  list() {
    return this.payments.list();
  }

  @Post()
  @ApiOperation({ summary: 'Register a payment against an invoice' })
  create(@Body() dto: CreatePaymentDto) {
    return this.payments.create(dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a received payment and preserve its audit trail' })
  cancel(@Param('id') id: string, @Body() dto: CancelPaymentDto) {
    return this.payments.cancel(id, dto.reason);
  }
}
