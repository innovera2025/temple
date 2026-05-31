import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { forbidden, unauthorized } from "../../common/errors/project-error";
import { PLATFORM_ROLES_KEY } from "../decorators/platform-roles.decorator";
import { PlatformRequest } from "../types/platform-request";

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(PLATFORM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PlatformRequest>();

    if (!request.platformUser) {
      throw unauthorized("Missing authenticated platform user");
    }

    if (!roles.includes(request.platformUser.platform_role)) {
      throw forbidden("Insufficient platform role");
    }

    return true;
  }
}
