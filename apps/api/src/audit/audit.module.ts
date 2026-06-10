import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PrismaModule } from "../common/prisma/prisma.module";
import { AuditController } from "./audit.controller";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditService } from "./audit.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor, RolesGuard, TenantGuard],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
