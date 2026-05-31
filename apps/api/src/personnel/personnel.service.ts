import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CreatePersonnelInput,
  type PersonnelSearchQuery,
  type UpdatePersonnelInput,
} from "@wat/shared";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface PersonnelRecord {
  id: string;
  personnelType: string;
  status: string;
  displayName: string;
  dharmaName: string | null;
  secularName: string | null;
  rank: string | null;
  position: string | null;
  ordinationDate: Date | null;
  ordinationTemple: string | null;
  preceptor: string | null;
  phansaCount: number | null;
  dateOfBirth: Date | null;
  nationalId: string | null;
  phone: string | null;
  note: string | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DATE_FIELDS = ["ordinationDate", "dateOfBirth", "joinedAt"] as const;

function isUniqueDateKey(key: string): key is (typeof DATE_FIELDS)[number] {
  return (DATE_FIELDS as readonly string[]).includes(key);
}

/** Convert validated string dates (YYYY-MM-DD) to Date; keep null; drop undefined. */
function toPrismaData(input: Partial<CreatePersonnelInput>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (isUniqueDateKey(key)) {
      data[key] = value === null ? null : new Date(`${value as string}T00:00:00.000Z`);
    } else {
      data[key] = value;
    }
  }
  return data;
}

function snapshot(record: PersonnelRecord): Prisma.InputJsonObject {
  const dateOnly = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
  // The national ID is sensitive PII; keep only the last 4 digits in the long-lived
  // audit trail (it still evidences a change without persisting the full number).
  const maskedNationalId = record.nationalId ? `****${record.nationalId.slice(-4)}` : null;
  return {
    id: record.id,
    personnelType: record.personnelType,
    status: record.status,
    displayName: record.displayName,
    dharmaName: record.dharmaName,
    secularName: record.secularName,
    rank: record.rank,
    position: record.position,
    ordinationDate: dateOnly(record.ordinationDate),
    ordinationTemple: record.ordinationTemple,
    preceptor: record.preceptor,
    phansaCount: record.phansaCount,
    dateOfBirth: dateOnly(record.dateOfBirth),
    nationalId: maskedNationalId,
    phone: record.phone,
    note: record.note,
    joinedAt: dateOnly(record.joinedAt),
  };
}

@Injectable()
export class PersonnelService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreatePersonnelInput,
    ip?: string,
  ): Promise<PersonnelRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const created = (await tx.personnel.create({
        // tenantId LAST so context (the JWT tenant) is always authoritative,
        // independent of the validated input shape.
        data: { ...toPrismaData(input), tenantId } as Prisma.PersonnelUncheckedCreateInput,
      })) as PersonnelRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "personnel:create",
          entityType: "personnel",
          entityId: created.id,
          after: snapshot(created),
          metadata: {},
          ip,
        },
      });

      return created;
    });
  }

  async list(tenantId: string, query: PersonnelSearchQuery): Promise<PersonnelRecord[]> {
    const where: Prisma.PersonnelWhereInput = {};
    if (query.personnelType) where.personnelType = query.personnelType;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { displayName: { contains: query.q, mode: "insensitive" } },
        { dharmaName: { contains: query.q, mode: "insensitive" } },
        { secularName: { contains: query.q, mode: "insensitive" } },
      ];
    }

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.personnel.findMany({
        where,
        orderBy: [{ personnelType: "asc" }, { displayName: "asc" }],
        take: query.take ?? 100,
        skip: query.skip ?? 0,
      }),
    )) as PersonnelRecord[];
  }

  async get(tenantId: string, id: string): Promise<PersonnelRecord> {
    const record = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.personnel.findFirst({ where: { id } }),
    )) as PersonnelRecord | null;
    if (!record) {
      throw notFound("ไม่พบบุคลากร");
    }
    return record;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    patch: UpdatePersonnelInput,
    ip?: string,
  ): Promise<PersonnelRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.personnel.findFirst({ where: { id } })) as PersonnelRecord | null;
      if (!before) {
        throw notFound("ไม่พบบุคลากร");
      }

      let after: PersonnelRecord;
      try {
        after = (await tx.personnel.update({
          where: { id },
          data: { ...toPrismaData(patch), updatedAt: new Date() },
        })) as PersonnelRecord;
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw notFound("ไม่พบบุคลากร");
        }
        throw error;
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "personnel:update",
          entityType: "personnel",
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
