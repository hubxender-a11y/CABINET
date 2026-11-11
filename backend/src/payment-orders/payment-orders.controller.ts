import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
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
  SavePaymentOrderAccountingRuleDto,
  SavePaymentOrderBudgetDto,
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

  @Get('configuration')
  configuration(
    @Query('year', ParseIntPipe) year: number,
    @Query('currency') currency: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (currency !== 'CDF' && currency !== 'USD')
      throw new BadRequestException('Devise budgétaire invalide.');
    return this.paymentOrders.configuration(
      request.user!.companyId,
      year,
      currency,
    );
  }

  @Post('budgets')
  @Roles(...financeRoles)
  saveBudget(
    @Body() dto: SavePaymentOrderBudgetDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.saveBudget(
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post('accounting-rules')
  @Roles(...financeRoles)
  saveAccountingRule(
    @Body() dto: SavePaymentOrderAccountingRuleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.saveAccountingRule(
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
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
  @Roles(UserRole.COMPANY_ADMIN)
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
  @Roles(...requestRoles)
  @ApiOperation({
    summary: 'Issue a numbered cash voucher for review after the OP is approved',
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
