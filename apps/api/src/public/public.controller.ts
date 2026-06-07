import { Controller, Get, Header, Inject, Param, Query, UseGuards } from "@nestjs/common";
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
// Anti-scraping: per-IP cap on this unauthenticated surface. Tighter than the
// authenticated planes; still ample for a human browsing the directory.
@RateLimit({ limit: 60, windowMs: 60_000 })
export class PublicController {
  constructor(@Inject(PublicService) private readonly publicSvc: PublicService) {}

  // Short shared cache: cuts repeated-scrape / refresh load and is correct for
  // public data that changes slowly. (No per-user data here, so a shared cache is safe.)
  @Get("temples")
  @Header("Cache-Control", "public, max-age=60")
  async temples(): Promise<{ temples: PublicTempleSummary[] }> {
    return { temples: await this.publicSvc.listTemples() };
  }

  @Get("temples/:id")
  @Header("Cache-Control", "public, max-age=60")
  async temple(@Param("id") id: string): Promise<{ temple: PublicTempleProfile }> {
    return { temple: await this.publicSvc.getTemple(assertUuidParam(id)) };
  }

  @Get("events")
  @Header("Cache-Control", "public, max-age=60")
  async events(@Query("templeId") templeId?: string): Promise<{ events: PublicEventSummary[] }> {
    // A malformed templeId is ignored (returns all) rather than 422 — a lenient
    // public read; it can only narrow results, never widen them.
    const filterId = typeof templeId === "string" && isUuid(templeId) ? templeId : undefined;
    return { events: await this.publicSvc.listUpcomingEvents(filterId) };
  }
}
