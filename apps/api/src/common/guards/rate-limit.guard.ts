import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY, RateLimitOptions } from "../decorators/rate-limit.decorator";
import { tooManyRequests } from "../errors/project-error";

interface RateLimitedRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: { sub?: string };
  // The devotee plane sets its principal on request.devotee (not request.user),
  // so include it here to key per-devotee-account rather than per-IP.
  devotee?: { sub?: string };
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

// A guard with no @RateLimit metadata is a no-op. Keys are namespaced per handler
// and per principal (authenticated user id, else client IP), so the same window
// applies to "this endpoint, this caller".
//
// NOTE (in-memory): the counter is per-process — protection is per-instance and
// resets on restart. A distributed store (Redis) would be needed for multi-instance
// deployments; this is a deliberate dependency-light MVP choice.
//
// NOTE (IP keying): pre-auth routes key on request.ip. Express defaults `trust
// proxy` to false, so request.ip is the direct socket peer and CANNOT be spoofed
// via X-Forwarded-For. Behind a real reverse proxy, set `trust proxy` to a SPECIFIC
// hop count / trusted subnet (never the bare `true`) so request.ip stays the true,
// non-attacker-controllable client address.
const MAX_TRACKED_KEYS = 50_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, WindowEntry>();

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    const now = Date.now();
    // Bound memory by pruning only EXPIRED windows (never wipe active counters).
    if (this.windows.size > MAX_TRACKED_KEYS) {
      for (const [k, v] of this.windows) {
        if (v.resetAt <= now) {
          this.windows.delete(k);
        }
      }
    }

    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }
    if (entry.count >= options.limit) {
      throw tooManyRequests("คำขอบ่อยเกินไป กรุณาลองใหม่อีกครั้งในภายหลัง");
    }
    entry.count += 1;
    return true;
  }
}
