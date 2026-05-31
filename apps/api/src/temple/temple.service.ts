import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type TempleProfile, type TempleProfileUpdate } from "@wat/shared";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

const TEMPLE_PROFILE_SELECT = {
  id: true,
  slug: true,
  status: true,
  nameTh: true,
  nameEn: true,
  addressTh: true,
  subdistrict: true,
  district: true,
  province: true,
  postalCode: true,
  phone: true,
  email: true,
  lineId: true,
  websiteUrl: true,
  abbotName: true,
  registrationNo: true,
  taxId: true,
  denomination: true,
  logoUrl: true,
  receiptHeaderTh: true,
  receiptFooterTh: true,
} as const;

function snapshot(profile: TempleProfile): Prisma.InputJsonObject {
  return {
    id: profile.id,
    slug: profile.slug,
    status: profile.status,
    nameTh: profile.nameTh,
    nameEn: profile.nameEn,
    addressTh: profile.addressTh,
    subdistrict: profile.subdistrict,
    district: profile.district,
    province: profile.province,
    postalCode: profile.postalCode,
    phone: profile.phone,
    email: profile.email,
    lineId: profile.lineId,
    websiteUrl: profile.websiteUrl,
    abbotName: profile.abbotName,
    registrationNo: profile.registrationNo,
    taxId: profile.taxId,
    denomination: profile.denomination,
    logoUrl: profile.logoUrl,
    receiptHeaderTh: profile.receiptHeaderTh,
    receiptFooterTh: profile.receiptFooterTh,
  };
}

@Injectable()
export class TempleService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Read the caller's own temple profile. `temples` has no RLS and wat_app has no
   * grant on it, so it is read via withSystemAccess and ALWAYS scoped to
   * `id = tenantId` (the tenant from the JWT) — never another temple.
   */
  async get(tenantId: string): Promise<TempleProfile> {
    const temple = await this.prisma.withSystemAccess((tx) =>
      tx.temple.findUnique({ where: { id: tenantId }, select: TEMPLE_PROFILE_SELECT }),
    );
    if (!temple) {
      throw notFound("ไม่พบข้อมูลวัด");
    }
    return temple;
  }

  /**
   * Patch the caller's own temple profile (admin only). Captures before/after and
   * writes a tenant `temple:update` audit row in the SAME transaction. The update
   * is scoped to `id = tenantId`, so a temple can only ever edit itself.
   */
  async update(
    tenantId: string,
    actorUserId: string,
    patch: TempleProfileUpdate,
    ip?: string,
  ): Promise<TempleProfile> {
    return this.prisma.withSystemAccess(async (tx) => {
      const before = await tx.temple.findUnique({ where: { id: tenantId }, select: TEMPLE_PROFILE_SELECT });
      if (!before) {
        throw notFound("ไม่พบข้อมูลวัด");
      }

      let after: TempleProfile;
      try {
        after = await tx.temple.update({
          where: { id: tenantId },
          data: { ...patch, updatedAt: new Date() },
          select: TEMPLE_PROFILE_SELECT,
        });
      } catch (error: unknown) {
        // Concurrent-delete race between the findUnique above and this update would
        // otherwise surface a raw P2025 as an unhandled 500.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw notFound("ไม่พบข้อมูลวัด");
        }
        throw error;
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "temple:update",
          entityType: "temple",
          entityId: tenantId,
          before: snapshot(before),
          after: snapshot(after),
          metadata: {},
          ip,
        },
      });

      return after;
    });
  }
}
