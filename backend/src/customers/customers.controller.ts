import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.dto';
import { CustomersService } from './customers.service';
import { CreateCustomerDocumentDto } from './customer-document.dto';

class CustomerSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

@ApiTags('customer-dossiers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Search client dossiers' })
  list(@Query() query: CustomerSearchDto) {
    return this.customers.list(query.q?.trim());
  }

  @Get(':id/statement')
  @ApiOperation({
    summary: 'Get a client account statement and payment history',
  })
  statement(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customers.statement(id);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'List supporting documents in a client dossier' })
  listDocuments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customers.listDocuments(id);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Add a supporting document to a client dossier' })
  addDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCustomerDocumentDto,
  ) {
    return this.customers.addDocument(id, dto);
  }

  @Delete(':id/documents/:documentId')
  @ApiOperation({
    summary: 'Remove a supporting document from a client dossier',
  })
  deleteDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.customers.deleteDocument(id, documentId);
  }

  @Get(':id/documents/:documentId/content')
  @ApiOperation({ summary: 'Preview or download a client dossier document' })
  async documentContent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const document = await this.customers.getDocument(id, documentId);
    const disposition = download === 'true' ? 'attachment' : 'inline';
    const filename = encodeURIComponent(document.name);
    response.set({
      'Content-Type': document.mimeType,
      'Content-Length': String(document.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${filename}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(document.data);
  }

  @Post()
  @ApiOperation({ summary: 'Create a client dossier for the cabinet' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a client dossier' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Remove a client dossier from the active list without deleting its history',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customers.delete(id);
  }
}
