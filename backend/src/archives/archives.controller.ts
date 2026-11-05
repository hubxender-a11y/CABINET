import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ArchiveBinderListQueryDto,
  ArchiveListQueryDto,
  CreateArchiveBinderDto,
  CreateArchiveDocumentDto,
} from './archives.dto';
import { ArchivesService } from './archives.service';

const archiveManagers = [
  UserRole.COMPANY_ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.FINANCE_MANAGER,
];

@ApiTags('archives')
@ApiBearerAuth()
@Controller('archives')
@UseGuards(RolesGuard)
export class ArchivesController {
  constructor(private readonly archives: ArchivesService) {}

  @Get('binders')
  listBinders(
    @Query() query: ArchiveBinderListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.listBinders(query, request.user!.companyId);
  }

  @Post('binders')
  @Roles(...archiveManagers)
  createBinder(
    @Body() dto: CreateArchiveBinderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.createBinder(
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Delete('binders/:id')
  @Roles(...archiveManagers)
  deleteBinder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.deleteBinder(
      id,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Get()
  list(
    @Query() query: ArchiveListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.list(query, request.user!.companyId);
  }

  @Get('trash')
  @Roles(...archiveManagers)
  listTrash(
    @Query() query: ArchiveListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.listTrash(query, request.user!.companyId);
  }

  @Post()
  @Roles(...archiveManagers)
  create(
    @Body() dto: CreateArchiveDocumentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.create(
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Get(':id/content')
  async content(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const document = await this.archives.getContent(
      id,
      request.user!.companyId,
    );
    response.set({
      'Content-Type': document.mimeType,
      'Content-Length': document.data.length,
      'Content-Disposition': `${document.mimeType === 'application/pdf' || document.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename="${encodeURIComponent(document.originalName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    response.send(document.data);
  }

  @Delete(':id')
  @Roles(...archiveManagers)
  softDelete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.softDelete(
      id,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Post(':id/restore')
  @Roles(...archiveManagers)
  restore(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.restore(
      id,
      request.user!.companyId,
      request.user!.sub,
    );
  }

  @Delete(':id/permanent')
  @Roles(UserRole.COMPANY_ADMIN)
  permanentlyDelete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.archives.permanentlyDelete(
      id,
      request.user!.companyId,
      request.user!.sub,
    );
  }
}
