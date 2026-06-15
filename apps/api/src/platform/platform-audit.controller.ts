import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { PlatformAuditRecord, PlatformAuditService } from "./platform-audit.service";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@Controller("platform/audit")
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class PlatformAuditController {
  constructor(@Inject(PlatformAuditService) private readonly audit: PlatformAuditService) {}

  // Read-only history — support may view it too (they cannot mutate anything else).
  @Get()
  @PlatformRoles("super_admin", "support")
  async list(@Query("action") action?: string): Promise<{ logs: PlatformAuditRecord[] }> {
    return { logs: await this.audit.list({ action: typeof action === "string" && action ? action : undefined }) };
  }
}
