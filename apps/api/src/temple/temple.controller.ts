import { Body, Controller, Get, Inject, Ip, Patch, UseGuards } from "@nestjs/common";
import { validateTempleProfileUpdate, type TempleProfile } from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { TempleService } from "./temple.service";

@Controller("temple")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class TempleController {
  constructor(@Inject(TempleService) private readonly temple: TempleService) {}

  // Profile is reference data shown on documents -> any tenant member may read it.
  @Get()
  @Roles("admin", "finance", "staff")
  async get(@CurrentTenant() tenantId: string): Promise<{ temple: TempleProfile }> {
    return { temple: await this.temple.get(tenantId) };
  }

  // Master data edits are admin-only and audited.
  @Patch()
  @Roles("admin")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ temple: TempleProfile }> {
    const result = validateTempleProfileUpdate(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { temple: await this.temple.update(tenantId, user.sub, result.data, ip) };
  }
}
