import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { LedgerEntriesService } from "../ledger/ledger-entries.service";

export interface DashboardFinancialResult {
  month: string;
  incomeSatang: bigint;
  expenseSatang: bigint;
  balanceSatang: bigint;
}

export interface DashboardRecentDonationResult {
  id: string;
  donorName: string;
  amountSatang: bigint;
  method: string;
  donationDate: Date;
  status: string;
}

export interface DashboardResult {
  month: string;
  financial: DashboardFinancialResult | null;
  newDonorsThisMonth: number;
  awaitingReceiptCount: number;
  awaitingReconciliationCount: number;
  recentDonations: DashboardRecentDonationResult[];
}

interface RecentDonationRow {
  id: string;
  amountSatang: bigint;
  method: string;
  donationDate: Date;
  status: string;
  donor: { displayName: string } | null;
}

const ANONYMOUS_DONOR_TH = "ผู้บริจาคไม่ประสงค์ออกนาม";
const RECENT_LIMIT = 5;

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00.000Z`);
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LedgerEntriesService) private readonly ledger: LedgerEntriesService,
  ) {}

  /**
   * Finance dashboard snapshot for the current month. Operational counts/queues
   * are returned for every role; financial figures and the recent-donations list
   * (which carry money) are included only when `includeFinancials` (admin/finance).
   * All queries run under tenant RLS, so the numbers are scoped to the caller.
   */
  async getDashboard(
    tenantId: string,
    options: { includeFinancials: boolean },
  ): Promise<DashboardResult> {
    const month = currentMonth();

    const counts = await this.prisma.withTenant(tenantId, async (tx) => {
      const [newDonorsThisMonth, awaitingReceiptCount, awaitingReconciliationCount] = await Promise.all([
        tx.donor.count({ where: { createdAt: { gte: monthStart(month) } } }),
        // confirmed donations with no active (issued) receipt yet
        tx.donation.count({ where: { status: "confirmed", receipts: { none: { status: "issued" } } } }),
        // posted ledger entries not yet reconciled
        tx.ledgerEntry.count({ where: { status: "posted", reconciledAt: null } }),
      ]);

      const recent = options.includeFinancials
        ? ((await tx.donation.findMany({
            // confirmed only, so the recent list is consistent with the income
            // figure (which counts posted entries) — a cancelled donation must
            // not surface as recent activity with its full amount.
            where: { status: "confirmed" },
            orderBy: { createdAt: "desc" },
            take: RECENT_LIMIT,
            include: { donor: { select: { displayName: true } } },
          })) as unknown as RecentDonationRow[])
        : [];

      const recentDonations: DashboardRecentDonationResult[] = recent.map((donation) => ({
        id: donation.id,
        donorName: donation.donor?.displayName ?? ANONYMOUS_DONOR_TH,
        amountSatang: donation.amountSatang,
        method: donation.method,
        donationDate: donation.donationDate,
        status: donation.status,
      }));

      return { newDonorsThisMonth, awaitingReceiptCount, awaitingReconciliationCount, recentDonations };
    });

    // Financial figures reuse the ledger summary, so they always match the ledger.
    let financial: DashboardFinancialResult | null = null;
    if (options.includeFinancials) {
      const summary = await this.ledger.summary(tenantId, { month });
      financial = {
        month,
        incomeSatang: summary.incomeSatang,
        expenseSatang: summary.expenseSatang,
        balanceSatang: summary.balanceSatang,
      };
    }

    return {
      month,
      financial,
      newDonorsThisMonth: counts.newDonorsThisMonth,
      awaitingReceiptCount: counts.awaitingReceiptCount,
      awaitingReconciliationCount: counts.awaitingReconciliationCount,
      recentDonations: counts.recentDonations,
    };
  }
}
