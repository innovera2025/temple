import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { TokenService } from "../../auth/token.service";
import { unauthorized } from "../errors/project-error";
import { AuthenticatedRequest } from "../types/authenticated-request";

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(TokenService) private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = headerValue(request.headers.authorization ?? request.headers.Authorization);
    const [scheme, token] = authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      throw unauthorized("Missing access token");
    }

    const payload = this.tokenService.verifyAccessToken(token);
    request.user = {
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      role: payload.role,
      email: payload.email,
    };
    request.currentTenantId = payload.tenant_id;

    return true;
  }
}
