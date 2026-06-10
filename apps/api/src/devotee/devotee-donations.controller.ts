import { Body, Controller, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import { validateDevoteeDonation } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { projectHttpException, unauthorized } from "../common/errors/project-error";
import { CreatedDonation } from "../donations/donations.service";
import { CurrentDevotee } from "./decorators/current-devotee.decorator";
import { DevoteeGuard } from "./guards/devotee.guard";
import { DevoteeDonationsService } from "./devotee-donations.service";
import { DevoteePrincipal } from "./types/devotee-request";
import { assertUuidParam } from "../platform/uuid-param";

interface SerializedDonation {
  id: string;
  donorId: string | null;
  amountSatang: string;
  currency: string;
  method: string;
  donationDate: string;
  status: string;
  note: string | null;
  createdAt: string;
}

interface SerializedLedgerEntry {
  id: string;
  entryNo: string;
  amountSatang: string;
  entryDate: string;
  status: string;
}

function serialize(created: CreatedDonation): {
  donation: SerializedDonation;
  ledgerEntry: SerializedLedgerEntry | null;
} {
  const { donation, ledgerEntry } = created;
  return {
    donation: {
      id: donation.id,
      donorId: donation.donorId,
      amountSatang: donation.amountSatang.toString(),
      currency: donation.currency,
      method: donation.method,
      donationDate: donation.donationDate.toISOString().slice(0, 10),
      status: donation.status,
      note: donation.note,
      createdAt: donation.createdAt.toISOString(),
    },
    // null until staff confirm the pledge — devotee donations never post
    // income to the official ledger by themselves.
    ledgerEntry: ledgerEntry
      ? {
          id: ledgerEntry.id,
          entryNo: ledgerEntry.entryNo,
          amountSatang: ledgerEntry.amountSatang.toString(),
          entryDate: ledgerEntry.entryDate.toISOString().slice(0, 10),
          status: ledgerEntry.status,
        }
      : null,
  };
}

/**
 * A devotee donating to a selected temple. Mounts ONLY the DevoteeGuard. The
 * temple is the `:templeId` route param (self-documenting, can't be silently
 * dropped); the service validates it is active and runs the write under RLS.
 */
@Controller("devotee/temples/:templeId/donations")
@UseGuards(DevoteeGuard, RateLimitGuard)
export class DevoteeDonationsController {
  constructor(@Inject(DevoteeDonationsService) private readonly donations: DevoteeDonationsService) {}

  @Post()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async create(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
    @Param("templeId") templeId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ donation: SerializedDonation; ledgerEntry: SerializedLedgerEntry | null }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    const result = validateDevoteeDonation(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const created = await this.donations.donate(devotee, assertUuidParam(templeId), result.data, ip);
    return serialize(created);
  }
}
