import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

export interface DevoteeDonationView {
  id: string;
  templeId: string;
  templeNameTh: string;
  amountSatang: string;
  currency: string;
  method: string;
  donationDate: string;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface DevoteeReceiptView {
  id: string;
  receiptNo: string;
  status: string;
  issuedAt: string;
  templeId: string;
  templeNameTh: string;
  donationId: string;
  amountSatang: string;
  donationDate: string;
}

const MAX_TAKE = 200;

/**
 * The ONE deliberate RLS exit in the devotee plane: a devotee's own records span
 * MANY temples, so they cannot be read under any single tenant's RLS context.
 * These reads run via `withSystemAccess` (RLS-bypassing `wat_migrate`) but are
 * confined to this one service and ALWAYS scoped by a MANDATORY, token-derived
 * `devoteeAccountId` predicate (`donor.devoteeAccountId = me`) — the predicate is
 * never taken from client input. Selects expose only devotee-safe columns; no
 * ledger internals, other donors, personnel, users, or audit rows are reachable.
 */
@Injectable()
export class DevoteeRecordsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMyDonations(devoteeAccountId: string): Promise<DevoteeDonationView[]> {
    const rows = await this.prisma.withSystemAccess((tx) =>
      tx.donation.findMany({
        where: { donor: { devoteeAccountId } },
        select: {
          id: true,
          tenantId: true,
          amountSatang: true,
          currency: true,
          method: true,
          donationDate: true,
          status: true,
          note: true,
          createdAt: true,
          tenant: { select: { nameTh: true } },
        },
        orderBy: [{ donationDate: "desc" }, { createdAt: "desc" }],
        take: MAX_TAKE,
      }),
    );

    return rows.map((row) => ({
      id: row.id,
      templeId: row.tenantId,
      templeNameTh: row.tenant.nameTh,
      amountSatang: row.amountSatang.toString(),
      currency: row.currency,
      method: row.method,
      donationDate: row.donationDate.toISOString().slice(0, 10),
      status: row.status,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listMyReceipts(devoteeAccountId: string): Promise<DevoteeReceiptView[]> {
    const rows = await this.prisma.withSystemAccess((tx) =>
      tx.receipt.findMany({
        where: { donation: { donor: { devoteeAccountId } } },
        select: {
          id: true,
          receiptNo: true,
          status: true,
          issuedAt: true,
          tenantId: true,
          donationId: true,
          tenant: { select: { nameTh: true } },
          donation: { select: { amountSatang: true, donationDate: true } },
        },
        orderBy: { issuedAt: "desc" },
        take: MAX_TAKE,
      }),
    );

    return rows.map((row) => ({
      id: row.id,
      receiptNo: row.receiptNo,
      status: row.status,
      issuedAt: row.issuedAt.toISOString(),
      templeId: row.tenantId,
      templeNameTh: row.tenant.nameTh,
      donationId: row.donationId,
      amountSatang: row.donation.amountSatang.toString(),
      donationDate: row.donation.donationDate.toISOString().slice(0, 10),
    }));
  }
}
