import { Inject, Injectable } from "@nestjs/common";
import { type BreakGlassOpenInput } from "@wat/shared";
import { conflict, forbidden, notFound } from "../common/errors/project-error";
import { PlatformPrincipal } from "./types/platform-request";
import { PrismaService } from "../common/prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";

export interface BreakGlassGrantRecord {
  id: string;
  platformUserId: string;
  tenantId: string;
  reason: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** A deliberately NON-PII, read-only summary of a tenant's data. */
export interface TenantSnapshot {
  tenant: { id: string; slug: string; nameTh: string; status: string };
  counts: { donors: number; donations: number; receipts: number; ledgerEntries: number };
  donationTotalSatang: string;
  recentReceipts: Array<{ receiptNo: string; issuedAt: string; status: string }>;
}

const GRANT_SELECT = {
  id: true,
  platformUserId: true,
  tenantId: true,
  reason: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class BreakGlassService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async open(actorId: string, input: BreakGlassOpenInput, ip?: string): Promise<BreakGlassGrantRecord> {
    return this.prisma.withSystemAccess(async (tx) => {
      const temple = await tx.temple.findUnique({ where: { id: input.tenantId }, select: { id: true } });
      if (!temple) {
        throw notFound("ไม่พบวัด");
      }

      const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000);
      const grant = await tx.breakGlassGrant.create({
        data: {
          platformUserId: actorId,
          tenantId: input.tenantId,
          reason: input.reason,
          expiresAt,
        },
        select: GRANT_SELECT,
      });

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action: "break_glass.opened",
        entityType: "temple",
        entityId: input.tenantId,
        metadata: { grantId: grant.id, reason: input.reason, expiresAt: expiresAt.toISOString() },
        ip,
      });

      return grant;
    });
  }

  async listOwn(actorId: string): Promise<BreakGlassGrantRecord[]> {
    return this.prisma.withSystemAccess((tx) =>
      tx.breakGlassGrant.findMany({
        where: { platformUserId: actorId },
        orderBy: { createdAt: "desc" },
        select: GRANT_SELECT,
      }),
    );
  }

  async revoke(actor: PlatformPrincipal, grantId: string, ip?: string): Promise<BreakGlassGrantRecord> {
    return this.prisma.withSystemAccess(async (tx) => {
      const grant = await tx.breakGlassGrant.findUnique({ where: { id: grantId }, select: GRANT_SELECT });
      if (!grant) {
        throw notFound("ไม่พบสิทธิ์ break-glass");
      }
      if (grant.platformUserId !== actor.sub && actor.platform_role !== "super_admin") {
        throw forbidden("เพิกถอนสิทธิ์ของผู้อื่นได้เฉพาะผู้ดูแลระบบสูงสุด");
      }
      if (grant.revokedAt) {
        throw conflict("สิทธิ์นี้ถูกเพิกถอนแล้ว");
      }

      const updated = await tx.breakGlassGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date() },
        select: GRANT_SELECT,
      });

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actor.sub,
        action: "break_glass.revoked",
        entityType: "break_glass_grant",
        entityId: grantId,
        metadata: { tenantId: grant.tenantId },
        ip,
      });

      return updated;
    });
  }

  /**
   * Read-only peek into a tenant's data, gated by an unexpired, unrevoked grant
   * owned by the caller. Performs ONLY reads on tenant tables (explicit
   * tenantId filter) and writes exactly one `break_glass.accessed` audit row in
   * the same transaction.
   */
  async snapshot(actor: PlatformPrincipal, grantId: string, ip?: string): Promise<TenantSnapshot> {
    return this.prisma.withSystemAccess(async (tx) => {
      const grant = await tx.breakGlassGrant.findUnique({ where: { id: grantId }, select: GRANT_SELECT });
      if (!grant) {
        throw notFound("ไม่พบสิทธิ์ break-glass");
      }
      if (grant.platformUserId !== actor.sub) {
        throw forbidden("สิทธิ์ break-glass นี้ไม่ใช่ของคุณ");
      }
      if (grant.revokedAt || grant.expiresAt.getTime() <= Date.now()) {
        throw forbidden("สิทธิ์ break-glass หมดอายุหรือถูกเพิกถอนแล้ว");
      }

      const tenantId = grant.tenantId;
      const temple = await tx.temple.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true, nameTh: true, status: true },
      });
      if (!temple) {
        throw notFound("ไม่พบวัด");
      }

      // Sequential awaits: a single interactive-transaction connection should not
      // run concurrent queries (matches the withTenant services elsewhere).
      const donors = await tx.donor.count({ where: { tenantId } });
      const donations = await tx.donation.count({ where: { tenantId } });
      const receipts = await tx.receipt.count({ where: { tenantId } });
      const ledgerEntries = await tx.ledgerEntry.count({ where: { tenantId } });
      const totals = await tx.donation.aggregate({
        _sum: { amountSatang: true },
        where: { tenantId, status: "confirmed" },
      });
      const recent = await tx.receipt.findMany({
        where: { tenantId },
        orderBy: { issuedAt: "desc" },
        take: 5,
        select: { receiptNo: true, issuedAt: true, status: true },
      });

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actor.sub,
        action: "break_glass.accessed",
        entityType: "temple",
        entityId: tenantId,
        metadata: { grantId },
        ip,
      });

      return {
        tenant: { id: temple.id, slug: temple.slug, nameTh: temple.nameTh, status: temple.status },
        counts: { donors, donations, receipts, ledgerEntries },
        donationTotalSatang: (totals._sum.amountSatang ?? 0n).toString(),
        recentReceipts: recent.map((r) => ({
          receiptNo: r.receiptNo,
          issuedAt: r.issuedAt.toISOString(),
          status: r.status,
        })),
      };
    });
  }
}
