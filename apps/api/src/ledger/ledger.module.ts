import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PrismaModule } from "../common/prisma/prisma.module";
import { LedgerController } from "./ledger.controller";
import { LedgerEntriesService } from "./ledger-entries.service";
import { LedgerService } from "./ledger.service";

@Module({
  imports: [AuthModule, AuditModule, PrismaModule],
  controllers: [LedgerController],
  providers: [LedgerService, LedgerEntriesService, RolesGuard, TenantGuard],
  exports: [LedgerService],
})
export class LedgerModule {}
