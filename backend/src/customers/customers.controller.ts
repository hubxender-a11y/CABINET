import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.dto';
import { CustomersService } from './customers.service';

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
}
