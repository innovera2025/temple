import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CeremonySearchQuery,
  type CreateCeremonyInput,
  type DevoteeCeremonyInput,
  type UpdateCeremonyInput,
} from "@wat/shared";
import { auditActorData } from "../common/audit/audit-actor";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface CeremonyRecord {
  id: string;
  ceremonyType: string;
  status: string;
  title: string;
  ceremonyDate: Date;
  timeNote: string | null;
  location: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  assignedMonks: string | null;
  monkCount: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Convert the validated ceremonyDate (YYYY-MM-DD) to a Date; pass other fields through. */
function toPrismaData(input: Partial<CreateCeremonyInput>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (key === "ceremonyDate") {
      data.ceremonyDate = new Date(`${value as string}T00:00:00.000Z`);
    } else {
      data[key] = value;
    }
  }
  return data;
}

function snapshot(record: CeremonyRecord): Prisma.InputJsonObject {
  return {
    id: record.id,
    ceremonyType: record.ceremonyType,
    status: record.status,
    title: record.title,
    ceremonyDate: record.ceremonyDate.toISOString().slice(0, 10),
    timeNote: record.timeNote,
    location: record.location,
    requesterName: record.requesterName,
    requesterPhone: record.requesterPhone,
    assignedMonks: record.assignedMonks,
    monkCount: record.monkCount,
    note: record.note,
  };
}

@Injectable()
export class CeremoniesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateCeremonyInput,
    ip?: string,
  ): Promise<CeremonyRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const created = (await tx.ceremony.create({
        // tenantId LAST so the JWT tenant is authoritative regardless of input shape.
        data: { ...toPrismaData(input), tenantId } as Prisma.CeremonyUncheckedCreateInput,
      })) as CeremonyRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "ceremony:create",
          entityType: "ceremony",
          entityId: created.id,
          after: snapshot(created),
          metadata: {},
          ip,
        },
      });

      return created;
    });
  }

  /**
   * A devotee (ญาติโยม) booking a ceremony at a temple they selected. Runs under
   * the caller's tenant tx so RLS binds the row to that temple. The server — not
   * the client — sets `status = requested`, the requester name (the devotee's own
   * name), the devotee link, and leaves the staff-only monk fields empty. The audit
   * row records the devotee actor (actor_type='devotee', actor_user_id NULL).
   */
  async createDevoteeBooking(
    tenantId: string,
    devotee: { id: string; email: string; displayName: string },
    input: DevoteeCeremonyInput,
    ip?: string,
  ): Promise<CeremonyRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const created = (await tx.ceremony.create({
        data: {
          tenantId,
          devoteeAccountId: devotee.id,
          status: "requested",
          ceremonyType: input.ceremonyType,
          title: input.title,
          ceremonyDate: new Date(`${input.ceremonyDate}T00:00:00.000Z`),
          timeNote: input.timeNote ?? null,
          location: input.location ?? null,
          requesterName: devotee.displayName,
          requesterPhone: input.requesterPhone ?? null,
          note: input.note ?? null,
        } as Prisma.CeremonyUncheckedCreateInput,
      })) as CeremonyRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          ...auditActorData({ kind: "devotee", devoteeAccountId: devotee.id, email: devotee.email }),
          action: "ceremony:create",
          entityType: "ceremony",
          entityId: created.id,
          after: snapshot(created),
          metadata: { source: "devotee_booking" },
          ip,
        },
      });

      return created;
    });
  }

  async list(tenantId: string, query: CeremonySearchQuery): Promise<CeremonyRecord[]> {
    const where: Prisma.CeremonyWhereInput = {};
    if (query.ceremonyType) where.ceremonyType = query.ceremonyType;
    if (query.status) where.status = query.status;
    if (query.q) where.title = { contains: query.q, mode: "insensitive" };
    if (query.dateFrom || query.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (query.dateFrom) dateFilter.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
      if (query.dateTo) dateFilter.lte = new Date(`${query.dateTo}T00:00:00.000Z`);
      where.ceremonyDate = dateFilter;
    }

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.ceremony.findMany({
        where,
        orderBy: [{ ceremonyDate: "desc" }, { createdAt: "desc" }],
        take: query.take ?? 100,
        skip: query.skip ?? 0,
      }),
    )) as CeremonyRecord[];
  }

  async get(tenantId: string, id: string): Promise<CeremonyRecord> {
    const record = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.ceremony.findFirst({ where: { id } }),
    )) as CeremonyRecord | null;
    if (!record) {
      throw notFound("ไม่พบงานพิธี");
    }
    return record;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    patch: UpdateCeremonyInput,
    ip?: string,
  ): Promise<CeremonyRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.ceremony.findFirst({ where: { id } })) as CeremonyRecord | null;
      if (!before) {
        throw notFound("ไม่พบงานพิธี");
      }

      let after: CeremonyRecord;
      try {
        after = (await tx.ceremony.update({
          where: { id },
          data: { ...toPrismaData(patch), updatedAt: new Date() },
        })) as CeremonyRecord;
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw notFound("ไม่พบงานพิธี");
        }
        throw error;
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "ceremony:update",
          entityType: "ceremony",
          entityId: id,
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
