import { Controller, Get, Header, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ListCollectionsDto } from './collections.dto';
import { CollectionsService } from './collections.service';
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}
  @Get() @Roles('ADMIN', 'COLLECTOR', 'VIEWER') @Header('Cache-Control', 'no-store')
  list(@Query() query: ListCollectionsDto) { return this.collections.findAll(query); }
}
