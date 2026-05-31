import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type CreateUserInput, type UpdateUserInput, type UserSearchQuery } from "@wat/shared";
import { PasswordService } from "../auth/password.service";
import { conflict, forbidden, notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// passwordHash is NEVER selected — it must never leave the service.
const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function snapshot(user: UserRecord): Prisma.InputJsonObject {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
  ) {}

  async list(tenantId: string, query: UserSearchQuery): Promise<UserRecord[]> {
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.q) {
      where.OR = [
        { displayName: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
      ];
    }
    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findMany({ where, orderBy: [{ displayName: "asc" }], select: USER_SELECT }),
    )) as UserRecord[];
  }

  async get(tenantId: string, id: string): Promise<UserRecord> {
    const user = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { id }, select: USER_SELECT }),
    )) as UserRecord | null;
    if (!user) {
      throw notFound("ไม่พบผู้ใช้");
    }
    return user;
  }

  async create(
    tenantId: string,
    actorUserId: string,
    input: CreateUserInput,
    ip?: string,
  ): Promise<UserRecord> {
    const passwordHash = await this.passwordService.hash(input.password);
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Friendly same-tenant pre-check; the try/catch is the cross-tenant backstop
      // (email is globally unique, but RLS hides other tenants from this read).
      if (await tx.user.findFirst({ where: { email: input.email }, select: { id: true } })) {
        throw conflict("อีเมลนี้ถูกใช้แล้ว");
      }

      let created: UserRecord;
      try {
        created = (await tx.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            role: input.role,
            passwordHash,
            isActive: true,
            tenantId,
          },
          select: USER_SELECT,
        })) as UserRecord;
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw conflict("อีเมลนี้ถูกใช้แล้วในระบบ");
        }
        throw error;
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "user:create",
          entityType: "user",
          entityId: created.id,
          after: snapshot(created),
          metadata: {},
          ip,
        },
      });

      return created;
    });
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    patch: UpdateUserInput,
    ip?: string,
  ): Promise<UserRecord> {
    const passwordHash = patch.password !== undefined ? await this.passwordService.hash(patch.password) : undefined;

    return this.prisma.withTenant(tenantId, async (tx) => {
      // Serialise admin-capability changes per tenant so two concurrent demotions
      // cannot both pass the last-admin check and leave the temple with zero admins.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || ':users')::bigint)`;

      const before = (await tx.user.findFirst({ where: { id }, select: USER_SELECT })) as UserRecord | null;
      if (!before) {
        throw notFound("ไม่พบผู้ใช้");
      }

      if (id === actorUserId && patch.isActive === false) {
        throw forbidden("ปิดบัญชีของตนเองไม่ได้");
      }

      const removesAdmin =
        before.role === "admin" &&
        before.isActive &&
        (patch.isActive === false || (patch.role !== undefined && patch.role !== "admin"));
      if (removesAdmin) {
        const otherActiveAdmins = await tx.user.count({
          where: { role: "admin", isActive: true, id: { not: id } },
        });
        if (otherActiveAdmins === 0) {
          throw conflict("ต้องมีผู้ดูแล (admin) ที่ใช้งานอยู่อย่างน้อย 1 คน");
        }
      }

      const data: Prisma.UserUpdateInput = { updatedAt: new Date() };
      if (patch.displayName !== undefined) data.displayName = patch.displayName;
      if (patch.role !== undefined) data.role = patch.role;
      if (patch.isActive !== undefined) data.isActive = patch.isActive;
      if (passwordHash !== undefined) data.passwordHash = passwordHash;

      const after = (await tx.user.update({ where: { id }, data, select: USER_SELECT })) as UserRecord;

      // Disabling (or changing the password of) a user cuts off token refresh so the
      // account cannot extend a session beyond the short access-token TTL.
      if (patch.isActive === false || passwordHash !== undefined) {
        await tx.authRefreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "user:update",
          entityType: "user",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
          metadata: { passwordChanged: passwordHash !== undefined },
          ip,
        },
      });

      return after;
    });
  }
}
