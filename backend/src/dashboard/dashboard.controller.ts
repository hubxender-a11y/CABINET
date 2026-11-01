import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('monthly')
  getMonthlyReport(@Query('period') period: string) {
    if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('La période doit être au format AAAA-MM.');
    }
    return this.dashboardService.getMonthlyReport(period);
  }
}
