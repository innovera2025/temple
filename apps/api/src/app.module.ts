import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { AttachmentsModule } from "./attachments/attachments.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CeremoniesModule } from "./ceremonies/ceremonies.module";
import { ProjectExceptionFilter } from "./common/filters/project-exception.filter";
import { validateEnv } from "./config/env.validation";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DevoteeModule } from "./devotee/devotee.module";
import { DonationsModule } from "./donations/donations.module";
import { DonorsModule } from "./donors/donors.module";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ItemLoansModule } from "./item-loans/item-loans.module";
import { LedgerModule } from "./ledger/ledger.module";
import { PersonnelModule } from "./personnel/personnel.module";
import { PlatformModule } from "./platform/platform.module";
import { PublicModule } from "./public/public.module";
import { ReceiptsModule } from "./receipts/receipts.module";
import { ReportsModule } from "./reports/reports.module";
import { TempleModule } from "./temple/temple.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [".env", "../../.env"],
      isGlobal: true,
      load: [
        () => ({
          apiPort: Number(process.env.API_PORT ?? 3000),
          nodeEnv: process.env.NODE_ENV ?? "development"
        })
      ],
      validate: validateEnv
    }),
    HealthModule,
    AuthModule,
    AuditModule,
    DonorsModule,
    DonationsModule,
    ReceiptsModule,
    LedgerModule,
    DashboardModule,
    ReportsModule,
    TempleModule,
    PersonnelModule,
    CeremoniesModule,
    InventoryModule,
    ItemLoansModule,
    UsersModule,
    AttachmentsModule,
    PlatformModule,
    DevoteeModule,
    PublicModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProjectExceptionFilter
    }
  ]
})
export class AppModule {}
