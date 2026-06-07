import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { createClient } from "redis";
import { RateLimitStore } from "./rate-limit-store";

type RedisClient = ReturnType<typeof createClient>;

/**
 * Redis-backed fixed-window counter so a rate limit holds across ALL API instances
 * (the in-memory store only protects a single process). Algorithm: INCR the window
 * key, and on the first hit PEXPIRE it to windowMs. Fails OPEN — if Redis is
 * unreachable, requests are allowed (the limiter degrades, the API keeps serving)
 * and the error is logged, never thrown to the caller.
 */
@Injectable()
export class RedisRateLimitStore implements RateLimitStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly client: RedisClient;
  private errorLogged = false;

  constructor(url: string) {
    this.client = createClient({
      url,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) },
    });
    // A connection error must not crash the process (node-redis emits 'error').
    this.client.on("error", (err) => {
      if (!this.errorLogged) {
        this.logger.warn(`Redis rate-limit store error (limiting degrades open): ${String(err)}`);
        this.errorLogged = true;
      }
    });
    this.client.on("ready", () => {
      this.errorLogged = false;
    });
    // Connect in the background; commands before readiness fail open via isReady.
    void this.client.connect().catch((err) => {
      this.logger.warn(`Redis connect failed (rate limiting degrades open): ${String(err)}`);
    });
  }

  async hit(key: string, windowMs: number): Promise<number> {
    if (!this.client.isReady) {
      return 0; // fail open while disconnected
    }
    try {
      const redisKey = `rl:${key}`;
      const count = await this.client.incr(redisKey);
      if (count === 1) {
        await this.client.pExpire(redisKey, windowMs);
      }
      return count;
    } catch (err) {
      this.logger.warn(`Redis rate-limit hit failed (allowing request): ${String(err)}`);
      return 0; // fail open on error
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client.isOpen) {
        await this.client.quit();
        return;
      }
    } catch {
      /* fall through to a forced close */
    }
    // Never-connected / failed client: force-close so no reconnect timer lingers.
    try {
      await this.client.disconnect();
    } catch {
      /* already closed — ignore */
    }
  }
}
