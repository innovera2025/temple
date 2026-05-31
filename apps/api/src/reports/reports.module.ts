import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PrismaModule } from "../common/prisma/prisma.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ReportsController],
  providers: [ReportsService, RolesGuard, TenantGuard],
})
export class ReportsModule {}
