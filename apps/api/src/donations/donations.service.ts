import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateDonationInput, DonationSearchQuery, UpdateDonationInput } from "@wat/shared";
import { type AuditActor, auditActorData } from "../common/audit/audit-actor";
import { projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { LedgerEntryRecord, LedgerService } from "../ledger/ledger.service";

export interface DonationRecord {
  id: string;
  tenantId: string;
  donorId: string | null;
  amountSatang: bigint;
  currency: string;
  method: string;
  donationDate: Date;
  status: string;
  note: string | null;
  fundAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatedDonation {
  donation: DonationRecord;
  ledgerEntry: LedgerEntryRecord;
}

interface LedgerAccountRow {
  id: string;
  accountType: string;
  isActive: boolean;
}

interface ReceiptRow {
  id: string;
  receiptNo: string;
  status: string;
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;
const DEFAULT_REVENUE_ACCOUNT_CODE = "4000";
const LEDGER_INCOME_DESCRIPTION = "รับเงินบริจาค";

/** Parse an ISO `YYYY-MM-DD` date as UTC midnight (matches `@db.Date` storage). */
function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** JSON-safe donation snapshot for audit; BigInt -> string (JSON has no BigInt). */
function donationSnapshot(donation: DonationRecord): Prisma.InputJsonObject {
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
  };
}

function receiptSnapshot(receipt: ReceiptRow): Prisma.InputJsonObject {
  return { id: receipt.id, receiptNo: receipt.receiptNo, status: receipt.status };
}

@Injectable()
export class DonationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}

  /**
   * Resolve the revenue account the donation income posts to, **inside** the
   * tenant transaction so RLS guarantees same-tenant scope. A cross-tenant
   * `fundAccountId` simply resolves to null here (RLS filters it out) -> 422.
   * 422 when missing / not a revenue account / inactive (D2).
   */
  private async resolveRevenueAccount(
    tx: Prisma.TransactionClient,
    fundAccountId: string | null | undefined,
  ): Promise<LedgerAccountRow> {
    const account = (await (fundAccountId
      ? tx.ledgerAccount.findFirst({ where: { id: fundAccountId } })
      : tx.ledgerAccount.findFirst({
          where: { code: DEFAULT_REVENUE_ACCOUNT_CODE },
        }))) as LedgerAccountRow | null;

    if (!account || account.accountType !== "revenue" || !account.isActive) {
      throw projectHttpException(
        422,
        "UNPROCESSABLE_ENTITY",
        "ไม่พบบัญชีรายรับที่ใช้งานได้สำหรับบันทึกเงินบริจาค",
        [{ field: "fundAccountId", message: "บัญชีรายรับไม่ถูกต้องหรือไม่พร้อมใช้งาน" }],
      );
    }

    return account;
  }

  /** Ensure a donor (when supplied) belongs to this tenant; cross-tenant -> 404 (D5). */
  private async assertDonorInTenant(
    tx: Prisma.TransactionClient,
    donorId: string,
  ): Promise<void> {
    const donor = await tx.donor.findFirst({ where: { id: donorId }, select: { id: true } });
    if (!donor) {
      throw projectHttpException(404, "NOT_FOUND", "ไม่พบผู้บริจาคในวัดนี้");
    }
  }

  /**
   * Take a row lock on the donation before the status guards in edit/void.
   * withTenant runs at READ COMMITTED, so a plain findFirst guard is a TOCTOU:
   * two concurrent voids could both read `confirmed`, both pass the 409 guard,
   * and double-post audit/reversal rows. `SELECT ... FOR UPDATE` serializes
   * same-donation mutations so the loser re-reads the committed state and hits
   * the 409. RLS still scopes the lock to the tenant (cross-tenant id locks
   * nothing -> the follow-up findFirst returns null -> 404).
   */
  private async lockDonationRow(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM donations WHERE id = ${id}::uuid FOR UPDATE`;
  }

  /**
   * Record a donation (`status = confirmed`) and auto-post its income ledger
   * entry in **one** transaction: donation -> resolve revenue account ->
   * allocate entryNo -> posted ledger entry (linked via donationId), with
   * `donation:create` and `ledger:post` audit rows.
   */
  async create(
    tenantId: string,
    actor: AuditActor,
    input: CreateDonationInput,
    ip?: string,
  ): Promise<CreatedDonation> {
    return this.prisma.withTenant(tenantId, (tx) => this.createInTx(tx, tenantId, actor, input, ip));
  }

  /**
   * Like `create`, but the donor is resolved by `resolveDonorId` **inside the same
   * transaction** as the donation. Used by the devotee plane to find-or-create the
   * per-(tenant,devotee) donor atomically with the donation: if the donation fails
   * (e.g. no revenue account -> 422) the donor insert rolls back too, so a failed
   * devotee donation never leaves an orphan donor committed.
   */
  async createWithResolvedDonor(
    tenantId: string,
    actor: AuditActor,
    resolveDonorId: (tx: Prisma.TransactionClient) => Promise<string>,
    input: Omit<CreateDonationInput, "donorId">,
    ip?: string,
  ): Promise<CreatedDonation> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const donorId = await resolveDonorId(tx);
      return this.createInTx(tx, tenantId, actor, { ...input, donorId }, ip);
    });
  }

  /** Donation create + income post + audit, run inside the caller's tenant tx. */
  private async createInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actor: AuditActor,
    input: CreateDonationInput,
    ip?: string,
  ): Promise<CreatedDonation> {
    const donationDate = toDateOnly(input.donationDate);

    if (input.donorId) {
      await this.assertDonorInTenant(tx, input.donorId);
    }
    const account = await this.resolveRevenueAccount(tx, input.fundAccountId ?? undefined);

    const donation = (await tx.donation.create({
      data: {
        tenantId,
        donorId: input.donorId ?? null,
        amountSatang: BigInt(input.amountSatang),
        method: input.method,
        donationDate,
        status: "confirmed",
        note: input.note ?? null,
        fundAccountId: input.fundAccountId ?? null,
      },
    })) as DonationRecord;

    await tx.auditLog.create({
      data: {
        tenantId,
        ...auditActorData(actor),
        action: "donation:create",
        entityType: "donation",
        entityId: donation.id,
        after: donationSnapshot(donation),
        metadata: {},
        ip,
      },
    });

    const ledgerEntry = await this.ledger.postDonationIncome(
      tx,
      {
        tenantId,
        accountId: account.id,
        donationId: donation.id,
        amountSatang: donation.amountSatang,
        entryDate: donationDate,
        description: LEDGER_INCOME_DESCRIPTION,
      },
      { actor, ip },
    );

    return { donation, ledgerEntry };
  }

  async list(tenantId: string, query: DonationSearchQuery): Promise<DonationRecord[]> {
    const take = Math.min(query.take ?? DEFAULT_TAKE, MAX_TAKE);
    const skip = query.skip ?? 0;

    const where: Prisma.DonationWhereInput = {};
    if (query.donorId) {
      where.donorId = query.donorId;
    }
    if (query.method) {
      where.method = query.method;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) {
        dateFilter.gte = toDateOnly(query.dateFrom);
      }
      if (query.dateTo) {
        dateFilter.lte = toDateOnly(query.dateTo);
      }
      where.donationDate = dateFilter;
    }

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.donation.findMany({
        where,
        orderBy: [{ donationDate: "desc" }, { createdAt: "desc" }],
        take,
        skip,
      }),
    )) as DonationRecord[];
  }

  async getById(tenantId: string, id: string): Promise<DonationRecord> {
    const donation = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.donation.findFirst({ where: { id } }),
    )) as DonationRecord | null;

    if (!donation) {
      throw projectHttpException(404, "NOT_FOUND", "ไม่พบรายการบริจาค");
    }

    return donation;
  }

  /**
   * Edit a confirmed donation (D6). Editing a cancelled donation -> 409.
   * Editing a donation with an active (issued) receipt -> 409 (void the receipt
   * first; receipts arrive in Task 6, the guard is in place now). On
   * amount/date/account change the linked posted entry is recalculated in the
   * same transaction with `donation:update` + `ledger:update` audit rows.
   */
  async update(
    tenantId: string,
    actor: AuditActor,
    id: string,
    input: UpdateDonationInput,
    ip?: string,
  ): Promise<DonationRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.lockDonationRow(tx, id);
      const before = (await tx.donation.findFirst({ where: { id } })) as DonationRecord | null;
      if (!before) {
        throw projectHttpException(404, "NOT_FOUND", "ไม่พบรายการบริจาค");
      }
      if (before.status === "cancelled") {
        throw projectHttpException(409, "CONFLICT", "ไม่สามารถแก้ไขรายการบริจาคที่ยกเลิกแล้ว");
      }

      const activeReceipt = await tx.receipt.findFirst({
        where: { donationId: id, status: "issued" },
        select: { id: true },
      });
      if (activeReceipt) {
        throw projectHttpException(
          409,
          "CONFLICT",
          "ต้องยกเลิกใบเสร็จที่ออกแล้วก่อน จึงจะแก้ไขรายการบริจาคได้",
        );
      }

      if (input.donorId) {
        await this.assertDonorInTenant(tx, input.donorId);
      }

      // Compute intended values up front so the fund account is resolved and
      // validated BEFORE any write: a bad (cross-tenant / non-revenue / inactive)
      // fund account must return 422 here, never trip the composite tenant FK as
      // a raw Prisma error on tx.donation.update.
      const newAmount =
        input.amountSatang !== undefined ? BigInt(input.amountSatang) : before.amountSatang;
      const newDate =
        input.donationDate !== undefined ? toDateOnly(input.donationDate) : before.donationDate;
      const newFundAccountId =
        input.fundAccountId !== undefined ? input.fundAccountId : before.fundAccountId;

      const amountChanged = newAmount !== before.amountSatang;
      const dateChanged = newDate.getTime() !== before.donationDate.getTime();
      const accountChanged = newFundAccountId !== before.fundAccountId;
      const recalcEntry = amountChanged || dateChanged || accountChanged;

      const account = recalcEntry
        ? await this.resolveRevenueAccount(tx, newFundAccountId ?? undefined)
        : null;

      const data: Prisma.DonationUncheckedUpdateInput = { updatedAt: new Date() };
      if (input.amountSatang !== undefined) {
        data.amountSatang = newAmount;
      }
      if (input.method !== undefined) {
        data.method = input.method;
      }
      if (input.donationDate !== undefined) {
        data.donationDate = newDate;
      }
      if (input.note !== undefined) {
        data.note = input.note;
      }
      if (input.donorId !== undefined) {
        data.donorId = input.donorId;
      }
      if (input.fundAccountId !== undefined) {
        data.fundAccountId = input.fundAccountId;
      }

      const after = (await tx.donation.update({ where: { id }, data })) as DonationRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          ...auditActorData(actor),
          action: "donation:update",
          entityType: "donation",
          entityId: after.id,
          before: donationSnapshot(before),
          after: donationSnapshot(after),
          metadata: {},
          ip,
        },
      });

      if (recalcEntry && account) {
        await this.ledger.updateDonationEntry(
          tx,
          {
            tenantId,
            donationId: id,
            amountSatang: after.amountSatang,
            entryDate: after.donationDate,
            accountId: account.id,
          },
          { actor, ip },
        );
      }

      return after;
    });
  }

  /**
   * Void a donation (D3). Reverses everything in **one** transaction:
   * active receipt (if any) -> linked posted ledger entry -> donation, each
   * with its own audit row. Reason is required (the controller rejects a
   * missing reason with 422). Voiding an already-cancelled donation -> 409.
   */
  async void(
    tenantId: string,
    actor: AuditActor,
    id: string,
    reason: string,
    ip?: string,
  ): Promise<DonationRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.lockDonationRow(tx, id);
      const before = (await tx.donation.findFirst({ where: { id } })) as DonationRecord | null;
      if (!before) {
        throw projectHttpException(404, "NOT_FOUND", "ไม่พบรายการบริจาค");
      }
      if (before.status === "cancelled") {
        throw projectHttpException(409, "CONFLICT", "รายการบริจาคนี้ถูกยกเลิกไปแล้ว");
      }

      const receipt = (await tx.receipt.findFirst({
        where: { donationId: id, status: "issued" },
      })) as ReceiptRow | null;
      if (receipt) {
        const voidedReceipt = (await tx.receipt.update({
          where: { id: receipt.id },
          data: { status: "voided", updatedAt: new Date() },
        })) as ReceiptRow;

        await tx.auditLog.create({
          data: {
            tenantId,
            ...auditActorData(actor),
            action: "receipt:void",
            entityType: "receipt",
            entityId: receipt.id,
            before: receiptSnapshot(receipt),
            after: receiptSnapshot(voidedReceipt),
            reason,
            metadata: { donationId: id },
            ip,
          },
        });
      }

      await this.ledger.voidDonationEntry(tx, { tenantId, donationId: id, reason }, { actor, ip });

      const after = (await tx.donation.update({
        where: { id },
        data: { status: "cancelled", updatedAt: new Date() },
      })) as DonationRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          ...auditActorData(actor),
          action: "donation:void",
          entityType: "donation",
          entityId: after.id,
          before: donationSnapshot(before),
          after: donationSnapshot(after),
          reason,
          metadata: {},
          ip,
        },
      });

      return after;
    });
  }
}
