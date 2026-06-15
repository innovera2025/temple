import { describe, expect, it, vi } from "vitest";
import { createAuthedFetch } from "./authed-fetch";

function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

interface Deps {
  getRefreshToken?: () => string | null;
  onTokens?: ReturnType<typeof vi.fn>;
  onSessionExpired?: ReturnType<typeof vi.fn>;
}

function setup(fetchImpl: typeof fetch, deps: Deps = {}) {
  const onTokens = deps.onTokens ?? vi.fn();
  const onSessionExpired = deps.onSessionExpired ?? vi.fn();
  const authedFetch = createAuthedFetch({
    baseUrl: "http://api.test",
    getRefreshToken: deps.getRefreshToken ?? (() => "refresh-tok"),
    onTokens,
    onSessionExpired,
    fetchFn: fetchImpl,
  });
  return { authedFetch, onTokens, onSessionExpired };
}

describe("createAuthedFetch", () => {
  it("passes a non-401 response straight through (no refresh)", async () => {
    const fetchImpl = vi.fn(async () => res(200, { ok: true })) as unknown as typeof fetch;
    const { authedFetch, onTokens } = setup(fetchImpl);
    const r = await authedFetch("http://api.test/dashboard");
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onTokens).not.toHaveBeenCalled();
  });

  it("on 401 refreshes once, retries with the new bearer token, and returns the retried response", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization");
      calls.push({ url, auth });
      if (url.endsWith("/auth/refresh")) return res(200, { accessToken: "new-access", refreshToken: "new-refresh" });
      // first hit (old token) 401s; the retry (new token) succeeds
      return auth === "Bearer new-access" ? res(200, { entries: [] }) : res(401, { error: { message: "Expired token" } });
    }) as unknown as typeof fetch;

    const { authedFetch, onTokens, onSessionExpired } = setup(fetchImpl);
    const r = await authedFetch("http://api.test/ledger/entries", {
      headers: { authorization: "Bearer old-access" },
    });

    expect(r.status).toBe(200);
    expect(onTokens).toHaveBeenCalledWith({ accessToken: "new-access", refreshToken: "new-refresh" });
    expect(onSessionExpired).not.toHaveBeenCalled();
    // request -> refresh -> retry
    expect(calls.map((c) => c.url)).toEqual([
      "http://api.test/ledger/entries",
      "http://api.test/auth/refresh",
      "http://api.test/ledger/entries",
    ]);
    expect(calls[2]?.auth).toBe("Bearer new-access");
  });

  it("logs out (onSessionExpired) and surfaces the 401 when the refresh fails", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return res(401, { error: { message: "Invalid refresh token" } });
      return res(401, { error: { message: "Expired token" } });
    }) as unknown as typeof fetch;

    const { authedFetch, onTokens, onSessionExpired } = setup(fetchImpl);
    const r = await authedFetch("http://api.test/ledger/entries", {
      headers: { authorization: "Bearer old-access" },
    });

    expect(r.status).toBe(401); // original 401 surfaced -> caller errors, app routes to login
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(onTokens).not.toHaveBeenCalled();
  });

  it("does NOT refresh when there is no refresh token (just logs out)", async () => {
    const fetchImpl = vi.fn(async () => res(401, { error: { message: "Expired token" } })) as unknown as typeof fetch;
    const { authedFetch, onSessionExpired } = setup(fetchImpl, { getRefreshToken: () => null });
    const r = await authedFetch("http://api.test/dashboard");
    expect(r.status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    // only the original request — no /auth/refresh attempt
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent 401s into a SINGLE refresh (avoids tripping reuse-detection)", async () => {
    let refreshCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        // slow refresh so all three 401s overlap on the same in-flight promise
        await new Promise((resolve) => setTimeout(resolve, 10));
        return res(200, { accessToken: "new-access", refreshToken: "new-refresh" });
      }
      const auth = new Headers(init?.headers).get("authorization");
      return auth === "Bearer new-access" ? res(200, { ok: true }) : res(401, { error: { message: "Expired token" } });
    }) as unknown as typeof fetch;

    const { authedFetch } = setup(fetchImpl);
    const reqs = ["/ledger/summary", "/ledger/accounts", "/ledger/entries"].map((p) =>
      authedFetch(`http://api.test${p}`, { headers: { authorization: "Bearer old-access" } }),
    );
    const results = await Promise.all(reqs);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1); // exactly one refresh for all three concurrent 401s
  });

  it("calls onSessionExpired ONCE when several concurrent 401s share a failing refresh", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        await new Promise((resolve) => setTimeout(resolve, 10)); // overlap the 401s
        return res(401, { error: { message: "Invalid refresh token" } });
      }
      return res(401, { error: { message: "Expired token" } });
    }) as unknown as typeof fetch;

    const { authedFetch, onSessionExpired } = setup(fetchImpl);
    const reqs = ["/ledger/summary", "/ledger/accounts", "/ledger/entries"].map((p) =>
      authedFetch(`http://api.test${p}`, { headers: { authorization: "Bearer old-access" } }),
    );
    const results = await Promise.all(reqs);

    expect(results.every((r) => r.status === 401)).toBe(true);
    expect(onSessionExpired).toHaveBeenCalledTimes(1); // one logout, not three
  });

  it("logs out AGAIN on a later expiry after re-login (the dedup is per-burst, not permanent)", async () => {
    // The wrapper is memo'd once in app.tsx and outlives logout/re-login, so a
    // permanent latch would swallow the second genuine expiry. Two SEPARATE
    // failed-refresh bursts must each fire onSessionExpired.
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return res(401, { error: { message: "Invalid refresh token" } });
      return res(401, { error: { message: "Expired token" } });
    }) as unknown as typeof fetch;

    const { authedFetch, onSessionExpired } = setup(fetchImpl);
    const first = await authedFetch("http://api.test/dashboard", { headers: { authorization: "Bearer old-1" } });
    expect(first.status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);

    // ...user logs back in (new session), then the new session expires too:
    const second = await authedFetch("http://api.test/dashboard", { headers: { authorization: "Bearer old-2" } });
    expect(second.status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledTimes(2); // not suppressed by a stale latch
  });
});
