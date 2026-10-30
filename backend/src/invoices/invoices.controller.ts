import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './invoices.dto';

@ApiTags('invoices')
@Controller('invoices')
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
  @ApiOperation({ summary: 'Create an invoice draft from server-calculated lines' })
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(dto);
  }
}
