import { Inject, Injectable } from "@nestjs/common";
import { type PublicEventSummary, type PublicTempleProfile, type PublicTempleSummary } from "@wat/shared";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

// Public, UNAUTHENTICATED reads. `temples` has no RLS; ceremonies are read across
// temples, so both go through withSystemAccess — but EVERY query is hard-filtered to
// public-safe data (active temples; published, confirmed, upcoming events) and selects
// only public-safe columns. There is NO client-controlled predicate beyond an optional
// UUID templeId that only narrows results, so nothing private can be reached.
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

const MAX_EVENTS = 100;

@Injectable()
export class PublicService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Directory of ACTIVE temples (public-safe summary columns). */
  async listTemples(): Promise<PublicTempleSummary[]> {
    return this.prisma.withSystemAccess((tx) =>
      tx.temple.findMany({
        where: { status: "active" },
        select: PUBLIC_TEMPLE_SUMMARY_SELECT,
        orderBy: { nameTh: "asc" },
      }),
    );
  }

  /** Public profile of a single ACTIVE temple. 404 if missing or not active. */
  async getTemple(id: string): Promise<PublicTempleProfile> {
    const temple = await this.prisma.withSystemAccess((tx) =>
      tx.temple.findFirst({ where: { id, status: "active" }, select: PUBLIC_TEMPLE_PROFILE_SELECT }),
    );
    if (!temple) {
      throw notFound("ไม่พบวัด");
    }
    return temple;
  }

  /**
   * Upcoming PUBLIC events: published (isPublic) + confirmed (planned) + future-dated,
   * at an ACTIVE temple. Selects only public-safe columns — NO requester name/phone,
   * monk fields, note, or devotee link. Optional templeId only narrows results.
   */
  async listUpcomingEvents(templeId?: string): Promise<PublicEventSummary[]> {
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const rows = await this.prisma.withSystemAccess((tx) =>
      tx.ceremony.findMany({
        where: {
          isPublic: true,
          status: "planned",
          ceremonyDate: { gte: today },
          tenant: { status: "active" },
          ...(templeId ? { tenantId: templeId } : {}),
        },
        select: {
          id: true,
          tenantId: true,
          ceremonyType: true,
          title: true,
          ceremonyDate: true,
          timeNote: true,
          location: true,
          tenant: { select: { nameTh: true } },
        },
        orderBy: [{ ceremonyDate: "asc" }, { createdAt: "asc" }],
        take: MAX_EVENTS,
      }),
    );

    return rows.map((row) => ({
      id: row.id,
      templeId: row.tenantId,
      templeNameTh: row.tenant.nameTh,
      ceremonyType: row.ceremonyType,
      title: row.title,
      ceremonyDate: row.ceremonyDate.toISOString().slice(0, 10),
      timeNote: row.timeNote,
      location: row.location,
    }));
  }
}
