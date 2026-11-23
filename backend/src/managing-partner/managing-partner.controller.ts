import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { RejectPaymentOrderDto } from '../payment-orders/payment-orders.dto';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';
import { ManagingPartnerService } from './managing-partner.service';

@ApiTags('managing-partner-global')
@ApiBearerAuth()
@Controller('managing-partner')
@UseGuards(RolesGuard)
@Roles(UserRole.PLATFORM_MANAGING_PARTNER)
export class ManagingPartnerController {
  constructor(
    private readonly managingPartner: ManagingPartnerService,
    private readonly paymentOrders: PaymentOrdersService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Read company-wide reports and payment-order register' })
  overview() {
    return this.managingPartner.overview();
  }

  @Get('companies/:companyId/details')
  @ApiOperation({ summary: 'Read cash, settlements and pending items for one company' })
  async companyDetails(@Param('companyId', new ParseUUIDPipe()) companyId: string) {
    const details = await this.managingPartner.companyDetails(companyId);
    if (!details) throw new NotFoundException('Entreprise introuvable.');
    return details;
  }

  @Post('payment-orders/:id/approve')
  @ApiOperation({ summary: 'Approve and sign a payment order in any company' })
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.managerVisaAcrossCompanies(
      id,
      request.user!.sub,
      request.user!.name,
    );
  }

  @Post('payment-orders/:id/reject')
  @ApiOperation({ summary: 'Reject a payment order in any company' })
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectPaymentOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentOrders.rejectAcrossCompanies(
      id,
      dto,
      request.user!.sub,
      request.user!.name,
    );
  }

  @Get('payment-orders/:id/attachment')
  @ApiOperation({ summary: 'Read an attached payment-order need statement' })
  async attachment(@Param('id', new ParseUUIDPipe()) id: string) {
    const file = await this.paymentOrders.attachmentAcrossCompanies(id);
    return {
      fileName: file.fileName,
      mimeType: file.mimeType,
      data: Buffer.from(file.data).toString('base64'),
    };
  }
}
