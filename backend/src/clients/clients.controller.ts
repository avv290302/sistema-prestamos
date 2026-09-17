import { Body, Controller, Delete, ForbiddenException, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../auth/auth.decorators';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ClientDirectoryDto, UpdateClientDto, VersionDto } from './dto/update-client.dto';
import type { ClientUpload } from './client-document';
@Controller('clients')
export class ClientsController {
 constructor(private readonly clients:ClientsService){}
 @Post() @Roles('ADMIN') @Header('Cache-Control','no-store')
 create(@Body() dto:CreateClientDto,@Req() req:AuthenticatedRequest){if(!req.authUser)throw new UnauthorizedException();return this.clients.create(dto,req.authUser.id);}
 @Get() @Roles('ADMIN','COLLECTOR','VIEWER') @Header('Cache-Control','no-store')
 findAll(@Query() query:ClientDirectoryDto){return this.clients.findAll(query);}
 @Get(':id') @Roles('ADMIN','COLLECTOR','VIEWER') @Header('Cache-Control','no-store')
 findOne(@Param('id',new ParseUUIDPipe()) id:string){return this.clients.findOne(id);}
 @Patch(':id') @Roles('ADMIN') @Header('Cache-Control','no-store')
 update(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateClientDto){return this.clients.update(id,dto);}
 @Delete(':id') @Roles('ADMIN') @Header('Cache-Control','no-store')
 remove(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:VersionDto){return this.clients.archive(id,dto.version);}
 @Post(':id/restore') @Roles('ADMIN') @Header('Cache-Control','no-store')
 restore(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:VersionDto){return this.clients.archive(id,dto.version,true);}
 @Post(':id/documents/:kind') @Roles('ADMIN') @Header('Cache-Control','no-store')
 @UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:1}}))
 upload(@Param('id',new ParseUUIDPipe()) id:string,@Param('kind') kind:string,@Body() dto:VersionDto,@UploadedFile() file:ClientUpload|undefined){return this.clients.saveDocument(id,kind,dto.version,file);}
 @Delete(':id/documents/:kind') @Roles('ADMIN') @Header('Cache-Control','no-store')
 removeFile(@Param('id',new ParseUUIDPipe()) id:string,@Param('kind') kind:string,@Body() dto:VersionDto){return this.clients.removeDocument(id,kind,dto.version);}
 @Get(':id/documents/:kind') @Roles('ADMIN','COLLECTOR','VIEWER')
 async file(@Param('id',new ParseUUIDPipe()) id:string,@Param('kind') kind:string,@Req() req:AuthenticatedRequest,@Res() res:Response){
  if(kind==='INE'&&req.authUser?.role!=='ADMIN')throw new ForbiddenException('La INE solo puede consultarla un administrador.');
  const file=await this.clients.document(id,kind);
  res.set({'Content-Type':file.mimeType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${kind==='PHOTO'?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`});
  res.send(Buffer.from(file.data));
 }
}
