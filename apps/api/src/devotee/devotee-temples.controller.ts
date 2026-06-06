import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { type PublicTempleProfile, type PublicTempleSummary } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { DevoteeGuard } from "./guards/devotee.guard";
import { DevoteeTemplesService } from "./devotee-temples.service";
import { assertUuidParam } from "../platform/uuid-param";

/**
 * Read-only directory of ACTIVE temples for an authenticated devotee. Mounts
 * ONLY the DevoteeGuard — never AuthGuard/TenantGuard/RolesGuard — so it is
 * unreachable with a tenant/platform token, and it exposes ONLY devotee-safe
 * columns (see DevoteeTemplesService).
 */
@Controller("devotee/temples")
@UseGuards(DevoteeGuard, RateLimitGuard)
@RateLimit({ limit: 120, windowMs: 60_000 })
export class DevoteeTemplesController {
  constructor(@Inject(DevoteeTemplesService) private readonly temples: DevoteeTemplesService) {}

  @Get()
  async list(): Promise<{ temples: PublicTempleSummary[] }> {
    return { temples: await this.temples.list() };
  }

  @Get(":id")
  async getById(@Param("id") id: string): Promise<{ temple: PublicTempleProfile }> {
    return { temple: await this.temples.getById(assertUuidParam(id)) };
  }
}
