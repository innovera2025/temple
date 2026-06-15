// A fetch wrapper that transparently recovers from an expired ACCESS token.
//
// Access tokens are short-lived (15 min); the refresh token lives 30 days. On a
// 401 this retries the request once after silently calling POST /auth/refresh,
// so the user keeps working instead of seeing a broken page. Only when the
// refresh itself fails (refresh token expired/revoked, or the account was
// disabled) does it surface the 401 and trigger logout.
//
// CRITICAL: the backend rotates refresh tokens and revokes the whole family on
// reuse. A page that fires several requests at once (e.g. the ledger) can get
// several simultaneous 401s; they MUST share a single refresh call, or the
// concurrent replays of the same refresh token would trip reuse-detection and
// revoke everything. `refreshInFlight` dedupes that.

export interface AuthedFetchDeps {
  baseUrl: string;
  /** Current refresh token (read live), or null if there is no session. */
  getRefreshToken: () => string | null;
  /** Persist the rotated tokens after a successful refresh. */
  onTokens: (tokens: { accessToken: string; refreshToken?: string }) => void;
  /** Called when refresh fails — the session is unrecoverable (log out). */
  onSessionExpired: () => void;
  /** Refresh endpoint path for this plane (default the staff plane). */
  refreshPath?: string;
  /** Injectable for tests; never set to the wrapper itself (would recurse). */
  fetchFn?: typeof fetch;
}

export function createAuthedFetch(deps: AuthedFetchDeps): typeof fetch {
  const doFetch = deps.fetchFn ?? fetch;
  const refreshPath = deps.refreshPath ?? "/auth/refresh";
  let refreshInFlight: Promise<string | null> | null = null;
  // Concurrent 401s share one refresh; when that refresh FAILS they must log out
  // exactly once for that burst. We track the specific failed-refresh promise we
  // already handled rather than a permanent flag — the wrapper outlives logout
  // (it is memo'd once in app.tsx), so a permanent latch would silently swallow
  // a SECOND genuine expiry after the user re-logs-in. A new burst = a new
  // promise = a fresh logout.
  let loggedOutFor: Promise<string | null> | null = null;

  async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = deps.getRefreshToken();
    if (!refreshToken) return null;
    let response: Response;
    try {
      response = await doFetch(`${deps.baseUrl}${refreshPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      return null; // network error — treat as not-refreshable for this attempt
    }
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as
      | { accessToken?: string; refreshToken?: string }
      | null;
    if (!body?.accessToken) return null;
    deps.onTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken });
    return body.accessToken;
  }

  const authedFetch: typeof fetch = async (input, init) => {
    const response = await doFetch(input, init);
    if (response.status !== 401) return response;

    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
    }
    const refresh = refreshInFlight;
    const newAccessToken = await refresh;

    if (!newAccessToken) {
      // First waiter of THIS failed burst logs out; the rest skip. A later burst
      // (new promise) can log out again, so re-login + re-expiry still works.
      if (loggedOutFor !== refresh) {
        loggedOutFor = refresh;
        deps.onSessionExpired();
      }
      return response; // original 401 — the caller still errors; app routes to login
    }

    // Retry ONCE with the fresh token (raw fetch -> never re-enters this wrapper).
    const retryInit: RequestInit = { ...(init ?? {}) };
    const headers = new Headers(retryInit.headers as HeadersInit | undefined);
    headers.set("authorization", `Bearer ${newAccessToken}`);
    retryInit.headers = headers;
    return doFetch(input, retryInit);
  };

  return authedFetch;
}
