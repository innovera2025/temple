/**
 * Receipts feature — framework-free logic shared by the UI and tests (Task 6).
 * Status labels and validation come from `@wat/shared`; baht formatting reuses
 * the shared `formatSatang`.
 */

import {
  formatSatang,
  RECEIPT_STATUS_LABELS_TH,
  RECEIPT_STATUSES,
  validateReissueReceipt,
  validateVoidReceipt,
  type ReceiptPreview,
  type ReceiptStatus,
  type ReceiptView,
  type ValidationResult,
} from "@wat/shared";

export type { ReceiptPreview, ReceiptView };

export interface StatusOption {
  value: ReceiptStatus;
  label: string;
}

export const RECEIPT_STATUS_OPTIONS: StatusOption[] = RECEIPT_STATUSES.map((value) => ({
  value,
  label: RECEIPT_STATUS_LABELS_TH[value],
}));

export function receiptStatusLabel(status: string): string {
  return RECEIPT_STATUS_LABELS_TH[status as ReceiptStatus] ?? status;
}

/** Format integer satang (string/number) as Thai baht, e.g. "฿500.00". */
export function displayBaht(amountSatang: string | number | bigint): string {
  const satang = typeof amountSatang === "string" ? Number(amountSatang) : amountSatang;
  return `฿${formatSatang(satang)}`;
}

export function validateVoidReason(reason: string): ValidationResult<{ reason: string }> {
  return validateVoidReceipt({ reason });
}

export function validateReissueReason(reason: string): ValidationResult<{ reason: string }> {
  return validateReissueReceipt({ reason });
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export interface ReceiptsApi {
  list(query?: { donationId?: string; status?: ReceiptStatus }): Promise<ReceiptView[]>;
  issue(donationId: string): Promise<ReceiptView>;
  void(id: string, reason: string): Promise<ReceiptView>;
  reissue(id: string, reason: string): Promise<{ superseded: ReceiptView; receipt: ReceiptView }>;
  preview(id: string): Promise<ReceiptPreview>;
}

export interface ReceiptsApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function buildReceiptQuery(query: { donationId?: string; status?: ReceiptStatus } = {}): string {
  const params = new URLSearchParams();
  if (query.donationId) params.set("donationId", query.donationId);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function createReceiptsApiClient(options: ReceiptsApiClientOptions): ReceiptsApi {
  const doFetch = options.fetchFn ?? fetch;

  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  };

  const handle = async <T>(response: Response, pick: (body: Record<string, unknown>) => T): Promise<T> => {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
    if (!response.ok) {
      throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    }
    return pick(body);
  };

  return {
    async list(query) {
      const response = await doFetch(`${options.baseUrl}/receipts${buildReceiptQuery(query)}`, {
        headers: headers(),
      });
      return handle(response, (body) => (body.receipts as ReceiptView[]) ?? []);
    },
    async issue(donationId) {
      const response = await doFetch(`${options.baseUrl}/receipts`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ donationId }),
      });
      return handle(response, (body) => body.receipt as ReceiptView);
    },
    async void(id, reason) {
      const response = await doFetch(`${options.baseUrl}/receipts/${id}/void`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ reason }),
      });
      return handle(response, (body) => body.receipt as ReceiptView);
    },
    async reissue(id, reason) {
      const response = await doFetch(`${options.baseUrl}/receipts/${id}/reissue`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ reason }),
      });
      return handle(response, (body) => ({
        superseded: body.superseded as ReceiptView,
        receipt: body.receipt as ReceiptView,
      }));
    },
    async preview(id) {
      const response = await doFetch(`${options.baseUrl}/receipts/${id}/preview`, {
        headers: headers(),
      });
      return handle(response, (body) => body.preview as ReceiptPreview);
    },
  };
}
