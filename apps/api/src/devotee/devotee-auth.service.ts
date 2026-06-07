import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { type DevoteeLoginInput, type DevoteeRegisterInput } from "@wat/shared";
import { projectHttpException, unauthorized } from "../common/errors/project-error";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { DevoteeTokenService } from "./devotee-token.service";

export interface DevoteeTokenPair {
  accessToken: string;
  refreshToken: string;
}

interface DevoteeIdentity {
  id: string;
  email: string;
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Devotee (ญาติโยม) self-service auth. Mirrors PlatformAuthService but the
 * identity table is `devotee_accounts` and the plane is fully tenant-independent
 * (no role, no tenant_id). Email is unique per `devotee_accounts` only — the same
 * human may also be tenant staff at some temple; the planes are separated by
 * login endpoint + token `typ`, never by a cross-table uniqueness rule.
 */
@Injectable()
export class DevoteeAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(DevoteeTokenService) private readonly tokenService: DevoteeTokenService,
  ) {}

  async register(dto: DevoteeRegisterInput, ip?: string): Promise<DevoteeTokenPair> {
    const passwordHash = await this.passwordService.hash(dto.password);

    const account = await this.prisma.withSystemAccess(async (tx) => {
      const existing = await tx.devoteeAccount.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (existing) {
        throw projectHttpException(409, "CONFLICT", "อีเมลนี้ถูกใช้สมัครแล้ว", [
          { field: "email", message: "อีเมลนี้ถูกใช้สมัครแล้ว" },
        ]);
      }

      return tx.devoteeAccount.create({
        data: {
          email: dto.email,
          displayName: dto.displayName,
          passwordHash,
          ...(dto.phone ? { phone: dto.phone } : {}),
        },
        select: { id: true, email: true },
      });
    });

    return this.issueTokenPair(account, ip);
  }

  async login(dto: DevoteeLoginInput, ip?: string): Promise<DevoteeTokenPair> {
    const account = await this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findUnique({
        where: { email: dto.email },
        select: { id: true, email: true, passwordHash: true, isActive: true },
      }),
    );

    if (!account?.isActive || !account.passwordHash) {
      // Equalize timing so a missing/inactive account isn't faster than a wrong
      // password on a real one (user-enumeration timing oracle).
      await this.passwordService.verifyDummy(dto.password);
      throw unauthorized("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
    if (!(await this.passwordService.verify(account.passwordHash, dto.password))) {
      throw unauthorized("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    return this.issueTokenPair(account, ip);
  }

  async refresh(refreshToken: string): Promise<DevoteeTokenPair> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const replacementTokenId = randomUUID();

    return this.prisma.withSystemAccess(async (tx) => {
      const revoked = await tx.devoteeRefreshToken.updateMany({
        where: {
          id: payload.token_id,
          tokenHash,
          devoteeAccountId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (revoked.count !== 1) {
        // Reuse containment: a replay of an ALREADY-revoked token (matching hash)
        // means the family may be compromised — revoke the whole family.
        const existing = await tx.devoteeRefreshToken.findUnique({
          where: { id: payload.token_id },
          select: { tokenHash: true, revokedAt: true },
        });
        if (existing && existing.tokenHash === tokenHash && existing.revokedAt) {
          await tx.devoteeRefreshToken.updateMany({
            where: { devoteeAccountId: payload.sub, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        throw unauthorized("Invalid refresh token");
      }

      const account = await tx.devoteeAccount.findFirst({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true },
      });

      if (!account) {
        throw unauthorized("Invalid refresh token");
      }

      const replacement = this.createRefreshToken(account, replacementTokenId);
      await tx.devoteeRefreshToken.create({
        data: {
          id: replacementTokenId,
          devoteeAccountId: account.id,
          tokenHash: hashRefreshToken(replacement.refreshToken),
          expiresAt: replacement.expiresAt,
        },
      });
      await tx.devoteeRefreshToken.update({
        where: { id: payload.token_id },
        data: { revokedAt: now, replacedByTokenId: replacementTokenId },
      });

      return {
        accessToken: this.tokenService.signAccessToken({ sub: account.id, email: account.email }),
        refreshToken: replacement.refreshToken,
      };
    });
  }

  async logout(refreshToken: string): Promise<{ revoked: true }> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);

    await this.prisma.withSystemAccess(async (tx) => {
      const existing = await tx.devoteeRefreshToken.findUnique({ where: { id: payload.token_id } });

      if (existing && existing.tokenHash === tokenHash && !existing.revokedAt) {
        await tx.devoteeRefreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
      }
    });

    return { revoked: true };
  }

  private async issueTokenPair(account: DevoteeIdentity, _ip?: string): Promise<DevoteeTokenPair> {
    const refreshTokenId = randomUUID();
    const refresh = this.createRefreshToken(account, refreshTokenId);

    await this.prisma.withSystemAccess(async (tx) => {
      await tx.devoteeRefreshToken.create({
        data: {
          id: refreshTokenId,
          devoteeAccountId: account.id,
          tokenHash: hashRefreshToken(refresh.refreshToken),
          expiresAt: refresh.expiresAt,
        },
      });
    });

    return {
      accessToken: this.tokenService.signAccessToken({ sub: account.id, email: account.email }),
      refreshToken: refresh.refreshToken,
    };
  }

  private createRefreshToken(
    account: DevoteeIdentity,
    refreshTokenId: string,
  ): { refreshToken: string; expiresAt: Date } {
    return {
      refreshToken: this.tokenService.signRefreshToken({
        sub: account.id,
        email: account.email,
        token_id: refreshTokenId,
      }),
      expiresAt: this.tokenService.refreshExpiresAt(),
    };
  }
}
