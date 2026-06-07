import { Injectable } from "@nestjs/common";
import { RateLimitStore } from "./rate-limit-store";

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * Per-process fixed-window counter. The dependency-light default (and the store used
 * in dev/test). Protection is per-instance and resets on restart; use the Redis store
 * for multi-instance deployments. Memory is bounded by pruning expired windows.
 */
@Injectable()
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, WindowEntry>();
  private static readonly MAX_TRACKED_KEYS = 50_000;

  hit(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    if (this.windows.size > InMemoryRateLimitStore.MAX_TRACKED_KEYS) {
      for (const [k, v] of this.windows) {
        if (v.resetAt <= now) {
          this.windows.delete(k);
        }
      }
    }
    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return Promise.resolve(1);
    }
    entry.count += 1;
    return Promise.resolve(entry.count);
  }
}
