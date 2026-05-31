/**
 * Reports feature — framework-free logic shared by the UI and tests (Task 10).
 * The API returns a built report (columns + rows + ready-to-download CSV); the
 * client only renders the preview and triggers the CSV download.
 */

import { REPORT_TYPE_LABELS_TH, REPORT_TYPES, type ReportType, type ReportView } from "@wat/shared";

export type { ReportType, ReportView } from "@wat/shared";

export interface ReportTypeOption {
  value: ReportType;
  label: string;
}

export const REPORT_TYPE_OPTIONS: ReportTypeOption[] = REPORT_TYPES.map((value) => ({
  value,
  label: REPORT_TYPE_LABELS_TH[value],
}));

export function reportTypeLabel(type: ReportType): string {
  return REPORT_TYPE_LABELS_TH[type];
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export function buildReportQuery(filters: ReportFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Default download filename for a report, e.g. "report-donations-2026-05-31.csv". */
export function reportFilename(type: ReportType, today: string): string {
  return `report-${type}-${today}.csv`;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export interface ReportsApi {
  get(type: ReportType, filters?: ReportFilters): Promise<ReportView>;
}

export interface ReportsApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createReportsApiClient(options: ReportsApiClientOptions): ReportsApi {
  const doFetch = options.fetchFn ?? fetch;

  return {
    async get(type, filters = {}) {
      const token = options.getToken();
      const response = await doFetch(`${options.baseUrl}/reports/${type}${buildReportQuery(filters)}`, {
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
      }
      return body.report as ReportView;
    },
  };
}

/**
 * Trigger a browser CSV download. Prepends a UTF-8 BOM so Excel reads Thai text
 * correctly. No-op outside a browser (e.g. SSR/tests without a DOM).
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }
  // U+FEFF byte-order mark via fromCharCode (avoids an irregular-whitespace literal)
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
