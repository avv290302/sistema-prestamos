import { Body, Controller, Delete, Patch, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ClientDirectoryDto, VersionDto } from '../clients/dto/update-client.dto';
import { CreateLoanDto, LoanPlanDto, UpdateLoanDto } from './loan.dto';
import { buildLoanPlan } from './loan-plan';
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Post('preview')
  @Roles('ADMIN')
  @Header('Cache-Control', 'no-store')
  preview(@Body() dto: LoanPlanDto) { return buildLoanPlan(dto.principalCents, dto.firstPaymentDate, dto); }

  @Post()
  @Roles('ADMIN')
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreateLoanDto, @Req() req: AuthenticatedRequest) {
    if (!req.authUser) throw new UnauthorizedException('Sesión inválida o vencida.');
    return this.loans.create(dto, req.authUser.id);
  }

  @Get()
  @Roles('ADMIN', 'COLLECTOR', 'VIEWER')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: ClientDirectoryDto) { return this.loans.findAll(query); }

  @Patch(':id') @Roles('ADMIN') @Header('Cache-Control','no-store')
  update(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateLoanDto,@Req() req:AuthenticatedRequest){if(!req.authUser)throw new UnauthorizedException();return this.loans.update(id,dto,req.authUser.id);}
  @Delete(':id') @Roles('ADMIN') @Header('Cache-Control','no-store')
  remove(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:VersionDto,@Req() req:AuthenticatedRequest){if(!req.authUser)throw new UnauthorizedException();return this.loans.archive(id,dto.version,req.authUser.id);}
  @Post(':id/restore') @Roles('ADMIN') @Header('Cache-Control','no-store')
  restore(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:VersionDto,@Req() req:AuthenticatedRequest){if(!req.authUser)throw new UnauthorizedException();return this.loans.archive(id,dto.version,req.authUser.id,true);}
  @Get(':id')
  @Roles('ADMIN', 'COLLECTOR', 'VIEWER')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', new ParseUUIDPipe()) id: string) { return this.loans.findOne(id); }
}
