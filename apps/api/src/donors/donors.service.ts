import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateDonorInput, DonorSearchQuery, UpdateDonorInput } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface DonorRecord {
  id: string;
  tenantId: string;
  displayName: string;
  legalName: string | null;
  donorType: string;
  email: string | null;
  phone: string | null;
  lineId: string | null;
  address: string | null;
  taxId: string | null;
  tags: string[];
  notes: string | null;
  consent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

/** Build a JSON-safe snapshot of a donor for audit before/after columns. */
function auditSnapshot(donor: DonorRecord): Prisma.InputJsonObject {
  return {
    id: donor.id,
    displayName: donor.displayName,
    legalName: donor.legalName,
    donorType: donor.donorType,
    email: donor.email,
    phone: donor.phone,
    lineId: donor.lineId,
    address: donor.address,
    taxId: donor.taxId,
    tags: donor.tags,
    notes: donor.notes,
    consent: donor.consent,
  };
}

@Injectable()
export class DonorsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateDonorInput,
    ip?: string,
  ): Promise<DonorRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const donor = (await tx.donor.create({
        data: {
          tenantId,
          displayName: input.displayName,
          donorType: input.donorType,
          legalName: input.legalName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          lineId: input.lineId ?? null,
          address: input.address ?? null,
          tags: input.tags ?? [],
          notes: input.notes ?? null,
          consent: input.consent ?? false,
        },
      })) as DonorRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "donor:create",
          entityType: "donor",
          entityId: donor.id,
          after: auditSnapshot(donor),
          metadata: {},
          ip,
        },
      });

      return donor;
    });
  }

  async list(tenantId: string, query: DonorSearchQuery): Promise<DonorRecord[]> {
    const take = Math.min(query.take ?? DEFAULT_TAKE, MAX_TAKE);
    const skip = query.skip ?? 0;

    const where: Prisma.DonorWhereInput = {};
    if (query.donorType) {
      where.donorType = query.donorType;
    }
    if (query.consent !== undefined) {
      where.consent = query.consent;
    }
    if (query.tag) {
      where.tags = { has: query.tag };
    }
    if (query.q) {
      where.OR = [
        { displayName: { contains: query.q, mode: "insensitive" } },
        { legalName: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
        { phone: { contains: query.q, mode: "insensitive" } },
        { lineId: { contains: query.q, mode: "insensitive" } },
      ];
    }

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.donor.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    )) as DonorRecord[];
  }

  async getById(tenantId: string, id: string): Promise<DonorRecord> {
    const donor = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.donor.findFirst({ where: { id } }),
    )) as DonorRecord | null;

    if (!donor) {
      throw projectHttpException(404, "NOT_FOUND", "ไม่พบข้อมูลผู้บริจาค");
    }

    return donor;
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    input: UpdateDonorInput,
    ip?: string,
  ): Promise<DonorRecord> {
    const data: Prisma.DonorUpdateInput = { updatedAt: new Date() };
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.donorType !== undefined) data.donorType = input.donorType;
    if (input.legalName !== undefined) data.legalName = input.legalName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.lineId !== undefined) data.lineId = input.lineId;
    if (input.address !== undefined) data.address = input.address;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.consent !== undefined) data.consent = input.consent;

    return this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.donor.findFirst({ where: { id } })) as DonorRecord | null;
      if (!before) {
        throw projectHttpException(404, "NOT_FOUND", "ไม่พบข้อมูลผู้บริจาค");
      }

      const after = (await tx.donor.update({ where: { id }, data })) as DonorRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "donor:update",
          entityType: "donor",
          entityId: after.id,
          before: auditSnapshot(before),
          after: auditSnapshot(after),
          metadata: {},
          ip,
        },
      });

      return after;
    });
  }
}
