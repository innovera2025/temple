import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { bahtText, type ReceiptPreview } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface ReceiptRecord {
  id: string;
  tenantId: string;
  donationId: string;
  receiptNo: string;
  status: string;
  issuedAt: Date;
  supersededByReceiptId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReissuedReceipt {
  superseded: ReceiptRecord;
  created: ReceiptRecord;
}

export interface ReceiptListQuery {
  donationId?: string;
  status?: string;
}

const MAX_TAKE = 200;
const ANONYMOUS_DONOR_TH = "ผู้บริจาคไม่ประสงค์ออกนาม";

/** JSON-safe receipt snapshot for audit before/after columns. */
function receiptSnapshot(receipt: ReceiptRecord): Prisma.InputJsonObject {
  return {
    id: receipt.id,
    donationId: receipt.donationId,
    receiptNo: receipt.receiptNo,
    status: receipt.status,
    issuedAt: receipt.issuedAt.toISOString(),
    supersededByReceiptId: receipt.supersededByReceiptId,
  };
}

@Injectable()
export class ReceiptsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Allocate the next receipt number for a tenant, atomically, inside the
   * caller's transaction (same INSERT ... ON CONFLICT row-lock pattern as the
   * ledger entry number, docType 'receipt'). The (tenant_id, receipt_no) unique
   * index is the backstop; numbers are never reused.
   */
  private async allocateReceiptNo(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ allocated_value: bigint }>>`
      INSERT INTO doc_counters (tenant_id, doc_type, next_value)
      VALUES (${tenantId}::uuid, 'receipt', 2)
      ON CONFLICT (tenant_id, doc_type)
      DO UPDATE SET next_value = doc_counters.next_value + 1, updated_at = now()
      RETURNING next_value - 1 AS allocated_value
    `;
    const allocated = rows[0]?.allocated_value;
    if (allocated === undefined || allocated === null) {
      throw projectHttpException(409, "CONFLICT", "ไม่สามารถออกเลขที่ใบอนุโมทนาได้");
    }

    return `RCPT-${String(allocated).padStart(6, "0")}`;
  }

  /**
   * Lock a receipt for void/reissue. Locks the parent DONATION row first, then
   * the receipt row — the SAME order issue() and donations.void()/update() use —
   * so receipt mutations serialize against a concurrent donation void/edit on a
   * shared row. Without this, reissue (which only locked the receipt) could
   * interleave with a donation void and leave a cancelled donation owning a live
   * issued receipt. Returns the authoritative re-read after both locks are held.
   */
  private async lockReceiptForMutation(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<{ receipt: ReceiptRecord; donationStatus: string }> {
    const head = (await tx.receipt.findFirst({
      where: { id },
      select: { donationId: true },
    })) as { donationId: string } | null;
    if (!head) {
      throw projectHttpException(404, "NOT_FOUND", "ไม่พบใบอนุโมทนา");
    }

    await tx.$queryRaw`SELECT id FROM donations WHERE id = ${head.donationId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM receipts WHERE id = ${id}::uuid FOR UPDATE`;

    const receipt = (await tx.receipt.findFirst({ where: { id } })) as ReceiptRecord | null;
    if (!receipt) {
      throw projectHttpException(404, "NOT_FOUND", "ไม่พบใบอนุโมทนา");
    }
    const donation = (await tx.donation.findFirst({
      where: { id: receipt.donationId },
      select: { status: true },
    })) as { status: string } | null;

    return { receipt, donationStatus: donation?.status ?? "" };
  }

  /**
   * Issue a receipt for a confirmed donation. Locks the donation row so two
   * concurrent issues serialize; at most one active (issued) receipt per
   * donation (else 409). Cancelled donation -> 409, cross-tenant -> 404.
   */
  async issue(
    tenantId: string,
    actorUserId: string,
    donationId: string,
    ip?: string,
  ): Promise<ReceiptRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM donations WHERE id = ${donationId}::uuid FOR UPDATE`;
      const donation = (await tx.donation.findFirst({
        where: { id: donationId },
        select: { status: true },
      })) as { status: string } | null;
      if (!donation) {
        throw projectHttpException(404, "NOT_FOUND", "ไม่พบรายการบริจาค");
      }
      if (donation.status !== "confirmed") {
        throw projectHttpException(
          409,
          "CONFLICT",
          "ออกใบอนุโมทนาได้เฉพาะรายการบริจาคที่ยืนยันแล้ว",
        );
      }

      const active = await tx.receipt.findFirst({
        where: { donationId, status: "issued" },
        select: { id: true },
      });
      if (active) {
        throw projectHttpException(409, "CONFLICT", "รายการบริจาคนี้มีใบอนุโมทนาที่ใช้งานอยู่แล้ว");
      }

      const receiptNo = await this.allocateReceiptNo(tx, tenantId);
      const receipt = (await tx.receipt.create({
        data: { tenantId, donationId, receiptNo, status: "issued" },
      })) as ReceiptRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "receipt:issue",
          entityType: "receipt",
          entityId: receipt.id,
          after: receiptSnapshot(receipt),
          metadata: { donationId },
          ip,
        },
      });

      return receipt;
    });
  }

  async getById(tenantId: string, id: string): Promise<ReceiptRecord> {
    const receipt = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.receipt.findFirst({ where: { id } }),
    )) as ReceiptRecord | null;
    if (!receipt) {
      throw projectHttpException(404, "NOT_FOUND", "ไม่พบใบอนุโมทนา");
    }
    return receipt;
  }

  async list(tenantId: string, query: ReceiptListQuery): Promise<ReceiptRecord[]> {
    const where: Prisma.ReceiptWhereInput = {};
    if (query.donationId) {
      where.donationId = query.donationId;
    }
    if (query.status) {
      where.status = query.status as Prisma.ReceiptWhereInput["status"];
    }

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.receipt.findMany({
        where,
        orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
        take: MAX_TAKE,
      }),
    )) as ReceiptRecord[];
  }

  /**
   * Void an issued receipt (reason required at the controller). Number is not
   * reused; the row stays visible as `voided`. Non-issued receipt -> 409.
   */
  async void(
    tenantId: string,
    actorUserId: string,
    id: string,
    reason: string,
    ip?: string,
  ): Promise<ReceiptRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const { receipt: before } = await this.lockReceiptForMutation(tx, id);
      if (before.status !== "issued") {
        throw projectHttpException(409, "CONFLICT", "ใบอนุโมทนานี้ไม่อยู่ในสถานะที่ยกเลิกได้");
      }

      const after = (await tx.receipt.update({
        where: { id },
        data: { status: "voided", updatedAt: new Date() },
      })) as ReceiptRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "receipt:void",
          entityType: "receipt",
          entityId: after.id,
          before: receiptSnapshot(before),
          after: receiptSnapshot(after),
          reason,
          metadata: { donationId: before.donationId },
          ip,
        },
      });

      return after;
    });
  }

  /**
   * Reissue an active receipt: mark the old one `superseded` (linked via
   * superseded_by) and issue a fresh receipt (new number) for the same
   * donation, in one transaction. Audits `receipt:reissue` (old) and
   * `receipt:issue` (new). Only an issued receipt can be reissued (else 409).
   */
  async reissue(
    tenantId: string,
    actorUserId: string,
    id: string,
    reason: string,
    ip?: string,
  ): Promise<ReissuedReceipt> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const { receipt: old, donationStatus } = await this.lockReceiptForMutation(tx, id);
      if (old.status !== "issued") {
        throw projectHttpException(409, "CONFLICT", "ออกใบใหม่แทนได้เฉพาะใบที่ใช้งานอยู่");
      }
      // Defense in depth: never mint a fresh receipt on a donation that is no
      // longer confirmed (e.g. cancelled by a concurrent donation void).
      if (donationStatus !== "confirmed") {
        throw projectHttpException(409, "CONFLICT", "ไม่สามารถออกใบใหม่ให้รายการบริจาคที่ถูกยกเลิก");
      }

      const receiptNo = await this.allocateReceiptNo(tx, tenantId);
      const created = (await tx.receipt.create({
        data: { tenantId, donationId: old.donationId, receiptNo, status: "issued" },
      })) as ReceiptRecord;

      const superseded = (await tx.receipt.update({
        where: { id: old.id },
        data: { status: "superseded", supersededByReceiptId: created.id, updatedAt: new Date() },
      })) as ReceiptRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "receipt:reissue",
          entityType: "receipt",
          entityId: old.id,
          before: receiptSnapshot(old),
          after: receiptSnapshot(superseded),
          reason,
          metadata: { newReceiptId: created.id, donationId: old.donationId },
          ip,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "receipt:issue",
          entityType: "receipt",
          entityId: created.id,
          after: receiptSnapshot(created),
          reason,
          metadata: { supersededReceiptId: old.id, donationId: old.donationId },
          ip,
        },
      });

      return { superseded, created };
    });
  }

  /**
   * Printable preview payload: receipt + donation + donor (under tenant RLS) and
   * the temple header. The temple row is read with system access because
   * `temples` has no RLS and `wat_app` has no SELECT grant on it; it is scoped
   * to `id = tenantId` so only the caller's own temple is read.
   */
  async preview(tenantId: string, id: string): Promise<ReceiptPreview> {
    const { receipt, donation, donorName } = await this.prisma.withTenant(tenantId, async (tx) => {
      const found = (await tx.receipt.findFirst({ where: { id } })) as ReceiptRecord | null;
      if (!found) {
        throw projectHttpException(404, "NOT_FOUND", "ไม่พบใบอนุโมทนา");
      }
      const linkedDonation = (await tx.donation.findFirst({
        where: { id: found.donationId },
        include: { donor: { select: { displayName: true } } },
      })) as
        | { amountSatang: bigint; donationDate: Date; method: string; donor: { displayName: string } | null }
        | null;
      if (!linkedDonation) {
        throw projectHttpException(404, "NOT_FOUND", "ไม่พบรายการบริจาค");
      }
      return {
        receipt: found,
        donation: linkedDonation,
        donorName: linkedDonation.donor?.displayName ?? ANONYMOUS_DONOR_TH,
      };
    });

    const temple = await this.prisma.withSystemAccess((tx) =>
      tx.temple.findFirst({ where: { id: tenantId }, select: { nameTh: true, nameEn: true } }),
    );

    return {
      receiptNo: receipt.receiptNo,
      status: receipt.status as ReceiptPreview["status"],
      issuedAt: receipt.issuedAt.toISOString(),
      templeNameTh: temple?.nameTh ?? "",
      templeNameEn: temple?.nameEn ?? null,
      donorName,
      amountSatang: donation.amountSatang.toString(),
      amountText: bahtText(donation.amountSatang),
      donationDate: donation.donationDate.toISOString().slice(0, 10),
      donationMethod: donation.method,
    };
  }
}
