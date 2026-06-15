import { Inject, Injectable } from "@nestjs/common";
import { conflict, notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";

export interface DevoteeAccountRecord {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

const DEVOTEE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PlatformDevoteesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(): Promise<DevoteeAccountRecord[]> {
    // Devotee accounts are global (no tenant); password_hash is never selected.
    return this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findMany({ orderBy: { createdAt: "asc" }, select: DEVOTEE_SELECT }),
    );
  }

  async disable(actorId: string, targetId: string, ip?: string): Promise<DevoteeAccountRecord> {
    return this.setActive(actorId, targetId, false, "devotee_account.disabled", ip);
  }

  async enable(actorId: string, targetId: string, ip?: string): Promise<DevoteeAccountRecord> {
    return this.setActive(actorId, targetId, true, "devotee_account.enabled", ip);
  }

  private async setActive(
    actorId: string,
    targetId: string,
    isActive: boolean,
    action: string,
    ip?: string,
  ): Promise<DevoteeAccountRecord> {
    return this.prisma.withSystemAccess(async (tx) => {
      const account = await tx.devoteeAccount.findUnique({ where: { id: targetId }, select: DEVOTEE_SELECT });
      if (!account) {
        throw notFound("ไม่พบบัญชีญาติโยม");
      }
      if (account.isActive === isActive) {
        throw conflict(isActive ? "บัญชีนี้เปิดใช้งานอยู่แล้ว" : "บัญชีนี้ถูกปิดอยู่แล้ว");
      }

      const updated = await tx.devoteeAccount.update({
        where: { id: targetId },
        data: { isActive, updatedAt: new Date() },
        select: DEVOTEE_SELECT,
      });

      // Disabling cuts off token refresh so the account cannot extend a session.
      if (!isActive) {
        await tx.devoteeRefreshToken.updateMany({
          where: { devoteeAccountId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action,
        entityType: "devotee_account",
        entityId: targetId,
        ip,
      });

      return updated;
    });
  }
}
