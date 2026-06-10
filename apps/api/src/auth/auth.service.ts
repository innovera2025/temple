import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { conflict, serviceUnavailable, unauthorized } from "../common/errors/project-error";
import { LoginDto, LogoutDto, RefreshDto, RegisterDto, SocialStartDto } from "./auth.dto";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RegistrationResult {
  id: string;
  templeNameTh: string;
  contactEmail: string;
  status: "pending";
}

export type SocialProvider = "google" | "facebook";

export interface SocialStartResult {
  provider: SocialProvider;
  authUrl: string;
  state: string;
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

function oauthEnv(provider: SocialProvider): { clientId?: string; redirectUri?: string; scope: string; endpoint: string } {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      scope: "openid email profile",
      endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    };
  }
  return {
    clientId: process.env.FACEBOOK_OAUTH_CLIENT_ID,
    redirectUri: process.env.FACEBOOK_OAUTH_REDIRECT_URI,
    scope: "email,public_profile",
    endpoint: "https://www.facebook.com/v20.0/dialog/oauth",
  };
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

    if (!user?.isActive || !user.passwordHash) {
      // Equalize timing on the account-missing/inactive path (enumeration oracle).
      await this.passwordService.verifyDummy(dto.password);
      throw unauthorized("Invalid email or password");
    }
    if (!(await this.passwordService.verify(user.passwordHash, dto.password))) {
      throw unauthorized("Invalid email or password");
    }

    return this.issueTokenPair(user);
  }

  /**
   * Self-service signup creates a pending temple application only. It never creates
   * an active tenant admin/user by itself; platform approval remains the authority
   * for tenant bootstrap and privileged access.
   */
  async register(dto: RegisterDto): Promise<RegistrationResult> {
    const contactEmail = normalizeEmail(dto.contactEmail);
    const templeNameTh = dto.templeNameTh.trim();

    return this.prisma.withSystemAccess(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email: contactEmail }, select: { id: true } });
      if (existingUser) {
        throw conflict("อีเมลนี้มีบัญชีผู้ใช้แล้ว");
      }

      const existingApplication = await tx.templeApplication.findFirst({
        where: { contactEmail, status: { in: ["pending", "approved"] } },
        select: { id: true },
      });
      if (existingApplication) {
        throw conflict("อีเมลนี้มีใบสมัครที่รอตรวจสอบหรือได้รับอนุมัติแล้ว");
      }

      // Hash the password to validate/accept the field without persisting a privileged
      // credential in the current schema. Approval still sets the first admin password.
      await this.passwordService.hash(dto.password);

      const application = await tx.templeApplication.create({
        data: { templeNameTh, contactEmail, status: "pending" },
        select: { id: true, templeNameTh: true, contactEmail: true, status: true },
      });

      await tx.platformAuditLog.create({
        data: {
          actorPlatformUserId: null,
          action: "auth.register.pending_application_created",
          entityType: "temple_application",
          entityId: application.id,
          metadata: { contactEmail, displayName: dto.displayName.trim(), source: "self_service_register" },
        },
      });

      return { ...application, status: "pending" };
    });
  }

  // NOTE: the code-exchange callback for this flow is not built yet — the web
  // login hides the social buttons unless VITE_SHOW_SOCIAL_LOGIN=true. The
  // redirect URI comes ONLY from server env (never the client) so this can't
  // be pointed at an attacker-chosen destination.
  startSocialSignup(provider: SocialProvider, _dto: Pick<SocialStartDto, "redirectUri">): SocialStartResult {
    const env = oauthEnv(provider);
    const redirectUri = env.redirectUri;
    if (!env.clientId || !redirectUri) {
      throw serviceUnavailable(`${provider} OAuth ยังไม่ได้ตั้งค่า client id / redirect uri`);
    }

    const state = randomUUID();
    const url = new URL(env.endpoint);
    url.searchParams.set("client_id", env.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", env.scope);
    url.searchParams.set("state", state);
    if (provider === "google") {
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "select_account");
    }
    return { provider, authUrl: url.toString(), state };
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const payload = this.tokenService.verifyRefreshToken(dto.refreshToken);
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const now = new Date();
    const replacementTokenId = randomUUID();

    const result = await this.prisma.withTenant(payload.tenant_id, async (tx) => {
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
        // Reuse containment: a replay of an ALREADY-revoked token (matching hash)
        // means the family may be compromised. The family revocation must NOT run
        // here — a throw inside this transaction would roll it back — so signal
        // the caller, which persists the revocation in its own transaction.
        const existing = await tx.authRefreshToken.findUnique({
          where: { id: payload.token_id },
          select: { tokenHash: true, revokedAt: true },
        });
        const reuseDetected = existing?.tokenHash === tokenHash && existing.revokedAt !== null;
        return { ok: false as const, reuseDetected };
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
        ok: true as const,
        tokens: {
          accessToken: this.tokenService.signAccessToken({
            sub: user.id,
            tenant_id: user.tenantId,
            role: user.role,
            email: user.email,
          }),
          refreshToken: replacement.refreshToken,
        },
      };
    });

    if (!result.ok) {
      if (result.reuseDetected) {
        await this.prisma.withTenant(payload.tenant_id, (tx) =>
          tx.authRefreshToken.updateMany({
            where: { userId: payload.sub, revokedAt: null },
            data: { revokedAt: now },
          }),
        );
      }
      throw unauthorized("Invalid refresh token");
    }

    return result.tokens;
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
