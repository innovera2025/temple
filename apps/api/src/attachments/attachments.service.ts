import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type AttachmentOwnerType, type UploadAttachmentInput } from "@wat/shared";
import { conflict, notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

// Bounds storage growth: per-entity and per-tenant totals (upload rate limiting
// is enforced separately by RateLimitGuard on the controller).
const MAX_ATTACHMENTS_PER_OWNER = 20;
const MAX_ATTACHMENTS_PER_TENANT = 10_000;

export interface AttachmentRecord {
  id: string;
  ownerType: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  byteSize: bigint;
  createdAt: Date;
}

export interface AttachmentDownload {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

// `data` is deliberately omitted — listing/metadata must never read the blob.
const META_SELECT = {
  id: true,
  ownerType: true,
  ownerId: true,
  fileName: true,
  mimeType: true,
  byteSize: true,
  createdAt: true,
} as const;

function metaSnapshot(record: AttachmentRecord): Prisma.InputJsonObject {
  return {
    id: record.id,
    ownerType: record.ownerType,
    ownerId: record.ownerId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteSize: record.byteSize.toString(),
  };
}

@Injectable()
export class AttachmentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Does the owner row exist in THIS tenant? (RLS-scoped read.) */
  private async ownerExists(
    tx: Prisma.TransactionClient,
    ownerType: AttachmentOwnerType,
    ownerId: string,
  ): Promise<boolean> {
    const where = { id: ownerId };
    const select = { id: true };
    switch (ownerType) {
      case "donation":
        return Boolean(await tx.donation.findFirst({ where, select }));
      case "receipt":
        return Boolean(await tx.receipt.findFirst({ where, select }));
      case "ledger_entry":
        return Boolean(await tx.ledgerEntry.findFirst({ where, select }));
      case "donor":
        return Boolean(await tx.donor.findFirst({ where, select }));
      default:
        return false;
    }
  }

  async upload(
    tenantId: string,
    actorUserId: string,
    input: UploadAttachmentInput,
    ip?: string,
  ): Promise<AttachmentRecord> {
    const buffer = Buffer.from(input.contentBase64, "base64");
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Serialise concurrent uploads to the SAME owner so the per-owner cap is a
      // hard bound (count-then-create would otherwise race under READ COMMITTED).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || ':att:' || ${input.ownerId})::bigint)`;

      if (!(await this.ownerExists(tx, input.ownerType, input.ownerId))) {
        throw notFound("ไม่พบรายการที่จะแนบไฟล์");
      }

      const existing = await tx.attachment.count({
        where: { ownerType: input.ownerType, ownerId: input.ownerId },
      });
      if (existing >= MAX_ATTACHMENTS_PER_OWNER) {
        throw conflict(`แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS_PER_OWNER} ไฟล์ต่อรายการ`);
      }
      // RLS-scoped: counts only this tenant's attachments. Best-effort ceiling (the
      // per-owner lock does not serialise across owners), which is fine for a
      // defensive bound — a tiny overshoot under heavy concurrency is acceptable.
      if ((await tx.attachment.count({})) >= MAX_ATTACHMENTS_PER_TENANT) {
        throw conflict("เกินจำนวนไฟล์แนบสูงสุดของวัด");
      }

      const created = (await tx.attachment.create({
        data: {
          tenantId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          storageKey: randomUUID(),
          byteSize: BigInt(buffer.length),
          data: buffer,
        },
        select: META_SELECT,
      })) as AttachmentRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "attachment:create",
          entityType: "attachment",
          entityId: created.id,
          after: metaSnapshot(created),
          metadata: {},
          ip,
        },
      });

      return created;
    });
  }

  async listByOwner(
    tenantId: string,
    ownerType: AttachmentOwnerType,
    ownerId: string,
  ): Promise<AttachmentRecord[]> {
    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.attachment.findMany({ where: { ownerType, ownerId }, orderBy: { createdAt: "desc" }, select: META_SELECT }),
    )) as AttachmentRecord[];
  }

  async download(tenantId: string, id: string): Promise<AttachmentDownload> {
    const found = await this.prisma.withTenant(tenantId, (tx) =>
      tx.attachment.findFirst({ where: { id }, select: { fileName: true, mimeType: true, data: true } }),
    );
    if (!found) {
      throw notFound("ไม่พบไฟล์แนบ");
    }
    return { fileName: found.fileName, mimeType: found.mimeType, data: Buffer.from(found.data) };
  }

  async remove(tenantId: string, actorUserId: string, id: string, ip?: string): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.attachment.findFirst({ where: { id }, select: META_SELECT })) as AttachmentRecord | null;
      if (!before) {
        throw notFound("ไม่พบไฟล์แนบ");
      }
      await tx.attachment.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "attachment:delete",
          entityType: "attachment",
          entityId: id,
          before: metaSnapshot(before),
          metadata: {},
          ip,
        },
      });
    });
  }
}
