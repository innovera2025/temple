import { Controller, Get, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
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
}
