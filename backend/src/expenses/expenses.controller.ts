import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateExpenseDto } from './expenses.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('cabinet-expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'List the cabinet’s operating expenses' })
  list() {
    return this.expenses.list();
  }

  @Post()
  @ApiOperation({ summary: 'Record an operating expense' })
  create(@Body() dto: CreateExpenseDto) {
    return this.expenses.create(dto);
  }
}
