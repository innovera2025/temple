import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  // AuthModule exports PasswordService (for hashing new/updated user passwords).
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService, RolesGuard, TenantGuard],
})
export class UsersModule {}
