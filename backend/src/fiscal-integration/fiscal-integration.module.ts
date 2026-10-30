import { Module } from '@nestjs/common';
import { FiscalIntegrationController } from './fiscal-integration.controller';
import { FiscalIntegrationService } from './fiscal-integration.service';

@Module({
  controllers: [FiscalIntegrationController],
  providers: [FiscalIntegrationService],
})
export class FiscalIntegrationModule {}
