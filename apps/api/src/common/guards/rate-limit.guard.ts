import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY, RateLimitOptions } from "../decorators/rate-limit.decorator";
import { tooManyRequests } from "../errors/project-error";
import { RATE_LIMIT_STORE, RateLimitStore } from "../rate-limit/rate-limit-store";

interface RateLimitedRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: { sub?: string };
  // The devotee plane sets its principal on request.devotee (not request.user),
  // so include it here to key per-devotee-account rather than per-IP.
  devotee?: { sub?: string };
}

// A guard with no @RateLimit metadata is a no-op. Keys are namespaced per handler
// and per principal (authenticated user id, else client IP), so the same window
// applies to "this endpoint, this caller". The counter lives in the injected
// RateLimitStore — in-memory by default, Redis when configured (shared across
// instances). See RateLimitModule.
//
// NOTE (IP keying): pre-auth routes key on request.ip. Express defaults `trust
// proxy` to false, so request.ip is the direct socket peer and CANNOT be spoofed
// via X-Forwarded-For. Behind a real reverse proxy, set TRUST_PROXY to a SPECIFIC
// hop count (never the bare `true`) so request.ip stays the true client address.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const principal =
      request.user?.sub ??
      request.devotee?.sub ??
      request.ip ??
      request.socket?.remoteAddress ??
      "anonymous";
    const key = `${context.getClass().name}.${(context.getHandler() as { name?: string }).name ?? "h"}:${principal}`;

    const count = await this.store.hit(key, options.windowMs);
    if (count > options.limit) {
      throw tooManyRequests("คำขอบ่อยเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง");
    }
    return true;
  }
}
