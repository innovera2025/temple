import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, RolesGuard, TenantGuard, RateLimitGuard],
})
export class AttachmentsModule {}
