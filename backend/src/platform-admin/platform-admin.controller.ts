import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
