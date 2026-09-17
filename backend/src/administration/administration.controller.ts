import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ListClientsDto } from '../clients/dto/list-clients.dto';
import { CreateUserDto, UpdateUserDto, SettingsDto, DeleteUserDto } from './administration.dto';
import { AdministrationService } from './administration.service';
function actor(req: AuthenticatedRequest) { if(!req.authUser) throw new UnauthorizedException(); return req.authUser.id; }
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly admin: AdministrationService) {}
  @Get() @Header('Cache-Control','no-store')
  list(@Query() query: ListClientsDto) { return this.admin.listUsers(query); }
  @Post() @Header('Cache-Control','no-store')
  create(@Body() dto: CreateUserDto, @Req() req: AuthenticatedRequest) { return this.admin.createUser(dto,actor(req)); }
  @Delete(':id') @Header('Cache-Control','no-store')
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: DeleteUserDto, @Req() req: AuthenticatedRequest) { return this.admin.deleteUser(id,dto.version,actor(req)); }
  @Patch(':id') @Header('Cache-Control','no-store')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateUserDto, @Req() req: AuthenticatedRequest) { return this.admin.updateUser(id,dto,actor(req)); }
}
@Controller('settings')
@Roles('ADMIN')
export class SettingsController {
  constructor(private readonly admin: AdministrationService) {}
  @Get('branding') @Roles('ADMIN','COLLECTOR','VIEWER') @Header('Cache-Control','no-store')
  branding() { return this.admin.branding(); }
  @Get() @Header('Cache-Control','no-store')
  get() { return this.admin.settings(); }
  @Put() @Header('Cache-Control','no-store')
  save(@Body() dto: SettingsDto, @Req() req: AuthenticatedRequest) { return this.admin.saveSettings(dto,actor(req)); }
}
