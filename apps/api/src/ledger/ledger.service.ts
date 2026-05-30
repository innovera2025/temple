import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { projectHttpException } from "../common/errors/project-error";

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
  actorUserId: string;
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
  /**
   * Allocate the next ledger entry number for a tenant, atomically, inside the
   * caller's transaction. `INSERT ... ON CONFLICT DO UPDATE` row-locks the
   * tenant's `doc_counters` row, so concurrent allocations serialize and can
   * never hand out the same value; the `(tenant_id, entry_no)` unique index is
   * the backstop. Mirrors the sequence math of `@wat/db`'s `nextDocumentNumber`
   * but stays inside the Prisma transaction instead of spawning a psql process.
   */
  private async allocateEntryNo(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ allocated_value: bigint }>>`
      INSERT INTO doc_counters (tenant_id, doc_type, next_value)
      VALUES (${tenantId}::uuid, 'ledger_entry', 2)
      ON CONFLICT (tenant_id, doc_type)
      DO UPDATE SET next_value = doc_counters.next_value + 1, updated_at = now()
      RETURNING next_value - 1 AS allocated_value
    `;
    const allocated = rows[0]?.allocated_value;
    if (allocated === undefined || allocated === null) {
      throw projectHttpException(409, "CONFLICT", "ไม่สามารถออกเลขที่รายการบัญชีได้");
    }

    return `LEDG-${String(allocated).padStart(6, "0")}`;
  }

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
    const entryNo = await this.allocateEntryNo(tx, params.tenantId);

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
        actorUserId: audit.actorUserId,
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
    const before = await this.findPostedEntry(tx, params.donationId);
    if (!before) {
      return;
    }

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
        actorUserId: audit.actorUserId,
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
    const before = await this.findPostedEntry(tx, params.donationId);
    if (!before) {
      return;
    }

    const after = (await tx.ledgerEntry.update({
      where: { id: before.id },
      data: { status: "voided", updatedAt: new Date() },
    })) as LedgerEntryRecord;

    await tx.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorUserId: audit.actorUserId,
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
