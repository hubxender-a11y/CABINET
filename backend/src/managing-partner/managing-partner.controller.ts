import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ManagingPartnerService } from './managing-partner.service';

@Controller('managing-partner')
@UseGuards(RolesGuard)
@Roles(UserRole.PLATFORM_MANAGING_PARTNER)
export class ManagingPartnerController {
  constructor(private readonly service: ManagingPartnerService) {}

  @Get('overview')
  overview(@Req() request: AuthenticatedRequest) {
    return this.service.overview(request.user!.sub);
  }
}
