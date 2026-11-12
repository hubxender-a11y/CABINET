import {
  Body,
  Controller,
  Get,
  Param,
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
  CancelCashVoucherDto,
  ConvertCashCurrencyDto,
  CreateCashVoucherDto,
  FundCashAccountDto,
  RejectCashVoucherDto,
  ReconcileCashAccountDto,
} from './cash-vouchers.dto';
import { CashVouchersService } from './cash-vouchers.service';

const cashVoucherIssuers = [
  UserRole.COMPANY_ADMIN,
  UserRole.FINANCE_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.CASHIER,
];

@ApiTags('cash-vouchers')
@ApiBearerAuth()
@Controller('cash-vouchers')
@UseGuards(RolesGuard)
export class CashVouchersController {
  constructor(private readonly vouchers: CashVouchersService) {}

  @Get()
  @ApiOperation({ summary: 'List cash disbursement vouchers' })
  list(@Req() request: AuthenticatedRequest) {
    return this.vouchers.list(request.user!.companyId);
  }

  @Get('treasury')
  @ApiOperation({
    summary: 'Get cash accounts, balances, and recent movements',
  })
  treasury(@Req() request: AuthenticatedRequest) {
    return this.vouchers.treasury(request.user!.companyId);
  }

  @Get('treasury/period')
  @ApiOperation({
    summary: 'Get a date-ranged cash-book and treasury statement',
  })
  treasuryPeriod(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vouchers.treasuryPeriod(request.user!.companyId, from, to);
  }

  @Post()
  @Roles(...cashVoucherIssuers)
  @ApiOperation({ summary: 'Issue a numbered cash disbursement voucher' })
  create(
    @Body() dto: CreateCashVoucherDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vouchers.create(
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post(':id/approve')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGING_PARTNER)
  @ApiOperation({
    summary: 'Approve and release a pending cash disbursement voucher',
  })
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vouchers.approve(
      id,
      request.user!.companyId,
      request.user!.sub,
      request.user!.name,
    );
  }

  @Post(':id/reject')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.MANAGING_PARTNER)
  @ApiOperation({ summary: 'Reject a pending cash disbursement voucher' })
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectCashVoucherDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vouchers.reject(
      id,
      dto,
      request.user!.companyId,
      request.user!.sub,
      request.user!.name,
    );
  }

  @Post(':id/cancel')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.FINANCE_MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Cancel a voucher without deleting its audit trail',
  })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelCashVoucherDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vouchers.cancel(
      id,
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post('accounts/:id/reconcile')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.FINANCE_MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: 'Reconcile the book balance with a physical cash count',
  })
  reconcile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReconcileCashAccountDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vouchers.reconcile(
      id,
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post('funding')
  @Roles(...cashVoucherIssuers)
  @ApiOperation({ summary: 'Record a cash opening balance or replenishment' })
  fund(@Body() dto: FundCashAccountDto, @Req() request: AuthenticatedRequest) {
    return this.vouchers.fund(dto, request.user!.companyId, request.user!.sub);
  }

  @Post('funding/convert')
  @Roles(...cashVoucherIssuers)
  @ApiOperation({ summary: 'Convert existing USD cash balance into CDF' })
  convertFundingCurrency(
    @Body() dto: ConvertCashCurrencyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.vouchers.convertFundingCurrency(
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }
}
