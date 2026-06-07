import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { type ReceiptPreview } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { unauthorized } from "../common/errors/project-error";
import { assertUuidParam } from "../platform/uuid-param";
import { CurrentDevotee } from "./decorators/current-devotee.decorator";
import { DevoteeGuard } from "./guards/devotee.guard";
import {
  DevoteeCeremonyView,
  DevoteeDonationView,
  DevoteeReceiptView,
  DevoteeRecordsService,
} from "./devotee-records.service";
import { DevoteePrincipal } from "./types/devotee-request";

/**
 * A devotee's own cross-temple history. Mounts ONLY the DevoteeGuard. The
 * `devoteeAccountId` predicate is taken from the token (`devotee.sub`), never
 * from the request, so a devotee can only ever read their own records.
 */
@Controller("devotee/me")
@UseGuards(DevoteeGuard, RateLimitGuard)
@RateLimit({ limit: 60, windowMs: 60_000 })
export class DevoteeRecordsController {
  constructor(@Inject(DevoteeRecordsService) private readonly records: DevoteeRecordsService) {}

  @Get("donations")
  async myDonations(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
  ): Promise<{ donations: DevoteeDonationView[] }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    return { donations: await this.records.listMyDonations(devotee.sub) };
  }

  @Get("receipts")
  async myReceipts(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
  ): Promise<{ receipts: DevoteeReceiptView[] }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    return { receipts: await this.records.listMyReceipts(devotee.sub) };
  }

  @Get("ceremonies")
  async myCeremonies(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
  ): Promise<{ ceremonies: DevoteeCeremonyView[] }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    return { ceremonies: await this.records.listMyCeremonies(devotee.sub) };
  }

  @Get("receipts/:id")
  async myReceiptDocument(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
    @Param("id") id: string,
  ): Promise<{ receipt: ReceiptPreview }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    return { receipt: await this.records.getMyReceiptDocument(devotee.sub, assertUuidParam(id)) };
  }
}
