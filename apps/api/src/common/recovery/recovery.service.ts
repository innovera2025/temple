import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { projectHttpException } from "../errors/project-error";
import { PasswordService } from "../../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type Purpose = "password_reset" | "email_verify";

function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: createHash("sha256").update(raw).digest("hex") };
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Base URL the email links point at (the web app), no trailing slash. */
function webBaseUrl(): string {
  return (process.env.PUBLIC_WEB_URL?.trim() || "http://localhost:5173").replace(/\/+$/, "");
}

function invalidToken(): never {
  throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่", [
    { field: "token", message: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" },
  ]);
}

/**
 * Account recovery + devotee email verification for the staff and devotee
 * planes (platform recovery stays platform-assisted by design).
 *
 * Token model: 32 random bytes, sha256 stored, single-use, TTL-bound. The
 * forgot endpoints always answer the same way whether or not the email exists
 * (no account-enumeration oracle); they are rate-limited at the controller.
 * A successful reset revokes every refresh token of the account.
 */
@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  /**
   * Run reset/verification delivery OFF the request path. The account lookup,
   * token creation, and mail send must not extend the HTTP response, or their
   * cost reveals whether the email belongs to a real account (a timing oracle):
   * a known account would always answer slower than an unknown one. By detaching
   * the work, every forgot-password request returns in the same constant time.
   * Failures are logged, never surfaced (the endpoint already answered 202).
   */
  private runInBackground(work: () => Promise<void>): void {
    void work().catch((err) => {
      this.logger.error(`recovery delivery failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  // ---- staff (tenant users) -------------------------------------------------

  async requestStaffReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    // Detach: do NOT await — constant-time response regardless of existence.
    this.runInBackground(() => this.deliverStaffReset(normalized));
  }

  private async deliverStaffReset(normalized: string): Promise<void> {
    const user = await this.prisma.withSystemAccess((tx) =>
      tx.user.findUnique({
        where: { email: normalized },
        select: { id: true, isActive: true, displayName: true },
      }),
    );
    if (!user?.isActive) {
      return; // unknown/disabled account — nothing to send
    }

    const token = newToken();
    await this.prisma.withSystemAccess((tx) =>
      tx.authActionToken.create({
        data: {
          purpose: "password_reset",
          tokenHash: token.hash,
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    );

    await this.mail.send({
      to: normalized,
      subject: "ตั้งรหัสผ่านใหม่ — ระบบจัดการวัด",
      text: [
        `สวัสดี ${user.displayName}`,
        "",
        "มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีเจ้าหน้าที่ของคุณ เปิดลิงก์นี้ภายใน 30 นาที:",
        `${webBaseUrl()}/#/reset-password/staff?token=${token.raw}`,
        "",
        "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้ตามปกติ",
      ].join("\n"),
    });
  }

  async resetStaffPassword(rawToken: string, newPassword: string, ip?: string): Promise<void> {
    const passwordHash = await this.passwordService.hash(newPassword);
    const tokenHash = hashToken(rawToken);

    await this.prisma.withSystemAccess(async (tx) => {
      const row = await this.consumeToken(tx, tokenHash, "password_reset");
      if (!row?.userId) {
        invalidToken();
      }
      const user = await tx.user.findFirst({
        where: { id: row.userId, isActive: true },
        select: { id: true, tenantId: true },
      });
      if (!user) {
        invalidToken();
      }

      await tx.user.update({ where: { id: user.id }, data: { passwordHash, updatedAt: new Date() } });
      // A reset proves control of the email, not of existing sessions — kill them.
      await tx.authRefreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "user:password_reset",
          entityType: "user",
          entityId: user.id,
          metadata: { via: "email_token" },
          ip,
        },
      });
    });
  }

  // ---- devotee (ญาติโยม) ----------------------------------------------------

  async requestDevoteeReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    // Detach: constant-time response (see requestStaffReset / runInBackground).
    this.runInBackground(() => this.deliverDevoteeReset(normalized));
  }

  private async deliverDevoteeReset(normalized: string): Promise<void> {
    const account = await this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findUnique({
        where: { email: normalized },
        select: { id: true, isActive: true, displayName: true },
      }),
    );
    if (!account?.isActive) {
      return;
    }

    const token = newToken();
    await this.prisma.withSystemAccess((tx) =>
      tx.authActionToken.create({
        data: {
          purpose: "password_reset",
          tokenHash: token.hash,
          devoteeAccountId: account.id,
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    );

    await this.mail.send({
      to: normalized,
      subject: "ตั้งรหัสผ่านใหม่ — พอร์ทัลญาติโยม",
      text: [
        `สวัสดี ${account.displayName}`,
        "",
        "มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีญาติโยมของคุณ เปิดลิงก์นี้ภายใน 30 นาที:",
        `${webBaseUrl()}/#/reset-password/devotee?token=${token.raw}`,
        "",
        "ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้ตามปกติ",
      ].join("\n"),
    });
  }

  async resetDevoteePassword(rawToken: string, newPassword: string): Promise<void> {
    const passwordHash = await this.passwordService.hash(newPassword);
    const tokenHash = hashToken(rawToken);

    await this.prisma.withSystemAccess(async (tx) => {
      const row = await this.consumeToken(tx, tokenHash, "password_reset");
      if (!row?.devoteeAccountId) {
        invalidToken();
      }
      const account = await tx.devoteeAccount.findFirst({
        where: { id: row.devoteeAccountId, isActive: true },
        select: { id: true },
      });
      if (!account) {
        invalidToken();
      }

      await tx.devoteeAccount.update({
        where: { id: account.id },
        data: { passwordHash, updatedAt: new Date() },
      });
      await tx.devoteeRefreshToken.updateMany({
        where: { devoteeAccountId: account.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /** Send (or resend) the verification mail. No-op for unknown/verified accounts. */
  async sendDevoteeVerification(devoteeAccountId: string): Promise<void> {
    const account = await this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findFirst({
        where: { id: devoteeAccountId, isActive: true },
        select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
      }),
    );
    if (!account || account.emailVerifiedAt) {
      return;
    }

    const token = newToken();
    await this.prisma.withSystemAccess((tx) =>
      tx.authActionToken.create({
        data: {
          purpose: "email_verify",
          tokenHash: token.hash,
          devoteeAccountId: account.id,
          expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        },
      }),
    );

    await this.mail.send({
      to: account.email,
      subject: "ยืนยันอีเมลของคุณ — พอร์ทัลญาติโยม",
      text: [
        `สวัสดี ${account.displayName}`,
        "",
        "กรุณายืนยันอีเมลของบัญชีญาติโยมด้วยลิงก์นี้ (ใช้ได้ 7 วัน):",
        `${webBaseUrl()}/#/verify-email?token=${token.raw}`,
        "",
        "ถ้าคุณไม่ได้สมัครใช้งาน แจ้งวัดหรือเพิกเฉยอีเมลฉบับนี้ได้",
      ].join("\n"),
    });
  }

  async verifyDevoteeEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.prisma.withSystemAccess(async (tx) => {
      const row = await this.consumeToken(tx, tokenHash, "email_verify");
      if (!row?.devoteeAccountId) {
        invalidToken();
      }
      await tx.devoteeAccount.update({
        where: { id: row.devoteeAccountId },
        data: { emailVerifiedAt: new Date(), updatedAt: new Date() },
      });
    });
  }

  /**
   * Atomically claim a live token (single-use): the guarded updateMany means
   * two concurrent attempts can never both succeed. Returns the row or null.
   */
  private async consumeToken(
    tx: Prisma.TransactionClient,
    tokenHash: string,
    purpose: Purpose,
  ): Promise<{ userId: string | null; devoteeAccountId: string | null } | null> {
    const claimed = await tx.authActionToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return null;
    }
    return tx.authActionToken.findUnique({
      where: { tokenHash },
      select: { userId: true, devoteeAccountId: true },
    });
  }
}
