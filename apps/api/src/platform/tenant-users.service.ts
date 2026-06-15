import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type TenantUsersQuery } from "@wat/shared";
import { PasswordService } from "../auth/password.service";
import { notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";

/**
 * Cross-tenant tenant-user DIRECTORY (read-only). Returns identity/role metadata
 * only — never password_hash and never any finance entity. Every filter value is
 * applied explicitly; there is no RLS net under withSystemAccess.
 */
export interface TenantUserRecord {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}

const TENANT_USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

const MAX_DIRECTORY_ROWS = 500;

@Injectable()
export class TenantUsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  /** Cross-tenant admin password reset for a temple staff account: the platform
   *  owner sets a temporary password, revokes the user's sessions, and audits it
   *  (the temple's own admin manages day-to-day; this is the break-glass path). */
  async resetPassword(actorId: string, targetId: string, newPassword: string, ip?: string): Promise<TenantUserRecord> {
    const passwordHash = await this.passwords.hash(newPassword);
    return this.prisma.withSystemAccess(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: targetId }, select: TENANT_USER_SELECT });
      if (!user) {
        throw notFound("ไม่พบผู้ใช้วัด");
      }
      await tx.user.update({ where: { id: targetId }, data: { passwordHash, updatedAt: new Date() } });
      await tx.authRefreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action: "tenant_user.password_reset",
        entityType: "user",
        entityId: targetId,
        metadata: { tenantId: user.tenantId },
        ip,
      });
      return user;
    });
  }

  async list(actorId: string, query: TenantUsersQuery, ip?: string): Promise<TenantUserRecord[]> {
    const where: Prisma.UserWhereInput = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.email) where.email = { contains: query.email, mode: "insensitive" };

    return this.prisma.withSystemAccess(async (tx) => {
      const users = await tx.user.findMany({
        where,
        orderBy: [{ tenantId: "asc" }, { email: "asc" }],
        take: MAX_DIRECTORY_ROWS,
        select: TENANT_USER_SELECT,
      });

      // Cross-tenant identity reads are recorded like any other platform read of
      // tenant data. A read with no tenantId spans all temples — flag that.
      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action: "tenant_directory.listed",
        entityType: "user",
        entityId: query.tenantId ?? null,
        metadata: {
          tenantId: query.tenantId ?? null,
          crossTenant: query.tenantId === undefined,
          role: query.role ?? null,
          isActive: query.isActive ?? null,
          emailFilter: query.email ?? null,
          count: users.length,
        },
        ip,
      });

      return users;
    });
  }
}
