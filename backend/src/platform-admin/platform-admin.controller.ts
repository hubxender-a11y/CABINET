import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
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
}
