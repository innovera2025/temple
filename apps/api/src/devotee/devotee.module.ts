import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CeremoniesModule } from "../ceremonies/ceremonies.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { DonationsModule } from "../donations/donations.module";
import { ReceiptsModule } from "../receipts/receipts.module";
import { DevoteeAccountsService } from "./devotee-accounts.service";
import { DevoteeAuthController } from "./devotee-auth.controller";
import { DevoteeAuthService } from "./devotee-auth.service";
import { DevoteeCeremoniesController } from "./devotee-ceremonies.controller";
import { DevoteeCeremoniesService } from "./devotee-ceremonies.service";
import { DevoteeDonationsController } from "./devotee-donations.controller";
import { DevoteeDonationsService } from "./devotee-donations.service";
import { DevoteeProfileController } from "./devotee-profile.controller";
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
  imports: [PrismaModule, AuthModule, DonationsModule, CeremoniesModule, ReceiptsModule],
  controllers: [
    DevoteeAuthController,
    DevoteeTemplesController,
    DevoteeDonationsController,
    DevoteeCeremoniesController,
    DevoteeRecordsController,
    DevoteeProfileController,
  ],
  providers: [
    DevoteeTokenService,
    DevoteeAuthService,
    DevoteeAccountsService,
    DevoteeTemplesService,
    DevoteeDonationsService,
    DevoteeCeremoniesService,
    DevoteeRecordsService,
    DevoteeGuard,
    RateLimitGuard,
  ],
})
export class DevoteeModule {}
