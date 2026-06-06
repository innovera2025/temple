import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { unauthorized } from "../../common/errors/project-error";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DevoteeTokenService } from "../devotee-token.service";
import { DevoteeRequest } from "../types/devotee-request";

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Authenticates a devotee (ญาติโยม) principal. Sets `request.devotee` and,
 * crucially, NO `currentTenantId` — a devotee is tenant-independent and selects
 * a temple per request via route param, never via the token.
 *
 * After verifying the (stateless) token it RE-READS the devotee account so that
 * disabling an account is an immediate kill-switch (rather than waiting out the
 * access-token TTL). The `typ`-discrimination in DevoteeTokenService guarantees
 * a tenant or platform token is rejected here, and a devotee token is rejected
 * by the tenant AuthGuard / platform guard.
 */
@Injectable()
export class DevoteeGuard implements CanActivate {
  constructor(
    @Inject(DevoteeTokenService) private readonly tokenService: DevoteeTokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DevoteeRequest>();
    const authorization = headerValue(request.headers.authorization ?? request.headers.Authorization);
    const [scheme, token] = authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      throw unauthorized("Missing access token");
    }

    const payload = this.tokenService.verifyAccessToken(token);

    const account = await this.prisma.withSystemAccess((tx) =>
      tx.devoteeAccount.findFirst({
        where: { id: payload.sub, isActive: true },
        select: { id: true, email: true },
      }),
    );
    if (!account) {
      throw unauthorized("Devotee account is inactive or no longer exists");
    }

    request.devotee = { sub: account.id, email: account.email };

    return true;
  }
}
