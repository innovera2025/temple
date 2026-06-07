import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { type PlatformLoginInput } from "@wat/shared";
import { unauthorized } from "../common/errors/project-error";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PlatformTokenService } from "./platform-token.service";
import { recordPlatformAudit } from "./platform-audit";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface PlatformLoginUser {
  id: string;
  email: string;
  platformRole: string;
  passwordHash: string | null;
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class PlatformAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(PlatformTokenService) private readonly tokenService: PlatformTokenService,
  ) {}

  async login(dto: PlatformLoginInput, ip?: string): Promise<TokenPair> {
    const user = await this.prisma.withSystemAccess((tx) =>
      tx.platformUser.findUnique({
        where: { email: dto.email },
        select: { id: true, email: true, platformRole: true, passwordHash: true, isActive: true },
      }),
    );

    if (!user?.isActive || !user.passwordHash) {
      // Equalize timing on the account-missing/inactive path (enumeration oracle).
      await this.passwordService.verifyDummy(dto.password);
      throw unauthorized("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
    if (!(await this.passwordService.verify(user.passwordHash, dto.password))) {
      throw unauthorized("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    return this.issueTokenPair(user, ip);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const replacementTokenId = randomUUID();

    return this.prisma.withSystemAccess(async (tx) => {
      const revoked = await tx.platformRefreshToken.updateMany({
        where: {
          id: payload.token_id,
          tokenHash,
          platformUserId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (revoked.count !== 1) {
        // Reuse containment: a replay of an ALREADY-revoked token (matching hash)
        // means the family may be compromised — revoke the whole family.
        const existing = await tx.platformRefreshToken.findUnique({
          where: { id: payload.token_id },
          select: { tokenHash: true, revokedAt: true },
        });
        if (existing && existing.tokenHash === tokenHash && existing.revokedAt) {
          await tx.platformRefreshToken.updateMany({
            where: { platformUserId: payload.sub, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        throw unauthorized("Invalid refresh token");
      }

      const user = await tx.platformUser.findFirst({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true, platformRole: true },
      });

      if (!user) {
        throw unauthorized("Invalid refresh token");
      }

      const replacement = this.createRefreshToken(user, replacementTokenId);
      await tx.platformRefreshToken.create({
        data: {
          id: replacementTokenId,
          platformUserId: user.id,
          tokenHash: hashRefreshToken(replacement.refreshToken),
          expiresAt: replacement.expiresAt,
        },
      });
      await tx.platformRefreshToken.update({
        where: { id: payload.token_id },
        data: { revokedAt: now, replacedByTokenId: replacementTokenId },
      });

      return {
        accessToken: this.tokenService.signAccessToken({
          sub: user.id,
          platform_role: user.platformRole,
          email: user.email,
        }),
        refreshToken: replacement.refreshToken,
      };
    });
  }

  async logout(refreshToken: string): Promise<{ revoked: true }> {
    const payload = this.tokenService.verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);

    await this.prisma.withSystemAccess(async (tx) => {
      const existing = await tx.platformRefreshToken.findUnique({ where: { id: payload.token_id } });

      if (existing && existing.tokenHash === tokenHash && !existing.revokedAt) {
        await tx.platformRefreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
      }
    });

    return { revoked: true };
  }

  private async issueTokenPair(user: PlatformLoginUser, ip?: string): Promise<TokenPair> {
    const refreshTokenId = randomUUID();
    const refresh = this.createRefreshToken(user, refreshTokenId);

    await this.prisma.withSystemAccess(async (tx) => {
      await tx.platformRefreshToken.create({
        data: {
          id: refreshTokenId,
          platformUserId: user.id,
          tokenHash: hashRefreshToken(refresh.refreshToken),
          expiresAt: refresh.expiresAt,
        },
      });
      await recordPlatformAudit(tx, {
        actorPlatformUserId: user.id,
        action: "platform_auth.login",
        entityType: "platform_user",
        entityId: user.id,
        ip,
      });
    });

    return {
      accessToken: this.tokenService.signAccessToken({
        sub: user.id,
        platform_role: user.platformRole,
        email: user.email,
      }),
      refreshToken: refresh.refreshToken,
    };
  }

  private createRefreshToken(
    user: Omit<PlatformLoginUser, "passwordHash">,
    refreshTokenId: string,
  ): { refreshToken: string; expiresAt: Date } {
    return {
      refreshToken: this.tokenService.signRefreshToken({
        sub: user.id,
        platform_role: user.platformRole,
        email: user.email,
        token_id: refreshTokenId,
      }),
      expiresAt: this.tokenService.refreshExpiresAt(),
    };
  }
}
