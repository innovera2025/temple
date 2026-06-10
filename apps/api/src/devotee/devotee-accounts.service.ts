import { Inject, Injectable } from "@nestjs/common";
import { type DevoteeProfileUpdateInput } from "@wat/shared";
import { PasswordService } from "../auth/password.service";
import { notFound, unauthorized } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface DevoteeProfile {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  emailVerifiedAt: Date | null;
}

/**
 * Reads/updates a devotee's own account (via withSystemAccess — devotee_accounts has
 * no RLS and is migrate-only). Used to stamp the devotee's name onto temple-side
 * records (donor / ceremony requester) and to back the account-settings endpoints.
 */
@Injectable()
export class DevoteeAccountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
  ) {}

  async requireProfile(devoteeAccountId: string): Promise<DevoteeProfile> {
    const account = await this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findFirst({
        where: { id: devoteeAccountId },
        select: { id: true, email: true, displayName: true, phone: true, emailVerifiedAt: true },
      }),
    );
    if (!account) {
      throw notFound("ไม่พบบัญชีผู้ใช้");
    }
    return account;
  }

  /** Update the devotee's own editable profile fields (display name, phone). */
  async updateProfile(devoteeAccountId: string, input: DevoteeProfileUpdateInput): Promise<DevoteeProfile> {
    return this.prisma.withSystemAccess(async (tx) => {
      const existing = await tx.devoteeAccount.findFirst({
        where: { id: devoteeAccountId },
        select: { id: true },
      });
      if (!existing) {
        throw notFound("ไม่พบบัญชีผู้ใช้");
      }
      return tx.devoteeAccount.update({
        where: { id: devoteeAccountId },
        data: { displayName: input.displayName, phone: input.phone, updatedAt: new Date() },
        select: { id: true, email: true, displayName: true, phone: true, emailVerifiedAt: true },
      });
    });
  }

  /**
   * Change the devotee's own password: verify the current password, store the new
   * hash, and revoke ALL of the devotee's refresh tokens so other sessions are
   * forced to re-login (the current short-lived access token expires on its own).
   */
  async changePassword(devoteeAccountId: string, currentPassword: string, newPassword: string): Promise<void> {
    const account = await this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findFirst({
        where: { id: devoteeAccountId, isActive: true },
        select: { id: true, passwordHash: true },
      }),
    );
    if (!account?.passwordHash || !(await this.passwordService.verify(account.passwordHash, currentPassword))) {
      throw unauthorized("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    }
    const newHash = await this.passwordService.hash(newPassword);
    await this.prisma.withSystemAccess(async (tx) => {
      await tx.devoteeAccount.update({
        where: { id: devoteeAccountId },
        data: { passwordHash: newHash, updatedAt: new Date() },
      });
      await tx.devoteeRefreshToken.updateMany({
        where: { devoteeAccountId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
