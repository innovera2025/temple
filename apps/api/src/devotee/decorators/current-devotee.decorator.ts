import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { DevoteePrincipal, DevoteeRequest } from "../types/devotee-request";

export const CurrentDevotee = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DevoteePrincipal | undefined => {
    const request = context.switchToHttp().getRequest<DevoteeRequest>();

    return request.devotee;
  },
);
