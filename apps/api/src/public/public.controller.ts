import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import {
  isUuid,
  type PublicEventSummary,
  type PublicTempleProfile,
  type PublicTempleSummary,
} from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { assertUuidParam } from "../platform/uuid-param";
import { PublicService } from "./public.service";

/**
 * The PUBLIC, UNAUTHENTICATED surface (open to the internet): a temple directory and
 * an upcoming public-events feed. Mounts ONLY RateLimitGuard (per-IP) — no AuthGuard,
 * no tenant context. Every response is public-safe by construction (see PublicService).
 */
@Controller("public")
@UseGuards(RateLimitGuard)
@RateLimit({ limit: 120, windowMs: 60_000 })
export class PublicController {
  constructor(@Inject(PublicService) private readonly publicSvc: PublicService) {}

  @Get("temples")
  async temples(): Promise<{ temples: PublicTempleSummary[] }> {
    return { temples: await this.publicSvc.listTemples() };
  }

  @Get("temples/:id")
  async temple(@Param("id") id: string): Promise<{ temple: PublicTempleProfile }> {
    return { temple: await this.publicSvc.getTemple(assertUuidParam(id)) };
  }

  @Get("events")
  async events(@Query("templeId") templeId?: string): Promise<{ events: PublicEventSummary[] }> {
    // A malformed templeId is ignored (returns all) rather than 422 — a lenient
    // public read; it can only narrow results, never widen them.
    const filterId = typeof templeId === "string" && isUuid(templeId) ? templeId : undefined;
    return { events: await this.publicSvc.listUpcomingEvents(filterId) };
  }
}
