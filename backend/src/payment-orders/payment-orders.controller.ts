import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreatePaymentOrderDto,
  RejectPaymentOrderDto,
} from './payment-orders.dto';
import { PaymentOrdersService } from './payment-orders.service';

const requestRoles = [
  UserRole.COMPANY_ADMIN,
  UserRole.FINANCE_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.CASHIER,
];
const financeRoles = [
  UserRole.COMPANY_ADMIN,
  UserRole.FINANCE_MANAGER,
  UserRole.ACCOUNTANT,
];

@ApiTags('payment-orders')
@ApiBearerAuth()
@Controller('payment-orders')
@UseGuards(RolesGuard)
export class PaymentOrdersController {
  constructor(private readonly paymentOrders: PaymentOrdersService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.paymentOrders.list(request.user!.companyId);
  }

  @Post()
  @Roles(...requestRoles)
  @ApiOperation({ summary: 'Submit a numbered payment order for approval' })
  create(
    @Body() dto: CreatePaymentOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.create(
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post(':id/finance-visa')
  @Roles(...financeRoles)
  @ApiOperation({ summary: 'Record the finance visa on a payment order' })
  financeVisa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.financeVisa(
      id,
      request.user!.companyId,
      request.user!.sub,
      request.user!.name,
    );
  }

  @Post(':id/manager-visa')
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Record the managing partner visa on a payment order',
  })
  managerVisa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.managerVisa(
      id,
      request.user!.companyId,
      request.user!.sub,
      request.user!.name,
    );
  }

  @Post(':id/reject')
  @Roles(...financeRoles)
  @ApiOperation({ summary: 'Reject a payment order with a recorded reason' })
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectPaymentOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.reject(
      id,
      dto,
      request.user!.companyId,
      request.user!.sub,
      request.user!.name,
    );
  }

  @Get(':id/attachment')
  attachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders
      .attachment(id, request.user!.companyId)
      .then((file) => ({
        fileName: file.fileName,
        mimeType: file.mimeType,
        data: Buffer.from(file.data).toString('base64'),
      }));
  }

  @Post(':id/pay')
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Pay an approved order and issue its numbered cash voucher',
  })
  pay(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.pay(
      id,
      request.user!.companyId,
      request.user!.sub,
    );
  }
}
