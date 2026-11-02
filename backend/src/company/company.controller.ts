import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateCompanyDto, UpdateInvoiceTemplateDto } from './company.dto';
import { CompanyService } from './company.service';

@ApiTags('cabinet-settings')
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

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
