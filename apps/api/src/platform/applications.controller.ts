import { Body, Controller, Get, Inject, Ip, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  parseApplicationsQuery,
  validateApproveApplication,
  validateReason,
} from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { CurrentPlatformUser } from "./decorators/current-platform-user.decorator";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { PlatformAuthGuard } from "./guards/platform-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { ApplicationRecord, ApplicationsService, ApproveResult } from "./applications.service";
import { PlatformPrincipal } from "./types/platform-request";
import { assertUuidParam } from "./uuid-param";

@Controller("platform/applications")
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class ApplicationsController {
  constructor(@Inject(ApplicationsService) private readonly applications: ApplicationsService) {}

  @Get()
  @PlatformRoles("super_admin", "support")
  async list(@Query() query: Record<string, unknown>): Promise<{ applications: ApplicationRecord[] }> {
    return { applications: await this.applications.list(parseApplicationsQuery(query)) };
  }

  @Post(":id/approve")
  @PlatformRoles("super_admin")
  async approve(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<ApproveResult> {
    assertUuidParam(id);
    const result = validateApproveApplication(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return this.applications.approve(actor.sub, id, result.data, ip);
  }

  @Post(":id/reject")
  @PlatformRoles("super_admin")
  async reject(
    @CurrentPlatformUser() actor: PlatformPrincipal,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ application: ApplicationRecord }> {
    assertUuidParam(id);
    const result = validateReason(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { application: await this.applications.reject(actor.sub, id, result.data.reason, ip) };
  }
}
