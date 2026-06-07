import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryRateLimitStore } from "../src/common/rate-limit/in-memory-rate-limit.store";
import { RedisRateLimitStore } from "../src/common/rate-limit/redis-rate-limit.store";

describe("InMemoryRateLimitStore", () => {
  it("increments per key within a window and isolates different keys", async () => {
    const store = new InMemoryRateLimitStore();
    expect(await store.hit("a", 60_000)).toBe(1);
    expect(await store.hit("a", 60_000)).toBe(2);
    expect(await store.hit("b", 60_000)).toBe(1);
  });
});

describe("RedisRateLimitStore", () => {
  it("fails OPEN (returns 0 = allowed) when Redis is unreachable", async () => {
    const store = new RedisRateLimitStore("redis://127.0.0.1:1"); // nothing listens here
    expect(await store.hit(`k-${randomUUID()}`, 60_000)).toBe(0);
    await store.onModuleDestroy();
  });

  it("counts a shared window when Redis is available (fail-open if not)", async () => {
    const store = new RedisRateLimitStore(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
    await new Promise((resolve) => setTimeout(resolve, 600)); // allow connect
    const key = `test-${randomUUID()}`;
    const first = await store.hit(key, 60_000);
    if (first === 0) {
      // Redis not available in this environment — exercises the fail-open path.
      expect(await store.hit(key, 60_000)).toBe(0);
    } else {
      // Real Redis — the counter increments across calls (i.e. across instances).
      expect(first).toBe(1);
      expect(await store.hit(key, 60_000)).toBe(2);
    }
    await store.onModuleDestroy();
  });
});
