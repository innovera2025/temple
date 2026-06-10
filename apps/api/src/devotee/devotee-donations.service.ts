import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type DevoteeDonationInput } from "@wat/shared";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { CreatedDonation, DonationsService } from "../donations/donations.service";
import { DevoteeAccountsService } from "./devotee-accounts.service";
import { DevoteePrincipal } from "./types/devotee-request";
import { DevoteeTemplesService } from "./devotee-temples.service";

/**
 * A devotee donating to a temple they selected. The selected temple comes from
 * the route param (validated active), NEVER from the token. The write runs under
 * `withTenant(templeId)`, so RLS `WITH CHECK (tenant_id = current_tenant_id())`
 * binds every row (donor, donation, ledger entry, audit) to that temple.
 */
@Injectable()
export class DevoteeDonationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DonationsService) private readonly donations: DonationsService,
    @Inject(DevoteeTemplesService) private readonly temples: DevoteeTemplesService,
    @Inject(DevoteeAccountsService) private readonly accounts: DevoteeAccountsService,
  ) {}

  async donate(
    devotee: DevoteePrincipal,
    templeId: string,
    input: DevoteeDonationInput,
    ip?: string,
  ): Promise<CreatedDonation> {
    const tenantId = await this.temples.assertActiveTemple(templeId);
    const { displayName } = await this.accounts.requireProfile(devotee.sub);

    // Reuse the staff donation path (auto-posts the income ledger entry to the
    // revenue account). The actor is the devotee, so its audit rows carry
    // actor_type='devotee'/actor_devotee_account_id=me and a NULL actor_user_id.
    // The donor find-or-create runs INSIDE the donation transaction (resolver
    // below), so a failed donation (e.g. 422) rolls the donor back too — no
    // orphan donor is ever committed.
    return this.donations.createWithResolvedDonor(
      tenantId,
      { kind: "devotee", devoteeAccountId: devotee.sub, email: devotee.email },
      (tx) => this.findOrCreateDonor(tx, tenantId, devotee.sub, displayName),
      {
        amountSatang: input.amountSatang,
        method: input.method,
        donationDate: input.donationDate,
        ...(input.note ? { note: input.note } : {}),
      },
      ip,
    );
  }

  /**
   * One donor per (tenant, devotee), resolved inside the caller's donation tx.
   * Idempotent via the `(tenant_id, devotee_account_id)` unique index + `ON
   * CONFLICT`, so concurrent first-time donations can't create two donor rows for
   * the same devotee. The donor key is the token-derived `devoteeAccountId` — a
   * devotee can never attach to another devotee's donor. We never clobber a
   * staff-edited display name on conflict.
   */
  private async findOrCreateDonor(
    tx: Prisma.TransactionClient,
    tenantId: string,
    devoteeAccountId: string,
    displayName: string,
  ): Promise<string> {
    // PDPA: consent=false until the devotee explicitly grants it — registration
    // and the donation flow capture no consent text/checkbox today, and a
    // fabricated `true` would be false compliance evidence. Staff donor create
    // defaults to false the same way (donors.service.ts).
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO donors (tenant_id, display_name, devotee_account_id, consent)
      VALUES (${tenantId}::uuid, ${displayName}, ${devoteeAccountId}::uuid, false)
      ON CONFLICT (tenant_id, devotee_account_id)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `;
    const donor = rows[0];
    if (!donor) {
      // Unreachable in practice (ON CONFLICT DO UPDATE always returns a row).
      throw notFound("ไม่สามารถสร้างข้อมูลผู้บริจาคได้");
    }
    return donor.id;
  }
}
