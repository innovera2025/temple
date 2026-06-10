import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RecoveryService } from "../common/recovery/recovery.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, AuthGuard, RateLimitGuard, RecoveryService],
  exports: [AuthService, PasswordService, TokenService, AuthGuard, RecoveryService],
})
export class AuthModule {}
