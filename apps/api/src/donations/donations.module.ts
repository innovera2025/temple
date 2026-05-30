import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PrismaModule } from "../common/prisma/prisma.module";
import { LedgerModule } from "../ledger/ledger.module";
import { DonationsController } from "./donations.controller";
import { DonationsService } from "./donations.service";

@Module({
  imports: [AuthModule, AuditModule, PrismaModule, LedgerModule],
  controllers: [DonationsController],
  providers: [DonationsService, RolesGuard, TenantGuard],
  exports: [DonationsService],
})
export class DonationsModule {}
