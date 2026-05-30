import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PrismaModule } from "../common/prisma/prisma.module";
import { ReceiptsController } from "./receipts.controller";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [AuthModule, AuditModule, PrismaModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, RolesGuard, TenantGuard],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
