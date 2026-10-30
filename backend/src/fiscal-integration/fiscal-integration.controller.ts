import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FiscalIntegrationService } from './fiscal-integration.service';

@ApiTags('fiscal-integration')
@Controller('fiscal')
export class FiscalIntegrationController {
  constructor(private readonly fiscalIntegrationService: FiscalIntegrationService) {}

  @Get('status')
  @ApiOperation({ summary: 'Return the current fiscal integration status' })
  getStatusSummary() {
    return this.fiscalIntegrationService.getStatusSummary();
  }

  @Post('transmit')
  @ApiOperation({ summary: 'Transmit an invoice to the fiscal device' })
  transmit(@Body() payload: { invoiceId: string }) {
    return this.fiscalIntegrationService.transmit(payload.invoiceId);
  }
}
