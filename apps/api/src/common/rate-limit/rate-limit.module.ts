import { Global, Logger, Module } from "@nestjs/common";
import { InMemoryRateLimitStore } from "./in-memory-rate-limit.store";
import { RATE_LIMIT_STORE, RateLimitStore } from "./rate-limit-store";
import { RedisRateLimitStore } from "./redis-rate-limit.store";

function resolveRedisUrl(): string | null {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  if (process.env.REDIS_HOST) {
    return `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT ?? "6379"}`;
  }
  return null;
}

/**
 * Global provider for the rate-limit counter store. Uses Redis when a Redis URL/host
 * is configured (so limits hold across instances) and falls back to the per-process
 * in-memory store otherwise — and always in NODE_ENV=test (no external dependency in
 * unit tests). Marked @Global so every RateLimitGuard (provided per-module) shares
 * this single store instance.
 */
@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      useFactory: (): RateLimitStore => {
        const url = resolveRedisUrl();
        if (url && process.env.NODE_ENV !== "test") {
          new Logger("RateLimitModule").log(`Rate limiting backed by Redis at ${url}`);
          return new RedisRateLimitStore(url);
        }
        return new InMemoryRateLimitStore();
      },
    },
  ],
  exports: [RATE_LIMIT_STORE],
})
export class RateLimitModule {}
