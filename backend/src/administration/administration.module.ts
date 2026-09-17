import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdministrationService } from './administration.service';
import { UsersController, SettingsController } from './administration.controller';
@Module({imports:[DatabaseModule],controllers:[UsersController,SettingsController],providers:[AdministrationService]})
export class AdministrationModule {}
