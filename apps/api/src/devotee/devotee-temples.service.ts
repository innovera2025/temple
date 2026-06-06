import { Inject, Injectable } from "@nestjs/common";
import { type PublicTempleProfile, type PublicTempleSummary } from "@wat/shared";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

/**
 * Devotee-safe temple columns. Deliberately EXCLUDES `slug`, `registrationNo`,
 * `taxId`, and the receipt header/footer — internal/operational fields a
 * layperson must never see. `temples` has no RLS and `wat_app` has no grant on
 * it, so these reads go through `withSystemAccess`, exactly like the staff
 * `TempleService` reads its own row by id.
 */
const PUBLIC_TEMPLE_SUMMARY_SELECT = {
  id: true,
  nameTh: true,
  nameEn: true,
  province: true,
  district: true,
  logoUrl: true,
} as const;

const PUBLIC_TEMPLE_PROFILE_SELECT = {
  ...PUBLIC_TEMPLE_SUMMARY_SELECT,
  addressTh: true,
  subdistrict: true,
  postalCode: true,
  phone: true,
  email: true,
  lineId: true,
  websiteUrl: true,
  abbotName: true,
  denomination: true,
} as const;

@Injectable()
export class DevoteeTemplesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** All ACTIVE temples a devotee may transact with (directory). */
  async list(): Promise<PublicTempleSummary[]> {
    return this.prisma.withSystemAccess((tx) =>
      tx.temple.findMany({
        where: { status: "active" },
        select: PUBLIC_TEMPLE_SUMMARY_SELECT,
        orderBy: { nameTh: "asc" },
      }),
    );
  }

  /** Public profile of a single ACTIVE temple. 404 if missing or not active. */
  async getById(id: string): Promise<PublicTempleProfile> {
    const temple = await this.prisma.withSystemAccess((tx) =>
      tx.temple.findFirst({
        where: { id, status: "active" },
        select: PUBLIC_TEMPLE_PROFILE_SELECT,
      }),
    );
    if (!temple) {
      throw notFound("ไม่พบวัดที่เลือก");
    }
    return temple;
  }

  /**
   * Assert a temple is active before a devotee transacts with it. Returns the
   * temple id so callers can use it as the tenant for `withTenant(...)`.
   */
  async assertActiveTemple(id: string): Promise<string> {
    const temple = await this.prisma.withSystemAccess((tx) =>
      tx.temple.findFirst({ where: { id, status: "active" }, select: { id: true } }),
    );
    if (!temple) {
      throw notFound("ไม่พบวัดที่เลือก");
    }
    return temple.id;
  }
}
