import { Body, Controller, Delete, Get, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import { validateBreakGlassOpen } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { CurrentPlatformUser } from "./decorators/current-platform-user.decorator";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { BreakGlassGrantRecord, BreakGlassService, TenantSnapshot } from "./break-glass.service";
import { PlatformPrincipal } from "./types/platform-request";
import { assertUuidParam } from "./uuid-param";

@Controller("platform/break-glass")
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class BreakGlassController {
  constructor(@Inject(BreakGlassService) private readonly breakGlass: BreakGlassService) {}

  @Post()
  @PlatformRoles("super_admin", "support")
  async open(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ grant: BreakGlassGrantRecord }> {
    const result = validateBreakGlassOpen(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { grant: await this.breakGlass.open(actor.sub, result.data, ip) };
  }

  @Get()
  @PlatformRoles("super_admin", "support")
  async list(@CurrentPlatformUser() actor: PlatformPrincipal): Promise<{ grants: BreakGlassGrantRecord[] }> {
    return { grants: await this.breakGlass.listOwn(actor.sub) };
  }

  @Delete(":id")
  @PlatformRoles("super_admin", "support")
  async revoke(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
  ): Promise<{ grant: BreakGlassGrantRecord }> {
    assertUuidParam(id);
    return { grant: await this.breakGlass.revoke(actor, id, ip) };
  }

  @Get(":id/tenant-snapshot")
  @PlatformRoles("super_admin", "support")
  async snapshot(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
  ): Promise<{ snapshot: TenantSnapshot }> {
    assertUuidParam(id);
    return { snapshot: await this.breakGlass.snapshot(actor, id, ip) };
  }
}
