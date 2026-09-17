import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
@Module({ imports: [DatabaseModule], controllers: [CollectionsController], providers: [CollectionsService] })
export class CollectionsModule {}
