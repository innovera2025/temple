import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { AuthGuard } from "../common/guards/auth.guard";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, AuthGuard],
  exports: [AuthService, PasswordService, TokenService, AuthGuard],
})
export class AuthModule {}
