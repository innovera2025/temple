// Account recovery client — forgot/reset password (staff + devotee planes)
// and devotee email verification. Endpoints answer generically (no account
// enumeration), so the UI shows the same message either way.

export type RecoveryPlane = "staff" | "devotee";

export interface RecoveryApiOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

function planePrefix(plane: RecoveryPlane): string {
  return plane === "devotee" ? "/devotee/auth" : "/auth";
}

async function post(
  options: RecoveryApiOptions,
  path: string,
  payload: Record<string, string>,
): Promise<void> {
  const doFetch = options.fetchFn ?? fetch;
  const response = await doFetch(`${options.baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(body?.error?.message ?? `ดำเนินการไม่สำเร็จ (${response.status})`);
  }
}

export function requestPasswordReset(
  options: RecoveryApiOptions,
  plane: RecoveryPlane,
  email: string,
): Promise<void> {
  return post(options, `${planePrefix(plane)}/forgot-password`, { email: email.trim() });
}

export function resetPassword(
  options: RecoveryApiOptions,
  plane: RecoveryPlane,
  token: string,
  newPassword: string,
): Promise<void> {
  return post(options, `${planePrefix(plane)}/reset-password`, { token, newPassword });
}

export function verifyDevoteeEmail(options: RecoveryApiOptions, token: string): Promise<void> {
  return post(options, "/devotee/auth/verify-email", { token });
}

/** Parse `token` (and optional plane segment) out of the current hash route. */
export function parseRecoveryHash(hash: string): { plane: RecoveryPlane; token: string } {
  const cleaned = hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = cleaned.split("?");
  const plane: RecoveryPlane = (pathPart ?? "").includes("/devotee") ? "devotee" : "staff";
  const token = new URLSearchParams(queryPart ?? "").get("token") ?? "";
  return { plane, token };
}
