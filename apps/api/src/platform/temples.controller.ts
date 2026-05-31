import { Body, Controller, Get, Inject, Ip, Param, Post, Query, UseGuards } from "@nestjs/common";
import { parseTemplesQuery, validateReason } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { CurrentPlatformUser } from "./decorators/current-platform-user.decorator";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { TempleRecord, TemplesService } from "./temples.service";
import { PlatformPrincipal } from "./types/platform-request";
import { assertUuidParam } from "./uuid-param";

@Controller("platform/temples")
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class TemplesController {
  constructor(@Inject(TemplesService) private readonly temples: TemplesService) {}

  @Get()
  @PlatformRoles("super_admin", "support")
  async list(@Query() query: Record<string, unknown>): Promise<{ temples: TempleRecord[] }> {
    return { temples: await this.temples.list(parseTemplesQuery(query)) };
  }

  @Post(":id/suspend")
  @PlatformRoles("super_admin")
  async suspend(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ temple: TempleRecord }> {
    assertUuidParam(id);
    const result = validateReason(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { temple: await this.temples.suspend(actor.sub, id, result.data.reason, ip) };
  }

  @Post(":id/resume")
  @PlatformRoles("super_admin")
  async resume(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ temple: TempleRecord }> {
    assertUuidParam(id);
    const result = validateReason(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { temple: await this.temples.resume(actor.sub, id, result.data.reason, ip) };
  }
}
