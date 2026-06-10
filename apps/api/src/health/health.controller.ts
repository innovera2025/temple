import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

/**
 * /health/live — process is up (no dependencies). Container liveness probe.
 * /health       — process AND database are reachable. Readiness / compose
 *                 healthcheck: a green API that cannot reach Postgres serves
 *                 nothing but errors, so it must report unhealthy.
 */
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get()
  async check(): Promise<{ status: "ok"; db: "ok" }> {
    try {
      await Promise.race([
        this.prisma.client.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("db health timeout")), 2_000)),
      ]);
    } catch {
      throw new ServiceUnavailableException({ status: "degraded", db: "unreachable" });
    }
    return { status: "ok", db: "ok" };
  }
}
