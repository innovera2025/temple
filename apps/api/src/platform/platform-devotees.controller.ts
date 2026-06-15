import { Body, Controller, Get, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import { validatePasswordReset } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { CurrentPlatformUser } from "./decorators/current-platform-user.decorator";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { DevoteeAccountRecord, PlatformDevoteesService } from "./platform-devotees.service";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { PlatformPrincipal } from "./types/platform-request";
import { assertUuidParam } from "./uuid-param";

@Controller("platform/devotees")
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class PlatformDevoteesController {
  constructor(@Inject(PlatformDevoteesService) private readonly devotees: PlatformDevoteesService) {}

  @Get()
  @PlatformRoles("super_admin", "support")
  async list(): Promise<{ devotees: DevoteeAccountRecord[] }> {
    return { devotees: await this.devotees.list() };
  }

  @Post(":id/disable")
  @PlatformRoles("super_admin")
  async disable(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
  ): Promise<{ devotee: DevoteeAccountRecord }> {
    assertUuidParam(id);
    return { devotee: await this.devotees.disable(actor.sub, id, ip) };
  }

  @Post(":id/enable")
  @PlatformRoles("super_admin")
  async enable(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
  ): Promise<{ devotee: DevoteeAccountRecord }> {
    assertUuidParam(id);
    return { devotee: await this.devotees.enable(actor.sub, id, ip) };
  }

  @Post(":id/reset-password")
  @PlatformRoles("super_admin")
  async resetPassword(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ devotee: DevoteeAccountRecord }> {
    assertUuidParam(id);
    const parsed = validatePasswordReset(body);
    if (!parsed.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", parsed.errors);
    }
    return { devotee: await this.devotees.resetPassword(actor.sub, id, parsed.data.newPassword, ip) };
  }
}
