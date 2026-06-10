import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CeremonySearchQuery,
  type CreateCeremonyInput,
  type DevoteeCeremonyInput,
  type UpdateCeremonyInput,
} from "@wat/shared";
import { auditActorData } from "../common/audit/audit-actor";
import { notFound, projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface CeremonyRecord {
  id: string;
  ceremonyType: string;
  status: string;
  title: string;
  ceremonyDate: Date;
  timeNote: string | null;
  location: string | null;
  hallId: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  assignedMonks: string | null;
  monkCount: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvitedMonk {
  personnelId: string;
  displayName: string;
}

export interface HallRecord {
  id: string;
  name: string;
  capacity: number | null;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HallBooking {
  ceremonyId: string;
  title: string;
  ceremonyDate: Date;
  status: string;
}

/** Statuses that hold a booking (block the hall / the monk's schedule). */
const ACTIVE_BOOKING_STATUSES = ["planned", "requested"] as const;

/** Convert the validated ceremonyDate (YYYY-MM-DD) to a Date; pass other fields through. */
function toPrismaData(input: Partial<CreateCeremonyInput>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    // Not a ceremonies column — the invited-monk set lives in ceremony_monks.
    if (key === "monkPersonnelIds") continue;
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
    hallId: record.hallId,
    requesterName: record.requesterName,
    requesterPhone: record.requesterPhone,
    assignedMonks: record.assignedMonks,
    monkCount: record.monkCount,
    note: record.note,
  };
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class CeremoniesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * จองศาลา: the hall must exist (this tenant), be active, and be free on the
   * date — one active booking (planned/requested) per hall per day. 409 names
   * the conflicting ceremony so staff can resolve it.
   */
  private async assertHallBookable(
    tx: Prisma.TransactionClient,
    hallId: string,
    dateIso: string,
    excludeCeremonyId?: string,
  ): Promise<void> {
    const hall = (await tx.templeHall.findFirst({ where: { id: hallId } })) as HallRecord | null;
    if (!hall) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "hallId", message: "ไม่พบศาลา/สถานที่นี้ในทะเบียนของวัด" },
      ]);
    }
    if (!hall.isActive) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "hallId", message: `“${hall.name}” ปิดใช้งานอยู่` },
      ]);
    }
    const clash = (await tx.ceremony.findFirst({
      where: {
        hallId,
        ceremonyDate: new Date(`${dateIso}T00:00:00.000Z`),
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...(excludeCeremonyId ? { id: { not: excludeCeremonyId } } : {}),
      },
      select: { title: true },
    })) as { title: string } | null;
    if (clash) {
      throw projectHttpException(
        409,
        "CONFLICT",
        `“${hall.name}” ถูกจองแล้วในวันที่ ${dateIso} (งาน: ${clash.title})`,
      );
    }
  }

  /**
   * นิมนต์พระ: replace the invited-monk set. Every id must be an active
   * monk/novice in THIS temple's personnel registry, and no monk may be
   * booked into two active ceremonies on the same date.
   */
  private async syncInvitedMonks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ceremonyId: string,
    dateIso: string,
    personnelIds: string[],
  ): Promise<void> {
    if (personnelIds.length > 0) {
      const rows = (await tx.personnel.findMany({
        where: { id: { in: personnelIds } },
        select: { id: true, displayName: true, personnelType: true, status: true },
      })) as Array<{ id: string; displayName: string; personnelType: string; status: string }>;
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const id of personnelIds) {
        const row = byId.get(id);
        if (!row) {
          throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
            { field: "monkPersonnelIds", message: "ไม่พบพระรูปนี้ในทะเบียนบุคลากรของวัด" },
          ]);
        }
        if (row.personnelType !== "monk" && row.personnelType !== "novice") {
          throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
            { field: "monkPersonnelIds", message: `“${row.displayName}” ไม่ใช่พระ/สามเณร` },
          ]);
        }
        if (row.status !== "active") {
          throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
            { field: "monkPersonnelIds", message: `“${row.displayName}” ไม่ได้อยู่ในสถานะปฏิบัติงาน` },
          ]);
        }
      }

      // ตารางพระชน: same monk, same date, another active ceremony.
      const clashes = (await tx.ceremonyMonk.findMany({
        where: {
          personnelId: { in: personnelIds },
          ceremonyId: { not: ceremonyId },
          ceremony: {
            ceremonyDate: new Date(`${dateIso}T00:00:00.000Z`),
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
          },
        },
        select: { personnelId: true },
      })) as Array<{ personnelId: string }>;
      if (clashes.length > 0) {
        const clashed = byId.get(clashes[0]?.personnelId ?? "");
        throw projectHttpException(
          409,
          "CONFLICT",
          `“${clashed?.displayName ?? "พระรูปนี้"}” มีนิมนต์งานอื่นแล้วในวันที่ ${dateIso}`,
        );
      }
    }

    await tx.ceremonyMonk.deleteMany({ where: { ceremonyId } });
    if (personnelIds.length > 0) {
      await tx.ceremonyMonk.createMany({
        data: personnelIds.map((personnelId) => ({ tenantId, ceremonyId, personnelId })),
      });
    }
  }

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateCeremonyInput,
    ip?: string,
  ): Promise<CeremonyRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (input.hallId) {
        await this.assertHallBookable(tx, input.hallId, input.ceremonyDate);
      }

      const monkIds = input.monkPersonnelIds;
      const data = toPrismaData(input);
      if (monkIds !== undefined) {
        // The linked registry is authoritative for the count when provided.
        data.monkCount = monkIds.length;
      }

      const created = (await tx.ceremony.create({
        // tenantId LAST so the JWT tenant is authoritative regardless of input shape.
        data: { ...data, tenantId } as Prisma.CeremonyUncheckedCreateInput,
      })) as CeremonyRecord;

      if (monkIds !== undefined) {
        await this.syncInvitedMonks(tx, tenantId, created.id, isoDate(created.ceremonyDate), monkIds);
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "ceremony:create",
          entityType: "ceremony",
          entityId: created.id,
          after: snapshot(created),
          metadata: monkIds !== undefined ? { invitedMonkIds: monkIds } : {},
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

      // Effective values AFTER the patch — booking rules apply to the result.
      const effectiveHall = patch.hallId !== undefined ? patch.hallId : before.hallId;
      const effectiveDate = patch.ceremonyDate ?? isoDate(before.ceremonyDate);
      const effectiveStatus = patch.status ?? before.status;
      const stillActive = (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(effectiveStatus);
      const bookingChanged =
        patch.hallId !== undefined || patch.ceremonyDate !== undefined || patch.status !== undefined;
      if (effectiveHall && stillActive && bookingChanged) {
        await this.assertHallBookable(tx, effectiveHall, effectiveDate, id);
      }

      // A date move must re-validate the existing invited monks too — their
      // schedules clash on the NEW date, not the old one.
      let monkIds = patch.monkPersonnelIds;
      if (monkIds === undefined && patch.ceremonyDate !== undefined) {
        const existing = (await tx.ceremonyMonk.findMany({
          where: { ceremonyId: id },
          select: { personnelId: true },
        })) as Array<{ personnelId: string }>;
        if (existing.length > 0) {
          monkIds = existing.map((row) => row.personnelId);
        }
      }
      if (monkIds !== undefined && stillActive) {
        await this.syncInvitedMonks(tx, tenantId, id, effectiveDate, monkIds);
      }

      const data = toPrismaData(patch);
      if (patch.monkPersonnelIds !== undefined) {
        data.monkCount = patch.monkPersonnelIds.length;
      }

      let after: CeremonyRecord;
      try {
        after = (await tx.ceremony.update({
          where: { id },
          data: { ...data, updatedAt: new Date() },
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
          metadata: patch.monkPersonnelIds !== undefined ? { invitedMonkIds: patch.monkPersonnelIds } : {},
          ip,
        },
      });

      return after;
    });
  }

  /** The invited monks (from the personnel registry) for one ceremony. */
  async invitedMonks(tenantId: string, ceremonyId: string): Promise<InvitedMonk[]> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const links = (await tx.ceremonyMonk.findMany({
        where: { ceremonyId },
        select: { personnelId: true },
      })) as Array<{ personnelId: string }>;
      if (links.length === 0) return [];
      const people = (await tx.personnel.findMany({
        where: { id: { in: links.map((l) => l.personnelId) } },
        select: { id: true, displayName: true },
      })) as Array<{ id: string; displayName: string }>;
      const nameById = new Map(people.map((p) => [p.id, p.displayName]));
      return links.map((l) => ({
        personnelId: l.personnelId,
        displayName: nameById.get(l.personnelId) ?? "(ไม่พบในทะเบียน)",
      }));
    });
  }

  // ---- halls (ศาลา/สถานที่ของวัด) -------------------------------------------

  async listHalls(tenantId: string, includeInactive = false): Promise<HallRecord[]> {
    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.templeHall.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
    )) as HallRecord[];
  }

  async createHall(
    tenantId: string,
    actorUserId: string,
    input: { name: string; capacity?: number | null; note?: string | null },
    ip?: string,
  ): Promise<HallRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const duplicate = await tx.templeHall.findFirst({ where: { name: input.name }, select: { id: true } });
      if (duplicate) {
        throw projectHttpException(409, "CONFLICT", `มีศาลาชื่อ “${input.name}” อยู่แล้ว`);
      }
      const hall = (await tx.templeHall.create({
        data: {
          tenantId,
          name: input.name,
          capacity: input.capacity ?? null,
          note: input.note ?? null,
        },
      })) as HallRecord;
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "hall:create",
          entityType: "temple_hall",
          entityId: hall.id,
          after: { name: hall.name, capacity: hall.capacity, note: hall.note },
          metadata: {},
          ip,
        },
      });
      return hall;
    });
  }

  async updateHall(
    tenantId: string,
    actorUserId: string,
    id: string,
    patch: { name?: string; capacity?: number | null; note?: string | null; isActive?: boolean },
    ip?: string,
  ): Promise<HallRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.templeHall.findFirst({ where: { id } })) as HallRecord | null;
      if (!before) {
        throw notFound("ไม่พบศาลา/สถานที่");
      }
      if (patch.name && patch.name !== before.name) {
        const duplicate = await tx.templeHall.findFirst({
          where: { name: patch.name, id: { not: id } },
          select: { id: true },
        });
        if (duplicate) {
          throw projectHttpException(409, "CONFLICT", `มีศาลาชื่อ “${patch.name}” อยู่แล้ว`);
        }
      }
      const after = (await tx.templeHall.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          updatedAt: new Date(),
        },
      })) as HallRecord;
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "hall:update",
          entityType: "temple_hall",
          entityId: id,
          before: { name: before.name, capacity: before.capacity, note: before.note, isActive: before.isActive },
          after: { name: after.name, capacity: after.capacity, note: after.note, isActive: after.isActive },
          metadata: {},
          ip,
        },
      });
      return after;
    });
  }

  /** Active bookings of one hall in a date range (for the availability view). */
  async hallBookings(
    tenantId: string,
    hallId: string,
    range: { dateFrom?: string; dateTo?: string } = {},
  ): Promise<HallBooking[]> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const where: Prisma.CeremonyWhereInput = {
        hallId,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
      };
      if (range.dateFrom || range.dateTo) {
        const dateFilter: Prisma.DateTimeFilter = {};
        if (range.dateFrom) dateFilter.gte = new Date(`${range.dateFrom}T00:00:00.000Z`);
        if (range.dateTo) dateFilter.lte = new Date(`${range.dateTo}T00:00:00.000Z`);
        where.ceremonyDate = dateFilter;
      }
      const rows = (await tx.ceremony.findMany({
        where,
        orderBy: { ceremonyDate: "asc" },
        take: 200,
        select: { id: true, title: true, ceremonyDate: true, status: true },
      })) as Array<{ id: string; title: string; ceremonyDate: Date; status: string }>;
      return rows.map((row) => ({
        ceremonyId: row.id,
        title: row.title,
        ceremonyDate: row.ceremonyDate,
        status: row.status,
      }));
    });
  }
}
