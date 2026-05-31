import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { CeremoniesController } from "./ceremonies.controller";
import { CeremoniesService } from "./ceremonies.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CeremoniesController],
  providers: [CeremoniesService, RolesGuard, TenantGuard],
})
export class CeremoniesModule {}
