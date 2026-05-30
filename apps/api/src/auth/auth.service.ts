import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { unauthorized } from "../common/errors/project-error";
import { LoginDto, LogoutDto, RefreshDto } from "./auth.dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface LoginUser {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  passwordHash: string | null;
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PasswordService)
    private readonly passwordService: PasswordService,
    @Inject(TokenService)
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const email = normalizeEmail(dto.email);
    const user = await this.prisma.withSystemAccess((tx) =>
      tx.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          role: true,
          passwordHash: true,
          isActive: true,
        },
      }),
    );

    if (!user?.isActive || !user.passwordHash || !(await this.passwordService.verify(user.passwordHash, dto.password))) {
      throw unauthorized("Invalid email or password");
    }

    return this.issueTokenPair(user);
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const now = new Date();
    const replacementTokenId = randomUUID();

    return this.prisma.withTenant(payload.tenant_id, async (tx) => {
      const revoked = await tx.authRefreshToken.updateMany({
        where: {
          id: payload.token_id,
          tokenHash,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
        },
      });

      if (revoked.count !== 1) {
        throw unauthorized("Invalid refresh token");
      }

      const user = await tx.user.findFirst({
        where: {
          id: payload.sub,
          tenantId: payload.tenant_id,
          isActive: true,
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          role: true,
          passwordHash: true,
        },
      });

      if (!user) {
        throw unauthorized("Invalid refresh token");
      }

      const replacement = this.createRefreshToken(user, replacementTokenId);
      await tx.authRefreshToken.create({
        data: {
          id: replacementTokenId,
          tenantId: user.tenantId,
          userId: user.id,
          tokenHash: hashRefreshToken(replacement.refreshToken),
          expiresAt: replacement.expiresAt,
        },
      });
      await tx.authRefreshToken.update({
        where: {
          id: payload.token_id,
        },
        data: {
          revokedAt: now,
          replacedByTokenId: replacementTokenId,
        },
      });

      return {
        accessToken: this.tokenService.signAccessToken({
          sub: user.id,
          tenant_id: user.tenantId,
          role: user.role,
          email: user.email,
        }),
        refreshToken: replacement.refreshToken,
      };
    });
  }

  async logout(dto: LogoutDto): Promise<{ revoked: true }> {
    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);
    const tokenHash = hashRefreshToken(dto.refreshToken);

    await this.prisma.withTenant(payload.tenant_id, async (tx) => {
      const existing = await tx.authRefreshToken.findUnique({
        where: {
          id: payload.token_id,
        },
      });

      if (existing && existing.tokenHash === tokenHash && !existing.revokedAt) {
        await tx.authRefreshToken.update({
          where: {
            id: existing.id,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }
    });

    return { revoked: true };
  }

  private async issueTokenPair(user: LoginUser): Promise<TokenPair> {
    const refreshTokenId = randomUUID();
    const refresh = this.createRefreshToken(user, refreshTokenId);

    await this.prisma.withTenant(user.tenantId, async (tx) => {
      await tx.authRefreshToken.create({
        data: {
          id: refreshTokenId,
          tenantId: user.tenantId,
          userId: user.id,
          tokenHash: hashRefreshToken(refresh.refreshToken),
          expiresAt: refresh.expiresAt,
        },
      });
    });

    return {
      accessToken: this.tokenService.signAccessToken({
        sub: user.id,
        tenant_id: user.tenantId,
        role: user.role,
        email: user.email,
      }),
      refreshToken: refresh.refreshToken,
    };
  }

  private createRefreshToken(
    user: Omit<LoginUser, "passwordHash">,
    refreshTokenId: string,
  ): { refreshToken: string; expiresAt: Date } {
    return {
      refreshToken: this.tokenService.signRefreshToken({
        sub: user.id,
        tenant_id: user.tenantId,
        role: user.role,
        email: user.email,
        token_id: refreshTokenId,
      }),
      expiresAt: this.tokenService.refreshExpiresAt(),
    };
  }
}
