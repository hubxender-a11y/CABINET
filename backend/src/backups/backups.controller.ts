import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BackupsService } from './backups.service';

@ApiTags('cabinet-backups')
@ApiBearerAuth()
@Controller('backups')
@UseGuards(RolesGuard)
@Roles(UserRole.COMPANY_ADMIN)
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get('export')
  @ApiOperation({ summary: 'Export a cabinet-scoped JSON backup' })
  async export(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.backups.export(
      request.user!.companyId,
      request.user!.sub,
    );
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="cabinet-transparency-backup.json"',
    );
    response.setHeader('Cache-Control', 'no-store');
    return content;
  }

  @Get('modules')
  @ApiOperation({ summary: 'List business modules that can be cleared' })
  modules() {
    return this.backups.modules();
  }

  @Post('clear-module')
  @ApiOperation({ summary: 'Clear one selected business module' })
  clearModule(
    @Body() body: { module?: string; confirmation?: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.backups.clearModule(
      body?.module ?? '',
      body?.confirmation ?? '',
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post('restore')
  @UseInterceptors(
    FileInterceptor('backup', {
      limits: { fileSize: 30 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Restore a cabinet-scoped JSON backup' })
  restore(
    @Body('confirmation') confirmation: string,
    @UploadedFile()
    file: { originalname: string; buffer: Buffer; size: number } | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!file) throw new BadRequestException('Sélectionnez le fichier JSON à restaurer.');
    return this.backups.restore(
      file.originalname,
      file.buffer,
      confirmation,
      request.user!.companyId,
      request.user!.sub,
    );
  }
}
