/** DI token for the rate-limit counter store (in-memory or Redis-backed). */
export const RATE_LIMIT_STORE = Symbol("RATE_LIMIT_STORE");

export interface RateLimitStore {
  /**
   * Register one hit against `key` in a fixed window of `windowMs`, returning the
   * running count within the current window (the first hit returns 1 and starts the
   * window). The guard rejects when the returned count exceeds the configured limit.
   * Implementations MUST fail OPEN (return 0 = "allowed") if the backing store is
   * unavailable — a rate limiter must never take the whole API down.
   */
  hit(key: string, windowMs: number): Promise<number>;
}
