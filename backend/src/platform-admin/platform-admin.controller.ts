import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformAdminService } from './platform-admin.service';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { AssignManagingPartnerDto } from './assign-managing-partner.dto';

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

  @Post('managing-partners')
  @ApiOperation({ summary: 'Grant cross-company operations access to an existing manager account' })
  assignManagingPartner(
    @Body() dto: AssignManagingPartnerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.platformAdmin.assignManagingPartner(
      dto.email,
      request.user!.sub,
    );
  }
}
