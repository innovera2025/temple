import { ArgumentsHost, ExecutionContext, HttpException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { RateLimitOptions } from "../src/common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../src/common/guards/rate-limit.guard";

class DemoController {}
function demoHandler(): void {
  /* marker handler used for the rate-limit key */
}

function reflectorReturning(options: RateLimitOptions | undefined): Reflector {
  return { getAllAndOverride: () => options } as unknown as Reflector;
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
  it("allows up to the limit then rejects with 429 within the window", () => {
    const guard = new RateLimitGuard(reflectorReturning({ limit: 3, windowMs: 60_000 }));
    const ctx = ctxFor({ sub: "user-a" });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    try {
      guard.canActivate(ctx);
      throw new Error("expected 429");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({ error: { code: "TOO_MANY_REQUESTS" } });
    }
  });

  it("counts each principal (user / IP) independently", () => {
    const guard = new RateLimitGuard(reflectorReturning({ limit: 1, windowMs: 60_000 }));
    expect(guard.canActivate(ctxFor({ sub: "user-a" }))).toBe(true);
    // a different user has its own window
    expect(guard.canActivate(ctxFor({ sub: "user-b" }))).toBe(true);
    // a pre-auth caller keyed by IP, also independent
    expect(guard.canActivate(ctxFor({ ip: "10.0.0.1" }))).toBe(true);
    // user-a is now over its limit
    expect(() => guard.canActivate(ctxFor({ sub: "user-a" }))).toThrow();
  });

  it("resets the window after windowMs elapses", () => {
    vi.useFakeTimers();
    try {
      const guard = new RateLimitGuard(reflectorReturning({ limit: 1, windowMs: 60_000 }));
      const ctx = ctxFor({ sub: "user-reset" });
      expect(guard.canActivate(ctx)).toBe(true);
      expect(() => guard.canActivate(ctx)).toThrow(); // over the limit within the window
      vi.advanceTimersByTime(60_001);
      expect(guard.canActivate(ctx)).toBe(true); // window has reset
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a no-op when no @RateLimit metadata is present", () => {
    const guard = new RateLimitGuard(reflectorReturning(undefined));
    const ctx = ctxFor({ sub: "user-a" });
    for (let i = 0; i < 50; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });
});
