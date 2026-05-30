import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { unauthorized } from "../errors/project-error";
import { AuthenticatedRequest } from "../types/authenticated-request";

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user?.tenant_id || request.currentTenantId !== request.user.tenant_id) {
      throw unauthorized("Missing tenant context");
    }

    return true;
  }
}
