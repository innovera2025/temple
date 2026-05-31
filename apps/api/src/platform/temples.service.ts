import { Inject, Injectable } from "@nestjs/common";
import { type TemplesQuery } from "@wat/shared";
import { conflict, notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";

export interface TempleRecord {
  id: string;
  slug: string;
  nameTh: string;
  nameEn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const TEMPLE_SELECT = {
  id: true,
  slug: true,
  nameTh: true,
  nameEn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class TemplesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: TemplesQuery): Promise<TempleRecord[]> {
    return this.prisma.withSystemAccess((tx) =>
      tx.temple.findMany({
        where: query.status ? { status: query.status } : {},
        orderBy: { createdAt: "desc" },
        select: TEMPLE_SELECT,
      }),
    );
  }

  async suspend(actorId: string, templeId: string, reason: string, ip?: string): Promise<TempleRecord> {
    return this.transition(actorId, templeId, reason, "suspended", "temple.suspended", ip);
  }

  async resume(actorId: string, templeId: string, reason: string, ip?: string): Promise<TempleRecord> {
    return this.transition(actorId, templeId, reason, "active", "temple.resumed", ip);
  }

  private async transition(
    actorId: string,
    templeId: string,
    reason: string,
    target: "active" | "suspended",
    action: string,
    ip?: string,
  ): Promise<TempleRecord> {
    return this.prisma.withSystemAccess(async (tx) => {
      const temple = await tx.temple.findUnique({ where: { id: templeId }, select: TEMPLE_SELECT });
      if (!temple) {
        throw notFound("ไม่พบวัด");
      }
      // suspend requires an active temple; resume requires a suspended one.
      const expected = target === "suspended" ? "active" : "suspended";
      if (temple.status !== expected) {
        throw conflict(
          target === "suspended" ? "วัดนี้ไม่ได้อยู่ในสถานะใช้งาน" : "วัดนี้ไม่ได้ถูกระงับอยู่",
        );
      }

      const updated = await tx.temple.update({
        where: { id: templeId },
        data: { status: target, updatedAt: new Date() },
        select: TEMPLE_SELECT,
      });

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action,
        entityType: "temple",
        entityId: templeId,
        metadata: { reason, previousStatus: temple.status, newStatus: target },
        ip,
      });

      return updated;
    });
  }
}
