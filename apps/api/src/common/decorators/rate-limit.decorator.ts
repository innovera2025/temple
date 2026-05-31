import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "wat:rate-limit";

export interface RateLimitOptions {
  /** Max requests allowed within the window, per key (user id, else client IP). */
  limit: number;
  windowMs: number;
}

export function RateLimit(options: RateLimitOptions): ReturnType<typeof SetMetadata> {
  return SetMetadata(RATE_LIMIT_KEY, options);
}
