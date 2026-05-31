import { Controller, Get, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentPlatformUser } from "./decorators/current-platform-user.decorator";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { PlatformUserRecord, PlatformUsersService } from "./platform-users.service";
import { PlatformPrincipal } from "./types/platform-request";
import { assertUuidParam } from "./uuid-param";

@Controller("platform/platform-users")
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class PlatformUsersController {
  constructor(@Inject(PlatformUsersService) private readonly platformUsers: PlatformUsersService) {}

  @Get()
  @PlatformRoles("super_admin")
  async list(): Promise<{ platformUsers: PlatformUserRecord[] }> {
    return { platformUsers: await this.platformUsers.list() };
  }

  @Post(":id/disable")
  @PlatformRoles("super_admin")
  async disable(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
  ): Promise<{ platformUser: PlatformUserRecord }> {
    assertUuidParam(id);
    return { platformUser: await this.platformUsers.disable(actor.sub, id, ip) };
  }

  @Post(":id/enable")
  @PlatformRoles("super_admin")
  async enable(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
  ): Promise<{ platformUser: PlatformUserRecord }> {
    assertUuidParam(id);
    return { platformUser: await this.platformUsers.enable(actor.sub, id, ip) };
  }
}
