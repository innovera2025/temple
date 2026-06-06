import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { DonationsModule } from "../donations/donations.module";
import { DevoteeAuthController } from "./devotee-auth.controller";
import { DevoteeAuthService } from "./devotee-auth.service";
import { DevoteeDonationsController } from "./devotee-donations.controller";
import { DevoteeDonationsService } from "./devotee-donations.service";
import { DevoteeRecordsController } from "./devotee-records.controller";
import { DevoteeRecordsService } from "./devotee-records.service";
import { DevoteeTemplesController } from "./devotee-temples.controller";
import { DevoteeTemplesService } from "./devotee-temples.service";
import { DevoteeTokenService } from "./devotee-token.service";
import { DevoteeGuard } from "./guards/devotee.guard";

/**
 * The devotee (ญาติโยม) self-service plane: a tenant-independent identity that
 * picks any active temple per action. Reuses AuthModule's PasswordService and
 * DonationsModule's DonationsService; every controller mounts ONLY DevoteeGuard.
 */
@Module({
  imports: [PrismaModule, AuthModule, DonationsModule],
  controllers: [
    DevoteeAuthController,
    DevoteeTemplesController,
    DevoteeDonationsController,
    DevoteeRecordsController,
  ],
  providers: [
    DevoteeTokenService,
    DevoteeAuthService,
    DevoteeTemplesService,
    DevoteeDonationsService,
    DevoteeRecordsService,
    DevoteeGuard,
    RateLimitGuard,
  ],
})
export class DevoteeModule {}
