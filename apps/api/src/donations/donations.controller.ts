import {
  Body,
  Controller,
  Get,
  Inject,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  parseDonationSearchQuery,
  validateCreateDonation,
  validateUpdateDonation,
  validateVoidDonation,
} from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { LedgerEntryRecord } from "../ledger/ledger.service";
import { DonationRecord, DonationsService } from "./donations.service";

/**
 * `amountSatang` is serialized as a **string** (integer satang). JSON has no
 * BigInt and `JSON.stringify` throws on one; a string also avoids any chance of
 * precision loss for large amounts. Clients parse it back to an integer.
 */
interface SerializedDonation {
  id: string;
  donorId: string | null;
  amountSatang: string;
  currency: string;
  method: string;
  donationDate: string;
  status: string;
  note: string | null;
  fundAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedLedgerEntry {
  id: string;
  entryNo: string;
  accountId: string;
  amountSatang: string;
  entryDate: string;
  status: string;
  donationId: string | null;
  description: string | null;
}

function serializeDonation(donation: DonationRecord): SerializedDonation {
  return {
    id: donation.id,
    donorId: donation.donorId,
    amountSatang: donation.amountSatang.toString(),
    currency: donation.currency,
    method: donation.method,
    donationDate: donation.donationDate.toISOString().slice(0, 10),
    status: donation.status,
    note: donation.note,
    fundAccountId: donation.fundAccountId,
    createdAt: donation.createdAt.toISOString(),
    updatedAt: donation.updatedAt.toISOString(),
  };
}

function serializeLedgerEntry(entry: LedgerEntryRecord): SerializedLedgerEntry {
  return {
    id: entry.id,
    entryNo: entry.entryNo,
    accountId: entry.accountId,
    amountSatang: entry.amountSatang.toString(),
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    status: entry.status,
    donationId: entry.donationId,
    description: entry.description,
  };
}

// Recording/correcting a donation is intake work shared by admin/finance/staff.
const DONATION_WRITE_ROLES = ["admin", "finance", "staff"] as const;
// Voiding reverses posted financial entries — restricted to admin/finance.
const DONATION_VOID_ROLES = ["admin", "finance"] as const;

@Controller("donations")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class DonationsController {
  constructor(@Inject(DonationsService) private readonly donations: DonationsService) {}

  @Post()
  @Roles(...DONATION_WRITE_ROLES)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ donation: SerializedDonation; ledgerEntry: SerializedLedgerEntry }> {
    const result = validateCreateDonation(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }

    const created = await this.donations.create(tenantId, user.sub, result.data, ip);
    return {
      donation: serializeDonation(created.donation),
      ledgerEntry: serializeLedgerEntry(created.ledgerEntry),
    };
  }

  @Get()
  @Roles(...DONATION_WRITE_ROLES)
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ donations: SerializedDonation[] }> {
    const donations = await this.donations.list(tenantId, parseDonationSearchQuery(query));
    return { donations: donations.map(serializeDonation) };
  }

  @Get(":id")
  @Roles(...DONATION_WRITE_ROLES)
  async getOne(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ donation: SerializedDonation }> {
    const donation = await this.donations.getById(tenantId, id);
    return { donation: serializeDonation(donation) };
  }

  @Patch(":id")
  @Roles(...DONATION_WRITE_ROLES)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ donation: SerializedDonation }> {
    const result = validateUpdateDonation(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }

    const donation = await this.donations.update(tenantId, user.sub, id, result.data, ip);
    return { donation: serializeDonation(donation) };
  }

  @Post(":id/void")
  @Roles(...DONATION_VOID_ROLES)
  async void(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ donation: SerializedDonation }> {
    const result = validateVoidDonation(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }

    const donation = await this.donations.void(tenantId, user.sub, id, result.data.reason, ip);
    return { donation: serializeDonation(donation) };
  }
}
