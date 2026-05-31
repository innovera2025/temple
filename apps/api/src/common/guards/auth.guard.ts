import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { TokenService } from "../../auth/token.service";
import { unauthorized } from "../errors/project-error";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedRequest } from "../types/authenticated-request";

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = headerValue(request.headers.authorization ?? request.headers.Authorization);
    const [scheme, token] = authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      throw unauthorized("Missing access token");
    }

    const payload = this.tokenService.verifyAccessToken(token);

    // Re-validate against the DB so disabling a user or changing their role takes
    // effect immediately, rather than lasting until the access token expires. The
    // current role/email come from the DB (authoritative), not the stateless claim.
    const user = await this.prisma.withSystemAccess((tx) =>
      tx.user.findFirst({
        where: { id: payload.sub, tenantId: payload.tenant_id, isActive: true },
        select: { role: true, email: true },
      }),
    );
    if (!user) {
      throw unauthorized("Account is inactive or no longer exists");
    }

    request.user = {
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      role: user.role,
      email: user.email,
    };
    request.currentTenantId = payload.tenant_id;

    return true;
  }
}
