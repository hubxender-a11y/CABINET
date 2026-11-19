import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCompanyDto, CreatePlatformAdminDto, UpdateCompanyDto, UpdateInvoiceTemplateDto } from './company.dto';
import { CompanyService } from './company.service';

@ApiTags('cabinet-settings')
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get('platform/companies')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'List all companies on the platform' })
  listPlatformCompanies() {
    return this.company.listPlatformCompanies();
  }

  @Post('platform/companies')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Create an isolated company workspace' })
  createPlatformCompany(
    @Body() dto: CreateCompanyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.company.createPlatformCompany(dto, request.user!.sub);
  }

  @Patch('platform/companies/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Update company identity and branding' })
  updatePlatformCompany(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCompanyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.company.updatePlatformCompany(id, dto, request.user!.sub);
  }

  @Delete('platform/companies/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete an isolated company workspace' })
  deletePlatformCompany(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.company.deletePlatformCompany(id, request.user!.sub);
  }

  @Post('platform/companies/:id/restore')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Restore an archived company workspace' })
  restorePlatformCompany(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.company.restorePlatformCompany(id, request.user!.sub);
  }

  @Get('platform/admins')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'List platform super-administrators' })
  listPlatformAdmins() {
    return this.company.listPlatformAdmins();
  }

  @Post('platform/admins')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Grant platform super-administrator access to an existing user' })
  addPlatformAdmin(
    @Body() dto: CreatePlatformAdminDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.company.addPlatformAdmin(dto.email, request.user!.sub);
  }

  @Delete('platform/admins/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Revoke platform super-administrator access' })
  removePlatformAdmin(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.company.removePlatformAdmin(id, request.user!.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Read cabinet identity and contact details' })
  get() {
    return this.company.get();
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update cabinet identity and contact details' })
  update(@Body() dto: UpdateCompanyDto, @Req() request: AuthenticatedRequest) {
    return this.company.update(dto, request.user!.sub);
  }

  @Patch('invoice-template')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update the invoice template layout' })
  updateInvoiceTemplate(
    @Body() dto: UpdateInvoiceTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.company.updateInvoiceTemplate(
      dto.invoiceTemplate,
      request.user!.sub,
    );
  }
}
