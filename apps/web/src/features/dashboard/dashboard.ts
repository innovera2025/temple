/**
 * Finance dashboard feature — framework-free logic shared by the UI and tests
 * (Task 9). Labels/formatting come from `@wat/shared`. The dashboard is
 * role-aware: `financial`/`recentDonations` are null/empty for restricted roles.
 */

import {
  DASHBOARD_CARD_LABELS_TH,
  DONATION_METHOD_LABELS_TH,
  DONATION_STATUS_LABELS_TH,
  formatSatang,
  type DashboardView,
  type DonationMethod,
  type DonationStatus,
} from "@wat/shared";

export type { DashboardView } from "@wat/shared";
export { DASHBOARD_CARD_LABELS_TH };

/** Format integer satang (string/number/bigint) as Thai baht, e.g. "฿1,000.50". */
export function displayBaht(amountSatang: string | number | bigint): string {
  return `฿${formatSatang(amountSatang)}`;
}

export function methodLabel(method: string): string {
  return DONATION_METHOD_LABELS_TH[method as DonationMethod] ?? method;
}

export function statusLabel(status: string): string {
  return DONATION_STATUS_LABELS_TH[status as DonationStatus] ?? status;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export interface DashboardApi {
  get(): Promise<DashboardView>;
}

export interface DashboardApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createDashboardApiClient(options: DashboardApiClientOptions): DashboardApi {
  const doFetch = options.fetchFn ?? fetch;

  return {
    async get() {
      const token = options.getToken();
      const response = await doFetch(`${options.baseUrl}/dashboard`, {
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
      }
      return body.dashboard as DashboardView;
    },
  };
}
