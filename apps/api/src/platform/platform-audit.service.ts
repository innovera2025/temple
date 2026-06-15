import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

export interface PlatformAuditRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Email of the platform user who performed the action (null for system rows). */
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;

@Injectable()
export class PlatformAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Read the platform-plane audit trail (newest first). Read-only: there is no
   *  create/update/delete here — rows are appended by recordPlatformAudit inside
   *  each mutating platform action and are never editable. */
  async list(options: { action?: string; limit?: number } = {}): Promise<PlatformAuditRecord[]> {
    const take = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await this.prisma.withSystemAccess((tx) =>
      tx.platformAuditLog.findMany({
        where: options.action ? { action: options.action } : undefined,
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          actorPlatformUser: { select: { email: true } },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorEmail: r.actorPlatformUser?.email ?? null,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt,
    }));
  }
}
