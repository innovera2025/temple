import { ArgumentsHost, ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { RateLimitOptions } from "../src/common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../src/common/guards/rate-limit.guard";
import { InMemoryRateLimitStore } from "../src/common/rate-limit/in-memory-rate-limit.store";

class DemoController {}
function demoHandler(): void {
  /* marker handler used for the rate-limit key */
}

function reflectorReturning(options: RateLimitOptions | undefined): Reflector {
  return { getAllAndOverride: () => options } as unknown as Reflector;
}

function makeGuard(options: RateLimitOptions | undefined): RateLimitGuard {
  return new RateLimitGuard(reflectorReturning(options), new InMemoryRateLimitStore());
}

function ctxFor(principal: { sub?: string; ip?: string }): ExecutionContext {
  const request = { user: principal.sub ? { sub: principal.sub } : undefined, ip: principal.ip };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => demoHandler,
    getClass: () => DemoController,
  } as unknown as ExecutionContext & ArgumentsHost;
}

describe("RateLimitGuard", () => {
  it("allows up to the limit then rejects with 429 within the window", async () => {
    const guard = makeGuard({ limit: 3, windowMs: 60_000 });
    const ctx = ctxFor({ sub: "user-a" });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(await guard.canActivate(ctx)).toBe(true);
    try {
      await guard.canActivate(ctx);
      throw new Error("expected 429");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({ error: { code: "TOO_MANY_REQUESTS" } });
    }
  });

  it("counts each principal (user / IP) independently", async () => {
    const guard = makeGuard({ limit: 1, windowMs: 60_000 });
    expect(await guard.canActivate(ctxFor({ sub: "user-a" }))).toBe(true);
    // a different user has its own window
    expect(await guard.canActivate(ctxFor({ sub: "user-b" }))).toBe(true);
    // a pre-auth caller keyed by IP, also independent
    expect(await guard.canActivate(ctxFor({ ip: "10.0.0.1" }))).toBe(true);
    // user-a is now over its limit
    await expect(guard.canActivate(ctxFor({ sub: "user-a" }))).rejects.toThrow();
  });

  it("resets the window after windowMs elapses", async () => {
    vi.useFakeTimers();
    try {
      const guard = makeGuard({ limit: 1, windowMs: 60_000 });
      const ctx = ctxFor({ sub: "user-reset" });
      expect(await guard.canActivate(ctx)).toBe(true);
      await expect(guard.canActivate(ctx)).rejects.toThrow(); // over the limit within the window
      vi.advanceTimersByTime(60_001);
      expect(await guard.canActivate(ctx)).toBe(true); // window has reset
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a no-op when no @RateLimit metadata is present", async () => {
    const guard = makeGuard(undefined);
    const ctx = ctxFor({ sub: "user-a" });
    for (let i = 0; i < 50; i++) {
      expect(await guard.canActivate(ctx)).toBe(true);
    }
  });

  it("shares one store across guard instances (the cross-instance fix)", async () => {
    // Two guards backed by the SAME store = the same counter (as in production,
    // where every per-module guard injects the one @Global store).
    const store = new InMemoryRateLimitStore();
    const g1 = new RateLimitGuard(reflectorReturning({ limit: 2, windowMs: 60_000 }), store);
    const g2 = new RateLimitGuard(reflectorReturning({ limit: 2, windowMs: 60_000 }), store);
    const ctx = ctxFor({ sub: "shared" });
    expect(await g1.canActivate(ctx)).toBe(true); // count 1
    expect(await g2.canActivate(ctx)).toBe(true); // count 2 (shared)
    await expect(g1.canActivate(ctx)).rejects.toThrow(); // count 3 > limit
  });
});
