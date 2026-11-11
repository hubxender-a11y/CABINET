import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NotifyReportDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the signed-in user' })
  list(@Req() request: AuthenticatedRequest) {
    return this.notifications.list(
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Patch('read-all')
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Patch(':id/read')
  markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notifications.markRead(
      id,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post('reports')
  @Roles(
    UserRole.COMPANY_ADMIN,
    UserRole.FINANCE_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.CASHIER,
  )
  @ApiOperation({ summary: 'Send a monthly report to the managing partner' })
  sendReport(
    @Body() dto: NotifyReportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notifications.sendReportToManagingPartner(
      request.user!.companyId,
      request.user!.sub,
      request.user!.name,
      dto.period,
    );
  }
}
