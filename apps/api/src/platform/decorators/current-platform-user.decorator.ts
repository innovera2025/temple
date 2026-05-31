import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { PlatformPrincipal, PlatformRequest } from "../types/platform-request";

export const CurrentPlatformUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformPrincipal | undefined => {
    const request = context.switchToHttp().getRequest<PlatformRequest>();

    return request.platformUser;
  },
);
