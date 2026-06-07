import { Inject, Injectable } from "@nestjs/common";
import { type DevoteeItemLoanInput, type PublicEventSummary } from "@wat/shared";
import { ItemLoansService, LoanRow } from "../item-loans/item-loans.service";
import { PublicService } from "../public/public.service";
import { DevoteeAccountsService } from "./devotee-accounts.service";
import { DevoteePrincipal } from "./types/devotee-request";
import { DevoteeTemplesService } from "./devotee-temples.service";

/** Public-safe borrowable-item card for a devotee browsing a temple. */
export interface DevoteeBorrowableItemView {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  availableQty: number;
}

/**
 * A devotee browsing a temple's borrowable items / upcoming public events, and
 * submitting a borrow REQUEST. The temple comes from the route param (validated
 * active), never the token. The request runs under `withTenant(templeId)` (RLS binds
 * the row); the server sets status=requested + borrower = the devotee's own name.
 */
@Injectable()
export class DevoteeItemLoansService {
  constructor(
    @Inject(ItemLoansService) private readonly loans: ItemLoansService,
    @Inject(DevoteeTemplesService) private readonly temples: DevoteeTemplesService,
    @Inject(DevoteeAccountsService) private readonly accounts: DevoteeAccountsService,
    @Inject(PublicService) private readonly publicSvc: PublicService,
  ) {}

  /** Active borrowable items (with available qty) at a chosen temple — safe columns only. */
  async listItems(templeId: string): Promise<DevoteeBorrowableItemView[]> {
    const tenantId = await this.temples.assertActiveTemple(templeId);
    const items = await this.loans.listItems(tenantId, { status: "active" });
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      unit: i.unit,
      availableQty: i.availableQty,
    }));
  }

  /** Upcoming PUBLIC events at a chosen temple (reuses the public-events filter). */
  async listEvents(templeId: string): Promise<PublicEventSummary[]> {
    const tenantId = await this.temples.assertActiveTemple(templeId);
    return this.publicSvc.listUpcomingEvents(tenantId);
  }

  async request(devotee: DevoteePrincipal, templeId: string, input: DevoteeItemLoanInput, ip?: string): Promise<LoanRow> {
    const tenantId = await this.temples.assertActiveTemple(templeId);
    const profile = await this.accounts.requireProfile(devotee.sub);
    return this.loans.createDevoteeLoanRequest(
      tenantId,
      { id: profile.id, email: profile.email, displayName: profile.displayName },
      input,
      ip,
    );
  }
}
