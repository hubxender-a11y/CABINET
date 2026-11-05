import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './invoices.dto';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices' })
  list() {
    return this.invoicesService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read an invoice and its immutable line snapshot' })
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoicesService.getOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an invoice draft from server-calculated lines',
  })
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }

  @Delete(':id')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.FINANCE_MANAGER)
  @ApiOperation({
    summary:
      'Permanently delete an uncertified invoice and its related records',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoicesService.delete(id);
  }
}
