import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { ItemLoansController } from "./item-loans.controller";
import { ItemLoansService } from "./item-loans.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ItemLoansController],
  providers: [ItemLoansService, RolesGuard, TenantGuard],
  exports: [ItemLoansService],
})
export class ItemLoansModule {}
