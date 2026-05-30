import {
  Body,
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { Audit } from "./audit.decorator";
import { AuditDemoMutationDto } from "./audit-demo.dto";
import { AuditInterceptor } from "./audit.interceptor";

@Controller("audit/demo-mutations")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class AuditDemoController {
  @Post()
  @Roles("admin", "finance")
  @Audit({ action: "demo:update", entityType: "demo_mutation" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Body() body: AuditDemoMutationDto,
  ): {
    tenantId: string;
    actorUserId: string;
    entityId: string;
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
    reason?: string;
  } {
    return {
      tenantId,
      actorUserId: user.sub,
      entityId: body.entityId,
      before: body.before,
      after: body.after,
      reason: body.reason,
    };
  }
}
