import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  DONATION_METHOD_LABELS_TH,
  DONATION_STATUS_LABELS_TH,
  DONATION_STATUSES,
  LEDGER_ENTRY_STATUS_LABELS_TH,
  LEDGER_ENTRY_STATUSES,
  RECEIPT_STATUS_LABELS_TH,
  RECEIPT_STATUSES,
  csvSafeText,
  directionForAccountType,
  satangToBahtPlain,
  type DonationMethod,
  type DonationStatus,
  type LedgerEntryStatus,
  type ReceiptStatus,
  type ReportQuery,
  type ReportType,
} from "@wat/shared";
import { PrismaService } from "../common/prisma/prisma.service";

export interface ReportResult {
  type: ReportType;
  columns: string[];
  rows: string[][];
  count: number;
}

const ANONYMOUS_DONOR_TH = "ผู้บริจาคไม่ประสงค์ออกนาม";
const DEFAULT_TAKE = 500;
// Reports are read by Thai temple staff, so day filters mean the Thailand civil
// day (ICT, UTC+7), not a UTC day.
const ICT_OFFSET = "+07:00";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Render a timestamptz value as its ICT (UTC+7) civil date, e.g. "2031-03-10". */
function ictDateOnly(value: Date): string {
  return new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Inclusive date-column filter (for @db.Date columns: donationDate / entryDate). */
function dateColumnFilter(query: ReportQuery): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }
  const filter: Prisma.DateTimeFilter = {};
  if (query.dateFrom) filter.gte = toDateOnly(query.dateFrom);
  if (query.dateTo) filter.lte = toDateOnly(query.dateTo);
  return filter;
}

/**
 * Half-open ICT-day filter for timestamptz columns (receipt.issuedAt): bound by
 * [dateFrom 00:00 ICT, (dateTo + 1 day) 00:00 ICT). Using the ICT civil day —
 * rather than a UTC day window — keeps receipts issued near midnight Thai time in
 * the day the staff member expects, and the half-open upper bound avoids the
 * sub-millisecond gap of a `23:59:59.999` end-of-day.
 */
function timestampFilter(query: ReportQuery): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }
  const filter: Prisma.DateTimeFilter = {};
  if (query.dateFrom) filter.gte = new Date(`${query.dateFrom}T00:00:00.000${ICT_OFFSET}`);
  if (query.dateTo) {
    filter.lt = new Date(new Date(`${query.dateTo}T00:00:00.000${ICT_OFFSET}`).getTime() + ONE_DAY_MS);
  }
  return filter;
}

function methodLabel(method: string): string {
  return DONATION_METHOD_LABELS_TH[method as DonationMethod] ?? method;
}

function donationStatusLabel(status: string): string {
  return DONATION_STATUS_LABELS_TH[status as DonationStatus] ?? status;
}

function receiptStatusLabel(status: string): string {
  return RECEIPT_STATUS_LABELS_TH[status as ReceiptStatus] ?? status;
}

function ledgerStatusLabel(status: string): string {
  return LEDGER_ENTRY_STATUS_LABELS_TH[status as LedgerEntryStatus] ?? status;
}

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Build one of the three financial reports for the tenant and write a
   * `report:export` audit row (actor + type + filters + row count) in the SAME
   * transaction as the read. All reads run under tenant RLS, so a report can
   * never include another tenant's records.
   */
  async build(
    tenantId: string,
    actorUserId: string,
    type: ReportType,
    query: ReportQuery,
    ip?: string,
  ): Promise<ReportResult> {
    const take = query.take ?? DEFAULT_TAKE;
    const skip = query.skip ?? 0;

    return this.prisma.withTenant(tenantId, async (tx) => {
      let columns: string[];
      let rows: string[][];

      if (type === "donations") {
        const where: Prisma.DonationWhereInput = {};
        const dateFilter = dateColumnFilter(query);
        if (dateFilter) where.donationDate = dateFilter;
        if (query.status && (DONATION_STATUSES as readonly string[]).includes(query.status)) {
          where.status = query.status as DonationStatus;
        }

        const donations = (await tx.donation.findMany({
          where,
          orderBy: [{ donationDate: "desc" }, { createdAt: "desc" }],
          take,
          skip,
          include: { donor: { select: { displayName: true } } },
        })) as Array<{
          donationDate: Date;
          amountSatang: bigint;
          method: string;
          status: string;
          note: string | null;
          donor: { displayName: string } | null;
        }>;

        columns = ["วันที่บริจาค", "ผู้บริจาค", "จำนวนเงิน (บาท)", "ช่องทาง", "สถานะ", "หมายเหตุ"];
        rows = donations.map((donation) => [
          donation.donationDate.toISOString().slice(0, 10),
          csvSafeText(donation.donor?.displayName ?? ANONYMOUS_DONOR_TH),
          satangToBahtPlain(donation.amountSatang),
          methodLabel(donation.method),
          donationStatusLabel(donation.status),
          csvSafeText(donation.note ?? ""),
        ]);
      } else if (type === "receipts") {
        const where: Prisma.ReceiptWhereInput = {};
        const issuedFilter = timestampFilter(query);
        if (issuedFilter) where.issuedAt = issuedFilter;
        if (query.status && (RECEIPT_STATUSES as readonly string[]).includes(query.status)) {
          where.status = query.status as ReceiptStatus;
        }

        const receipts = (await tx.receipt.findMany({
          where,
          orderBy: [{ issuedAt: "desc" }],
          take,
          skip,
          include: { donation: { include: { donor: { select: { displayName: true } } } } },
        })) as Array<{
          receiptNo: string;
          issuedAt: Date;
          status: string;
          donation: { amountSatang: bigint; donor: { displayName: string } | null };
        }>;

        columns = ["เลขที่ใบอนุโมทนา", "วันที่ออก", "ผู้บริจาค", "จำนวนเงิน (บาท)", "สถานะ"];
        rows = receipts.map((receipt) => [
          receipt.receiptNo,
          ictDateOnly(receipt.issuedAt),
          csvSafeText(receipt.donation.donor?.displayName ?? ANONYMOUS_DONOR_TH),
          satangToBahtPlain(receipt.donation.amountSatang),
          receiptStatusLabel(receipt.status),
        ]);
      } else {
        const where: Prisma.LedgerEntryWhereInput = {};
        const dateFilter = dateColumnFilter(query);
        if (dateFilter) where.entryDate = dateFilter;
        if (query.status && (LEDGER_ENTRY_STATUSES as readonly string[]).includes(query.status)) {
          where.status = query.status as LedgerEntryStatus;
        }
        if (query.accountId) where.accountId = query.accountId;
        if (query.direction === "income") where.account = { accountType: "revenue" };
        else if (query.direction === "expense") where.account = { accountType: "expense" };

        const entries = (await tx.ledgerEntry.findMany({
          where,
          orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          take,
          skip,
          include: { account: { select: { code: true, nameTh: true, accountType: true } } },
        })) as Array<{
          entryDate: Date;
          entryNo: string;
          amountSatang: bigint;
          status: string;
          payee: string | null;
          reconciledAt: Date | null;
          account: { code: string; nameTh: string; accountType: string };
        }>;

        columns = ["วันที่", "เลขที่", "บัญชี", "ทิศทาง", "จำนวนเงิน (บาท)", "สถานะ", "ผู้รับเงิน", "กระทบยอด"];
        rows = entries.map((entry) => [
          entry.entryDate.toISOString().slice(0, 10),
          entry.entryNo,
          `${entry.account.code} ${entry.account.nameTh}`,
          directionForAccountType(entry.account.accountType) === "income"
            ? "รายรับ"
            : directionForAccountType(entry.account.accountType) === "expense"
              ? "รายจ่าย"
              : "-",
          satangToBahtPlain(entry.amountSatang),
          ledgerStatusLabel(entry.status),
          csvSafeText(entry.payee ?? ""),
          entry.reconciledAt ? "กระทบยอดแล้ว" : "-",
        ]);
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "report:export",
          entityType: "report",
          metadata: {
            type,
            dateFrom: query.dateFrom ?? null,
            dateTo: query.dateTo ?? null,
            status: query.status ?? null,
            accountId: query.accountId ?? null,
            direction: query.direction ?? null,
            count: rows.length,
          },
          ip,
        },
      });

      return { type, columns, rows, count: rows.length };
    });
  }
}
