import { Inject, Injectable } from "@nestjs/common";
import { conflict, forbidden, notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";

export interface PlatformUserRecord {
  id: string;
  email: string;
  displayName: string;
  platformRole: string;
  isActive: boolean;
  createdAt: Date;
}

const PLATFORM_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  platformRole: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class PlatformUsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(): Promise<PlatformUserRecord[]> {
    // password_hash is never selected.
    return this.prisma.withSystemAccess((tx) =>
      tx.platformUser.findMany({ orderBy: { createdAt: "asc" }, select: PLATFORM_USER_SELECT }),
    );
  }

  async disable(actorId: string, targetId: string, ip?: string): Promise<PlatformUserRecord> {
    if (actorId === targetId) {
      throw forbidden("ปิดบัญชีของตนเองไม่ได้");
    }
    return this.setActive(actorId, targetId, false, "platform_user.disabled", ip);
  }

  async enable(actorId: string, targetId: string, ip?: string): Promise<PlatformUserRecord> {
    return this.setActive(actorId, targetId, true, "platform_user.enabled", ip);
  }

  private async setActive(
    actorId: string,
    targetId: string,
    isActive: boolean,
    action: string,
    ip?: string,
  ): Promise<PlatformUserRecord> {
    return this.prisma.withSystemAccess(async (tx) => {
      const user = await tx.platformUser.findUnique({ where: { id: targetId }, select: PLATFORM_USER_SELECT });
      if (!user) {
        throw notFound("ไม่พบผู้ใช้แพลตฟอร์ม");
      }
      if (user.isActive === isActive) {
        throw conflict(isActive ? "บัญชีนี้เปิดใช้งานอยู่แล้ว" : "บัญชีนี้ถูกปิดอยู่แล้ว");
      }

      const updated = await tx.platformUser.update({
        where: { id: targetId },
        data: { isActive, updatedAt: new Date() },
        select: PLATFORM_USER_SELECT,
      });

      // Disabling also cuts off token refresh so the account cannot extend a session.
      if (!isActive) {
        await tx.platformRefreshToken.updateMany({
          where: { platformUserId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action,
        entityType: "platform_user",
        entityId: targetId,
        ip,
      });

      return updated;
    });
  }
}
