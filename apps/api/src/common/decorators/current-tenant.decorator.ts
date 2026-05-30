import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<{ currentTenantId?: string }>();

    return request.currentTenantId;
  },
);
