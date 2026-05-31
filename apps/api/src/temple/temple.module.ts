import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { TempleController } from "./temple.controller";
import { TempleService } from "./temple.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TempleController],
  providers: [TempleService, RolesGuard, TenantGuard],
})
export class TempleModule {}
