import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePaymentDto } from './payments.dto';
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
}
