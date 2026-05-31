import { Controller, Get, Inject, Ip, Query, UseGuards } from "@nestjs/common";
import { isUuid, parseTenantUsersQuery } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { CurrentPlatformUser } from "./decorators/current-platform-user.decorator";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { TenantUserRecord, TenantUsersService } from "./tenant-users.service";
import { PlatformPrincipal } from "./types/platform-request";

/** Cross-tenant tenant-user directory (identity/role only — no finance, no PII secrets). */
@Controller("platform/users")
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class TenantUsersController {
  constructor(@Inject(TenantUsersService) private readonly tenantUsers: TenantUsersService) {}

  @Get()
  @PlatformRoles("super_admin", "support")
  async list(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ users: TenantUserRecord[] }> {
    // Fail closed: a present-but-malformed tenantId must error, never silently
    // widen the read to all tenants.
    if (typeof query.tenantId === "string" && query.tenantId.trim() !== "" && !isUuid(query.tenantId)) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "tenantId", message: "รหัสวัด (tenantId) ไม่ถูกต้อง" },
      ]);
    }
    return { users: await this.tenantUsers.list(actor.sub, parseTenantUsersQuery(query), ip) };
  }
}
