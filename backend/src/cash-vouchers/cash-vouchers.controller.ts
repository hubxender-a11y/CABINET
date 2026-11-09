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
  CancelCashVoucherDto,
  CreateCashVoucherDto,
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
}
