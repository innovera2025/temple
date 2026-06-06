import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { type ApplicationsQuery, type ApproveApplicationInput } from "@wat/shared";
import { conflict, notFound } from "../common/errors/project-error";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { recordPlatformAudit } from "./platform-audit";
import { TempleRecord } from "./temples.service";

export interface ApplicationRecord {
  id: string;
  templeNameTh: string;
  contactEmail: string;
  status: string;
  reviewedByPlatformUserId: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdTempleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApproveResult {
  application: ApplicationRecord;
  temple: TempleRecord;
  adminUserId: string;
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
  ) {}

  async list(query: ApplicationsQuery): Promise<ApplicationRecord[]> {
    return this.prisma.withSystemAccess((tx) =>
      tx.templeApplication.findMany({
        where: query.status ? { status: query.status } : {},
        orderBy: { createdAt: "desc" },
      }),
    );
  }

  /**
   * Approve a pending application: create an active temple, bootstrap its first
   * admin user, link the application to the temple, and audit — all atomically.
   * The application is claimed with a conditional update so concurrent approvals
   * cannot both succeed (the loser gets 409).
   */
  async approve(
    actorId: string,
    applicationId: string,
    input: ApproveApplicationInput,
    ip?: string,
  ): Promise<ApproveResult> {
    return this.prisma.withSystemAccess(async (tx) => {
      const application = await tx.templeApplication.findUnique({ where: { id: applicationId } });
      if (!application) {
        throw notFound("ไม่พบใบสมัคร");
      }
      if (application.status !== "pending") {
        throw conflict("ใบสมัครนี้ถูกตรวจสอบแล้ว");
      }

      const adminEmail = (input.adminEmail ?? application.contactEmail).toLowerCase();

      // Friendly pre-checks (the try/catch below is the concurrency backstop).
      if (await tx.temple.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
        throw conflict("slug นี้ถูกใช้แล้ว");
      }
      if (await tx.user.findUnique({ where: { email: adminEmail }, select: { id: true } })) {
        throw conflict("อีเมลแอดมินนี้ถูกใช้ในระบบแล้ว");
      }

      // Claim the application first so two concurrent approves cannot both proceed.
      const claim = await tx.templeApplication.updateMany({
        where: { id: applicationId, status: "pending" },
        data: { status: "approved", reviewedByPlatformUserId: actorId, reviewedAt: new Date() },
      });
      if (claim.count !== 1) {
        throw conflict("ใบสมัครนี้ถูกตรวจสอบแล้ว");
      }

      let temple: TempleRecord;
      let adminUserId: string;
      try {
        temple = await tx.temple.create({
          data: {
            slug: input.slug,
            nameTh: application.templeNameTh,
            nameEn: input.nameEn ?? null,
            status: "active",
          },
          select: TEMPLE_SELECT,
        });
        const passwordHash = await this.passwordService.hash(input.adminPassword);
        const adminUser = await tx.user.create({
          data: {
            tenantId: temple.id,
            email: adminEmail,
            displayName: input.adminDisplayName ?? "ผู้ดูแลวัด",
            role: "admin",
            passwordHash,
            isActive: true,
          },
          select: { id: true },
        });
        adminUserId = adminUser.id;

        // Seed a default chart of accounts so the temple can post donations from
        // day one. Donation income auto-posts to revenue account code "4000"
        // (DonationsService.DEFAULT_REVENUE_ACCOUNT_CODE); without it every
        // donation — staff or devotee — would 422 "ไม่พบบัญชีรายรับ". Mirrors the
        // dev seed (packages/db/prisma/seed.ts) and stays atomic with approval.
        await tx.ledgerAccount.createMany({
          data: [
            { tenantId: temple.id, code: "1000", nameTh: "เงินสด", accountType: "asset" },
            { tenantId: temple.id, code: "1100", nameTh: "เงินฝากธนาคาร", accountType: "asset" },
            { tenantId: temple.id, code: "4000", nameTh: "รายรับเงินบริจาค", accountType: "revenue" },
            { tenantId: temple.id, code: "5000", nameTh: "ค่าใช้จ่ายทั่วไป", accountType: "expense" },
          ],
        });
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw conflict("slug หรืออีเมลแอดมินถูกใช้แล้ว");
        }
        throw error;
      }

      const updatedApplication = await tx.templeApplication.update({
        where: { id: applicationId },
        data: { createdTempleId: temple.id },
      });

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action: "application.approved",
        entityType: "temple_application",
        entityId: applicationId,
        metadata: { createdTempleId: temple.id, slug: temple.slug, adminUserId, adminEmail },
        ip,
      });

      return { application: updatedApplication, temple, adminUserId };
    });
  }

  async reject(
    actorId: string,
    applicationId: string,
    reason: string,
    ip?: string,
  ): Promise<ApplicationRecord> {
    return this.prisma.withSystemAccess(async (tx) => {
      const application = await tx.templeApplication.findUnique({ where: { id: applicationId } });
      if (!application) {
        throw notFound("ไม่พบใบสมัคร");
      }

      const reviewedAt = new Date();
      const claim = await tx.templeApplication.updateMany({
        where: { id: applicationId, status: "pending" },
        data: { status: "rejected", rejectionReason: reason, reviewedByPlatformUserId: actorId, reviewedAt },
      });
      if (claim.count !== 1) {
        throw conflict("ใบสมัครนี้ถูกตรวจสอบแล้ว");
      }

      await recordPlatformAudit(tx, {
        actorPlatformUserId: actorId,
        action: "application.rejected",
        entityType: "temple_application",
        entityId: applicationId,
        metadata: { reason },
        ip,
      });

      // Build the result from the claimed row (no second query -> no P2025 escape).
      return { ...application, status: "rejected", rejectionReason: reason, reviewedByPlatformUserId: actorId, reviewedAt };
    });
  }
}
