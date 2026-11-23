import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePlatformAdminDto, CreatePlatformUserDto } from './platform-admin.dto';
import { AssignManagingPartnerDto } from './assign-managing-partner.dto';
import { PlatformAdminService } from './platform-admin.service';

@ApiTags('platform-administration')
@ApiBearerAuth()
@Controller('platform-admin')
@UseGuards(RolesGuard)
@Roles(UserRole.PLATFORM_SUPER_ADMIN)
export class PlatformAdminController {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Read cross-company platform activity' })
  overview() {
    return this.platformAdmin.overview();
  }

  @Get('activities')
  @ApiOperation({ summary: 'Read paginated cross-company audit activity' })
  activities(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.platformAdmin.activities(page, pageSize, companyId);
  }

  @Get('users')
  @ApiOperation({ summary: 'Read users across company workspaces' })
  users(@Query('companyId') companyId?: string) {
    return this.platformAdmin.users(companyId);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a company user or add an existing account to a company' })
  createUser(
    @Body() dto: CreatePlatformUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.platformAdmin.createUser(dto, request.user!.sub);
  }

  @Post('payment-orders/resend-pending-emails')
  @ApiOperation({ summary: 'Resend pending payment orders to the managing partner by email' })
  resendPendingPaymentOrderEmails(@Req() request: AuthenticatedRequest) {
    return this.platformAdmin.resendPendingPaymentOrderEmails(request.user!.sub);
  }

  @Post('managing-partners')
  @ApiOperation({ summary: 'Grant global managing-partner access to an existing user' })
  assignManagingPartner(@Body() dto: AssignManagingPartnerDto, @Req() request: AuthenticatedRequest) {
    return this.platformAdmin.assignManagingPartner(dto.email, request.user!.sub);
  }

  @Post('admins')
  @ApiOperation({ summary: 'Create a platform super-admin or promote an existing account' })
  createAdmin(
    @Body() dto: CreatePlatformAdminDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.platformAdmin.createAdmin(dto, request.user!.sub);
  }
}
