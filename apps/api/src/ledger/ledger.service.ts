import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type AuditActor, type AuditActorColumns, auditActorData } from "../common/audit/audit-actor";
import { allocateLedgerEntryNo } from "./ledger-numbering";
import { assertDateNotInClosedPeriod, lockTenantLedger } from "./ledger-periods";

/** Resolve an audit context to the audit_logs actor columns (legacy actorUserId or full actor). */
function ledgerActor(audit: LedgerAuditContext): AuditActorColumns {
  return audit.actor
    ? auditActorData(audit.actor)
    : { actorUserId: audit.actorUserId ?? null, actorType: "user", actorDevoteeAccountId: null };
}

/**
 * Minimal income-posting + reversal helpers for Task 5. Full ledger CRUD is
 * Task 7. Every method runs inside the **caller's** tenant transaction (the
 * `tx` from `PrismaService.withTenant`) so the ledger write and its audit row
 * are atomic with the donation mutation that triggered it.
 */

export interface LedgerEntryRecord {
  id: string;
  tenantId: string;
  entryNo: string;
  accountId: string;
  amountSatang: bigint;
  entryDate: Date;
  status: string;
  description: string | null;
  donationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerAuditContext {
  /** Legacy staff actor (most callers). Use `actor` for devotee/non-user actors. */
  actorUserId?: string;
  /** Full actor descriptor (staff or devotee); takes precedence over actorUserId. */
  actor?: AuditActor;
  ip?: string;
}

/**
 * JSON-safe snapshot of a ledger entry for audit before/after columns.
 * BigInt `amountSatang` is serialized to a string — JSON (and Prisma's Json
 * column) cannot hold a BigInt, and a string never loses precision.
 */
function entrySnapshot(entry: LedgerEntryRecord): Prisma.InputJsonObject {
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

@Injectable()
export class LedgerService {
  /** Post a confirmed donation as a single `posted` income ledger entry. */
  async postDonationIncome(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      accountId: string;
      donationId: string;
      amountSatang: bigint;
      entryDate: Date;
      description?: string | null;
    },
    audit: LedgerAuditContext,
  ): Promise<LedgerEntryRecord> {
    await lockTenantLedger(tx, params.tenantId);
    await assertDateNotInClosedPeriod(tx, params.entryDate);
    const entryNo = await allocateLedgerEntryNo(tx, params.tenantId);

    const entry = (await tx.ledgerEntry.create({
      data: {
        tenantId: params.tenantId,
        entryNo,
        accountId: params.accountId,
        amountSatang: params.amountSatang,
        entryDate: params.entryDate,
        status: "posted",
        description: params.description ?? null,
        donationId: params.donationId,
      },
    })) as LedgerEntryRecord;

    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        ...ledgerActor(audit),
        action: "ledger:post",
        entityType: "ledger_entry",
        entityId: entry.id,
        after: entrySnapshot(entry),
        metadata: { donationId: params.donationId },
        ip: audit.ip,
      },
    });

    return entry;
  }

  /** The single `posted` entry auto-posted for a donation, if it still exists. */
  private async findPostedEntry(
    tx: Prisma.TransactionClient,
    donationId: string,
  ): Promise<LedgerEntryRecord | null> {
    return (await tx.ledgerEntry.findFirst({
      where: { donationId, status: "posted" },
    })) as LedgerEntryRecord | null;
  }

  /**
   * Recalculate the linked posted entry after a donation edit changed its
   * amount/date/account (D6). No-op if nothing is posted (e.g. already voided).
   */
  async updateDonationEntry(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      donationId: string;
      amountSatang: bigint;
      entryDate: Date;
      accountId: string;
    },
    audit: LedgerAuditContext,
  ): Promise<void> {
    await lockTenantLedger(tx, params.tenantId);
    const before = await this.findPostedEntry(tx, params.donationId);
    if (!before) {
      return;
    }
    // The original posting must not be locked, and the edit must not move the
    // entry into a closed period either.
    await assertDateNotInClosedPeriod(tx, before.entryDate);
    await assertDateNotInClosedPeriod(tx, params.entryDate);

    const after = (await tx.ledgerEntry.update({
      where: { id: before.id },
      data: {
        amountSatang: params.amountSatang,
        entryDate: params.entryDate,
        accountId: params.accountId,
        updatedAt: new Date(),
      },
    })) as LedgerEntryRecord;

    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        ...ledgerActor(audit),
        action: "ledger:update",
        entityType: "ledger_entry",
        entityId: after.id,
        before: entrySnapshot(before),
        after: entrySnapshot(after),
        metadata: { donationId: params.donationId },
        ip: audit.ip,
      },
    });
  }

  /**
   * Reverse the linked posted entry on void by flipping its status
   * `posted -> voided` (D3 — auditable, no hard delete, no contra entry).
   * No-op if there is no posted entry to reverse.
   */
  async voidDonationEntry(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; donationId: string; reason: string },
    audit: LedgerAuditContext,
  ): Promise<void> {
    await lockTenantLedger(tx, params.tenantId);
    const before = await this.findPostedEntry(tx, params.donationId);
    if (!before) {
      return;
    }
    // Cannot reverse a posting that lives in a closed period.
    await assertDateNotInClosedPeriod(tx, before.entryDate);

    const after = (await tx.ledgerEntry.update({
      where: { id: before.id },
      data: { status: "voided", updatedAt: new Date() },
    })) as LedgerEntryRecord;

    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        ...ledgerActor(audit),
        action: "ledger:cancel",
        entityType: "ledger_entry",
        entityId: after.id,
        before: entrySnapshot(before),
        after: entrySnapshot(after),
        reason: params.reason,
        metadata: { donationId: params.donationId },
        ip: audit.ip,
      },
    });
  }
}
