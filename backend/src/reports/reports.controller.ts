import { Controller, Get, Header, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ReportQueryDto } from './reports.dto';
import { ReportsService } from './reports.service';
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() @Roles('ADMIN', 'COLLECTOR', 'VIEWER') @Header('Cache-Control', 'no-store')
  overview(@Query() query: ReportQueryDto) { return this.reports.overview(query); }
}
