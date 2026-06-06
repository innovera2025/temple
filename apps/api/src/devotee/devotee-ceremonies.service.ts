import { Inject, Injectable } from "@nestjs/common";
import { type DevoteeCeremonyInput } from "@wat/shared";
import { CeremoniesService, CeremonyRecord } from "../ceremonies/ceremonies.service";
import { DevoteeAccountsService } from "./devotee-accounts.service";
import { DevoteePrincipal } from "./types/devotee-request";
import { DevoteeTemplesService } from "./devotee-temples.service";

/**
 * A devotee booking a ceremony at a temple they selected. The temple comes from the
 * route param (validated active), NEVER the token. The write runs under
 * `withTenant(templeId)` (in CeremoniesService), so RLS binds the row to that temple.
 */
@Injectable()
export class DevoteeCeremoniesService {
  constructor(
    @Inject(CeremoniesService) private readonly ceremonies: CeremoniesService,
    @Inject(DevoteeTemplesService) private readonly temples: DevoteeTemplesService,
    @Inject(DevoteeAccountsService) private readonly accounts: DevoteeAccountsService,
  ) {}

  async book(
    devotee: DevoteePrincipal,
    templeId: string,
    input: DevoteeCeremonyInput,
    ip?: string,
  ): Promise<CeremonyRecord> {
    const tenantId = await this.temples.assertActiveTemple(templeId);
    const profile = await this.accounts.requireProfile(devotee.sub);
    return this.ceremonies.createDevoteeBooking(
      tenantId,
      { id: profile.id, email: profile.email, displayName: profile.displayName },
      input,
      ip,
    );
  }
}
