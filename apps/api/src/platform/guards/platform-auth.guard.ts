import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { unauthorized } from "../../common/errors/project-error";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PlatformTokenService } from "../platform-token.service";
import { PlatformRequest } from "../types/platform-request";

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Authenticates a platform principal. Sets `request.platformUser` and, crucially,
 * NO `currentTenantId` — the platform plane never carries tenant context.
 *
 * After verifying the (stateless) token it RE-READS the platform user so that
 * disabling an account is an immediate kill-switch (rather than waiting out the
 * access-token TTL) and the current platform_role is used instead of a stale
 * claim. The platform plane is low-traffic, so the per-request lookup is cheap.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    @Inject(PlatformTokenService) private readonly tokenService: PlatformTokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const authorization = headerValue(request.headers.authorization ?? request.headers.Authorization);
    const [scheme, token] = authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      throw unauthorized("Missing access token");
    }

    const payload = this.tokenService.verifyAccessToken(token);

    const user = await this.prisma.withSystemAccess((tx) =>
      tx.platformUser.findFirst({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true, platformRole: true },
      }),
    );
    if (!user) {
      throw unauthorized("Platform account is inactive or no longer exists");
    }

    request.platformUser = { sub: user.id, platform_role: user.platformRole, email: user.email };

    return true;
  }
}
