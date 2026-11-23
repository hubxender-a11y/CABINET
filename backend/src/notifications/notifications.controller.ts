import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user notifications' })
  list(@Req() request: AuthenticatedRequest) {
    if (request.user!.role === 'PLATFORM_MANAGING_PARTNER') {
      return this.notifications.listAcrossCompanies(request.user!.sub);
    }
    return this.notifications.list(
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all authenticated user notifications as read' })
  markAllRead(@Req() request: AuthenticatedRequest) {
    if (request.user!.role === 'PLATFORM_MANAGING_PARTNER') {
      return this.notifications.markAllReadAcrossCompanies(request.user!.sub);
    }
    return this.notifications.markAllRead(
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one authenticated user notification as read' })
  markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (request.user!.role === 'PLATFORM_MANAGING_PARTNER') {
      return this.notifications.markReadAcrossCompanies(id, request.user!.sub);
    }
    return this.notifications.markRead(
      id,
      request.user!.companyId,
      request.user!.sub,
    );
  }
}
