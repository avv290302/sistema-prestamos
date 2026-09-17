import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Res,
  Get,
  Header,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/auth.decorators';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import {
  CancelPaymentDto,
  CreatePaymentDto,
  ListPaymentsDto,
} from './payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}
  @Post()
  @Roles('ADMIN', 'COLLECTOR')
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreatePaymentDto, @Req() req: AuthenticatedRequest) {
    if (!req.authUser)
      throw new UnauthorizedException('Sesión inválida o vencida.');
    return this.payments.create(dto, req.authUser.id);
  }
  @Post(':id/cancel')
  @Roles('ADMIN')
  @Header('Cache-Control', 'no-store')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.authUser) throw new UnauthorizedException();
    return this.payments.cancel(id, dto.reason, req.authUser.id);
  }
  @Get(':id')
  @Roles('ADMIN', 'COLLECTOR', 'VIEWER')
  @Header('Cache-Control', 'no-store')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.findOne(id);
  }
  @Get(':id/receipt.pdf')
  @Roles('ADMIN', 'COLLECTOR', 'VIEWER')
  @Header('Cache-Control', 'no-store')
  async receipt(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.payments.receipt(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="comprobante-' + id + '.pdf"',
    );
    res.send(pdf);
  }
  @Get()
  @Roles('ADMIN', 'COLLECTOR', 'VIEWER')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: ListPaymentsDto) {
    return this.payments.findAll(query);
  }
}
