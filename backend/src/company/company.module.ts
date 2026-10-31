import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';

@Module({
  controllers: [CompanyController],
  providers: [CompanyService, RolesGuard],
})
export class CompanyModule {}
