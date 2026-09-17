import { AdministrationModule } from "./administration/administration.module";
import { ReportsModule } from "./reports/reports.module";
import { CollectionsModule } from "./collections/collections.module";
import { PaymentsModule } from "./payments/payments.module";
import { LoansModule } from "./loans/loans.module";
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { ClientsModule } from "./clients/clients.module";

@Module({
  imports: [
    DatabaseModule,
    AdministrationModule,
    AuthModule,
    ClientsModule,
    LoansModule,
    PaymentsModule,
    CollectionsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}