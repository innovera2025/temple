/**
 * Reports / export validation + helpers (Task 10). Dependency-free, shared by
 * the NestJS API (report building + CSV) and the React web app (preview/download).
 * Money is rendered as a plain baht decimal (no grouping) so it is CSV-safe and
 * BigInt-precise.
 */

import { isValidIsoDate } from "./donation";

export const REPORT_TYPES = ["donations", "receipts", "ledger"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS_TH: Record<ReportType, string> = {
  donations: "รายงานการบริจาค",
  receipts: "รายงานใบอนุโมทนา",
  ledger: "รายงานบัญชีรับ-จ่าย",
};

export function isReportType(value: unknown): value is ReportType {
  return typeof value === "string" && (REPORT_TYPES as readonly string[]).includes(value);
}

export interface ReportQuery {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  accountId?: string;
  direction?: string;
  take?: number;
  skip?: number;
}

/** A built report: column headers + string-matrix rows + a ready-to-download CSV. */
export interface ReportView {
  type: ReportType;
  columns: string[];
  rows: string[][];
  count: number;
  csv: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_TAKE = 500;
const MAX_TAKE = 5000;

/**
 * Render integer satang as a plain baht decimal string, e.g. 100050 -> "1000.50".
 * No thousands separators (CSV-safe) and BigInt-based (no precision loss).
 */
export function satangToBahtPlain(satang: number | bigint | string): string {
  const value =
    typeof satang === "bigint"
      ? satang
      : typeof satang === "string"
        ? BigInt(satang.trim() || "0")
        : BigInt(Math.round(satang));
  const negative = value < 0n;
  const abs = negative ? -value : value;

  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * Neutralise CSV formula injection: a cell beginning with = + - @ (or tab/CR) is
 * executed as a formula when the CSV is opened in Excel/Sheets. Prefix such a
 * value with a single quote. Apply ONLY to user-controlled free text (donor name,
 * note, payee) — never to numeric/date/label cells, so a negative amount like
 * "-70.00" is left intact.
 */
export function csvSafeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Quote a CSV cell per RFC 4180 when it contains a comma, quote, or newline. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Build an RFC-4180 CSV (CRLF line breaks) from headers + string-matrix rows. */
export function toCsv(columns: string[], rows: string[][]): string {
  return [columns, ...rows].map((cells) => cells.map(csvCell).join(",")).join("\r\n");
}

/** Coerce raw query params into a typed report query (silently drops bad values). */
export function parseReportQuery(raw: Record<string, unknown> | undefined): ReportQuery {
  const query: ReportQuery = {};
  if (!raw) {
    return query;
  }

  if (typeof raw.dateFrom === "string" && isValidIsoDate(raw.dateFrom)) {
    query.dateFrom = raw.dateFrom;
  }
  if (typeof raw.dateTo === "string" && isValidIsoDate(raw.dateTo)) {
    query.dateTo = raw.dateTo;
  }
  if (typeof raw.status === "string" && raw.status.trim() !== "") {
    query.status = raw.status.trim();
  }
  if (typeof raw.accountId === "string" && UUID_RE.test(raw.accountId)) {
    query.accountId = raw.accountId;
  }
  if (typeof raw.direction === "string" && (raw.direction === "income" || raw.direction === "expense")) {
    query.direction = raw.direction;
  }

  const take = Number(raw.take);
  query.take = Number.isFinite(take) && take > 0 ? Math.min(Math.floor(take), MAX_TAKE) : DEFAULT_TAKE;
  const skip = Number(raw.skip);
  if (Number.isFinite(skip) && skip > 0) {
    query.skip = Math.min(Math.floor(skip), 1_000_000);
  }

  return query;
}
