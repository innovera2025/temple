import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  directionForAccountType,
  monthRange,
  type CreateLedgerEntryInput,
  type LedgerEntrySearchQuery,
  type LedgerSummaryQuery,
} from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { allocateLedgerEntryNo } from "./ledger-numbering";

export interface LedgerAccountRecord {
  id: string;
  code: string;
  nameTh: string;
  accountType: string;
  isActive: boolean;
}

/** A ledger entry joined with its account, as the controller serializes it. */
export interface LedgerEntryDetail {
  id: string;
  tenantId: string;
  entryNo: string;
  accountId: string;
  amountSatang: bigint;
  entryDate: Date;
  status: string;
  payee: string | null;
  description: string | null;
  donationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  account: { code: string; nameTh: string; accountType: string };
}

export interface LedgerSummaryResult {
  dateFrom: string;
  dateTo: string;
  incomeSatang: bigint;
  expenseSatang: bigint;
  balanceSatang: bigint;
  incomeCount: number;
  expenseCount: number;
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

/** Sentinels for an open-ended summary range (entry_date is a calendar date). */
const RANGE_MIN = "1900-01-01";
const RANGE_MAX = "9999-12-31";

const ENTRY_INCLUDE = {
  account: { select: { code: true, nameTh: true, accountType: true } },
} satisfies Prisma.LedgerEntryInclude;

/** Parse an ISO `YYYY-MM-DD` date as UTC midnight (matches `@db.Date` storage). */
function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** JSON-safe ledger-entry snapshot for audit before/after columns (BigInt -> string). */
function entrySnapshot(entry: LedgerEntryDetail): Prisma.InputJsonObject {
  return {
    id: entry.id,
    entryNo: entry.entryNo,
    accountId: entry.accountId,
    amountSatang: entry.amountSatang.toString(),
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    status: entry.status,
    payee: entry.payee,
    description: entry.description,
    donationId: entry.donationId,
  };
}

@Injectable()
export class LedgerEntriesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Resolve the account a manual entry posts to, **inside** the tenant
   * transaction so RLS guarantees same-tenant scope (a cross-tenant id resolves
   * to null -> 422). Only an active `revenue`/`expense` account may receive a
   * manual entry; balance-sheet types or an inactive account -> 422.
   */
  private async resolvePostableAccount(
    tx: Prisma.TransactionClient,
    accountId: string,
  ): Promise<LedgerAccountRecord> {
    const account = (await tx.ledgerAccount.findFirst({
      where: { id: accountId },
    })) as LedgerAccountRecord | null;

    if (!account || !account.isActive || directionForAccountType(account.accountType) === null) {
      throw projectHttpException(
        422,
        "UNPROCESSABLE_ENTITY",
        "บัญชีไม่ถูกต้องสำหรับบันทึกรายรับ/รายจ่าย",
        [{ field: "accountId", message: "ต้องเป็นบัญชีรายรับหรือรายจ่ายที่เปิดใช้งานอยู่" }],
      );
    }

    return account;
  }

  /**
   * Record a manual income/expense entry (`status = posted`). The entry's
   * direction comes from the account type; manual entries never link a donation
   * (`donationId = null`) so they can't be confused with auto-posted donation
   * income. Allocates an entry number from the shared `ledger_entry` counter and
   * writes a `ledger:create` audit row in one transaction.
   */
  async createEntry(
    tenantId: string,
    actorUserId: string,
    input: CreateLedgerEntryInput,
    ip?: string,
  ): Promise<LedgerEntryDetail> {
    const entryDate = toDateOnly(input.entryDate);

    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.resolvePostableAccount(tx, input.accountId);
      const entryNo = await allocateLedgerEntryNo(tx, tenantId);

      const entry = (await tx.ledgerEntry.create({
        data: {
          tenantId,
          entryNo,
          accountId: input.accountId,
          amountSatang: BigInt(input.amountSatang),
          entryDate,
          status: "posted",
          payee: input.payee ?? null,
          description: input.note ?? null,
        },
        include: ENTRY_INCLUDE,
      })) as unknown as LedgerEntryDetail;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "ledger:create",
          entityType: "ledger_entry",
          entityId: entry.id,
          after: entrySnapshot(entry),
          metadata: {},
          ip,
        },
      });

      return entry;
    });
  }

  async list(tenantId: string, query: LedgerEntrySearchQuery): Promise<LedgerEntryDetail[]> {
    const take = Math.min(query.take ?? DEFAULT_TAKE, MAX_TAKE);
    const skip = query.skip ?? 0;

    const where: Prisma.LedgerEntryWhereInput = {};
    if (query.accountId) {
      where.accountId = query.accountId;
    }
    if (query.status) {
      where.status = query.status as Prisma.LedgerEntryWhereInput["status"];
    }
    if (query.donationId) {
      where.donationId = query.donationId;
    }
    if (query.direction === "income") {
      where.account = { accountType: "revenue" };
    } else if (query.direction === "expense") {
      where.account = { accountType: "expense" };
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) {
        dateFilter.gte = toDateOnly(query.dateFrom);
      }
      if (query.dateTo) {
        dateFilter.lte = toDateOnly(query.dateTo);
      }
      where.entryDate = dateFilter;
    }

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.ledgerEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take,
        skip,
      }),
    )) as unknown as LedgerEntryDetail[];
  }

  async getById(tenantId: string, id: string): Promise<LedgerEntryDetail> {
    const entry = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.ledgerEntry.findFirst({ where: { id }, include: ENTRY_INCLUDE }),
    )) as unknown as LedgerEntryDetail | null;

    if (!entry) {
      throw projectHttpException(404, "NOT_FOUND", "ไม่พบรายการบัญชี");
    }

    return entry;
  }

  /**
   * Void a manual ledger entry (reason required at the controller; no hard
   * delete — status flips `posted -> voided`). The row is locked first so two
   * concurrent voids serialize (the loser re-reads `voided` and gets 409).
   * A donation-linked entry must NOT be voided here — that would break the
   * atomic donation/ledger/receipt reversal — so it is rejected with 409 and the
   * caller is directed to void the donation instead.
   */
  async void(
    tenantId: string,
    actorUserId: string,
    id: string,
    reason: string,
    ip?: string,
  ): Promise<LedgerEntryDetail> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM ledger_entries WHERE id = ${id}::uuid FOR UPDATE`;

      const before = (await tx.ledgerEntry.findFirst({
        where: { id },
        include: ENTRY_INCLUDE,
      })) as unknown as LedgerEntryDetail | null;
      if (!before) {
        throw projectHttpException(404, "NOT_FOUND", "ไม่พบรายการบัญชี");
      }
      if (before.donationId) {
        throw projectHttpException(
          409,
          "CONFLICT",
          "รายการนี้ผูกกับการบริจาค ให้ยกเลิกที่รายการบริจาคแทน",
        );
      }
      if (before.status !== "posted") {
        throw projectHttpException(409, "CONFLICT", "รายการบัญชีนี้ไม่อยู่ในสถานะที่ยกเลิกได้");
      }

      const after = (await tx.ledgerEntry.update({
        where: { id },
        data: { status: "voided", updatedAt: new Date() },
        include: ENTRY_INCLUDE,
      })) as unknown as LedgerEntryDetail;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "ledger:cancel",
          entityType: "ledger_entry",
          entityId: after.id,
          before: entrySnapshot(before),
          after: entrySnapshot(after),
          reason,
          metadata: {},
          ip,
        },
      });

      return after;
    });
  }

  /** Chart of accounts for the entry form / filters (default: active accounts). */
  async listAccounts(
    tenantId: string,
    options: { activeOnly?: boolean } = {},
  ): Promise<LedgerAccountRecord[]> {
    const where: Prisma.LedgerAccountWhereInput = {};
    if (options.activeOnly) {
      where.isActive = true;
    }

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.ledgerAccount.findMany({
        where,
        orderBy: [{ code: "asc" }],
      }),
    )) as LedgerAccountRecord[];
  }

  private resolveRange(query: LedgerSummaryQuery): { dateFrom: string; dateTo: string } {
    if (query.month) {
      return monthRange(query.month);
    }
    if (query.dateFrom || query.dateTo) {
      return { dateFrom: query.dateFrom ?? RANGE_MIN, dateTo: query.dateTo ?? RANGE_MAX };
    }
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return monthRange(month);
  }

  /**
   * Income/expense/balance rollup over a date range (default: current month).
   * Counts only `posted` entries — `voided` entries never contribute — and
   * derives direction from the linked account's type.
   */
  async summary(tenantId: string, query: LedgerSummaryQuery): Promise<LedgerSummaryResult> {
    const { dateFrom, dateTo } = this.resolveRange(query);
    const entryDate = { gte: toDateOnly(dateFrom), lte: toDateOnly(dateTo) };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [income, expense] = await Promise.all([
        tx.ledgerEntry.aggregate({
          _sum: { amountSatang: true },
          _count: true,
          where: { status: "posted", entryDate, account: { accountType: "revenue" } },
        }),
        tx.ledgerEntry.aggregate({
          _sum: { amountSatang: true },
          _count: true,
          where: { status: "posted", entryDate, account: { accountType: "expense" } },
        }),
      ]);

      const incomeSatang = income._sum.amountSatang ?? 0n;
      const expenseSatang = expense._sum.amountSatang ?? 0n;

      return {
        dateFrom,
        dateTo,
        incomeSatang,
        expenseSatang,
        balanceSatang: incomeSatang - expenseSatang,
        incomeCount: income._count,
        expenseCount: expense._count,
      };
    });
  }
}
