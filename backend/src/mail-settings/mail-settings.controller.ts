import { Controller, Delete, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MailSettingsService } from './mail-settings.service';

@ApiTags('mail-settings')
@ApiBearerAuth()
@Controller('mail-settings')
export class MailSettingsController {
  constructor(private readonly mail: MailSettingsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  status(@Req() request: AuthenticatedRequest) {
    return this.mail.status(request.user!.companyId);
  }

  @Post('google/connect')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Start Google OAuth for company email notifications' })
  connect(@Req() request: AuthenticatedRequest) {
    return this.mail.connectUrl(request.user!.companyId, request.user!.sub);
  }

  @Get('google/callback')
  @Public()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    const fallback = process.env.APP_WEB_URL?.trim() || process.env.FRONTEND_ORIGIN?.split(',')[0]?.trim() || 'https://facture-rdc.vercel.app';
    try {
      if (error || !code || !state) {
        await this.mail.cancelAuthorization(state);
        throw new Error('Connexion Google annulée ou invalide.');
      }
      const result = await this.mail.completeAuthorization(code, state);
      return response.redirect(`${result.webUrl}/settings?mail=connected`);
    } catch {
      return response.redirect(`${fallback}/settings?mail=error`);
    }
  }

  @Post('test')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Send a test message to the managing partner' })
  test(@Req() request: AuthenticatedRequest) {
    return this.mail.sendTest(request.user!.companyId);
  }

  @Delete('google')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  disconnect(@Req() request: AuthenticatedRequest) {
    return this.mail.disconnect(request.user!.companyId, request.user!.sub);
  }
}
