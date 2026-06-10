import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

export interface WriteAuditLogInput {
  tenantId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  ip?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditLogListQuery {
  /** Filter by action family, e.g. "donation:" / "ledger:" (prefix match). */
  actionPrefix?: string;
  entityId?: string;
  take?: number;
  skip?: number;
}

export interface AuditLogListItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: Date;
}

const LIST_DEFAULT_TAKE = 50;
const LIST_MAX_TAKE = 100;

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  actorUserId: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: Date;
  actorUser: { displayName: string; role: string } | null;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Read the tenant's edit history (ประวัติการแก้ไข), newest first. Read-only —
   * the audit trail itself is append-only at the DB grant level. The before/
   * after JSON snapshots are deliberately NOT returned on the list endpoint
   * (they may carry donor PII); this is the who/what/when view.
   */
  async list(tenantId: string, query: AuditLogListQuery = {}): Promise<AuditLogListItem[]> {
    const take = Math.min(query.take ?? LIST_DEFAULT_TAKE, LIST_MAX_TAKE);
    const skip = query.skip ?? 0;
    const where: Prisma.AuditLogWhereInput = {};
    if (query.actionPrefix) {
      where.action = { startsWith: query.actionPrefix };
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }

    const rows = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorType: true,
          actorUserId: true,
          reason: true,
          ip: true,
          createdAt: true,
          actorUser: { select: { displayName: true, role: true } },
        },
      }),
    )) as AuditLogRow[];

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorType: row.actorType,
      actorUserId: row.actorUserId,
      actorName: row.actorUser?.displayName ?? (row.actorType === "devotee" ? "ญาติโยม (พอร์ทัล)" : null),
      actorRole: row.actorUser?.role ?? null,
      reason: row.reason,
      ip: row.ip,
      createdAt: row.createdAt,
    }));
  }

  async write(input: WriteAuditLogInput): Promise<void> {
    await this.prisma.withTenant(input.tenantId, async (tx) => {
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          before: input.before,
          after: input.after,
          reason: input.reason,
          ip: input.ip,
          metadata: input.metadata ?? {},
        },
      });
    });
  }
}
