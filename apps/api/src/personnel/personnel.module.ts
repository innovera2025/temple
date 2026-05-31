import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { PersonnelController } from "./personnel.controller";
import { PersonnelService } from "./personnel.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PersonnelController],
  providers: [PersonnelService, RolesGuard, TenantGuard],
})
export class PersonnelModule {}
