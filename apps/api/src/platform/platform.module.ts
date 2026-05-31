import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { BreakGlassController } from "./break-glass.controller";
import { BreakGlassService } from "./break-glass.service";
import { PlatformAuthController } from "./platform-auth.controller";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformTokenService } from "./platform-token.service";
import { PlatformUsersController } from "./platform-users.controller";
import { PlatformUsersService } from "./platform-users.service";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { TemplesController } from "./temples.controller";
import { TemplesService } from "./temples.service";
import { TenantUsersController } from "./tenant-users.controller";
import { TenantUsersService } from "./tenant-users.service";

@Module({
  // AuthModule exports PasswordService (reused for hashing the bootstrap admin).
  imports: [PrismaModule, AuthModule],
  controllers: [
    PlatformAuthController,
    ApplicationsController,
    TemplesController,
    PlatformUsersController,
    TenantUsersController,
    BreakGlassController,
  ],
  providers: [
    PlatformTokenService,
    PlatformAuthService,
    ApplicationsService,
    TemplesService,
    PlatformUsersService,
    TenantUsersService,
    BreakGlassService,
    PlatformAuthGuard,
    PlatformRolesGuard,
  ],
})
export class PlatformModule {}
