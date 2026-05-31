import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PrismaModule } from "../common/prisma/prisma.module";
import { LedgerModule } from "../ledger/ledger.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [AuthModule, PrismaModule, LedgerModule],
  controllers: [DashboardController],
  providers: [DashboardService, RolesGuard, TenantGuard],
})
export class DashboardModule {}
