import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

/**
 * Public, unauthenticated browsing plane: temple directory + upcoming public events.
 * No auth/tenant context; reads are public-safe by construction (see PublicService).
 */
@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
  providers: [PublicService, RateLimitGuard],
})
export class PublicModule {}
