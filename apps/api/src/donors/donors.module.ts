import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PrismaModule } from "../common/prisma/prisma.module";
import { DonorsController } from "./donors.controller";
import { DonorsService } from "./donors.service";

@Module({
  imports: [AuthModule, AuditModule, PrismaModule],
  controllers: [DonorsController],
  providers: [DonorsService, RolesGuard, TenantGuard],
  exports: [DonorsService],
})
export class DonorsModule {}
