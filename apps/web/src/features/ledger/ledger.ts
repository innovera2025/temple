/**
 * Ledger feature — framework-free logic shared by the UI and tests (Task 7).
 *
 * Validation, money conversion, and Thai labels all come from `@wat/shared`, so
 * the web app enforces exactly the same rules (and shows the same Thai messages)
 * as the NestJS API. A manual entry's direction (income/expense) is derived from
 * the account it posts to.
 */

import {
  bahtToSatang,
  formatSatang,
  LEDGER_ACCOUNT_TYPE_LABELS_TH,
  LEDGER_DIRECTION_LABELS_TH,
  LEDGER_ENTRY_STATUS_LABELS_TH,
  validateCreateLedgerEntry,
  validateVoidLedgerEntry,
  type CreateLedgerEntryInput,
  type FieldError,
  type LedgerAccountType,
  type LedgerAccountView,
  type LedgerDirection,
  type LedgerEntrySearchQuery,
  type LedgerEntryStatus,
  type LedgerEntryView,
  type LedgerSummaryView,
  type ValidationResult,
} from "@wat/shared";

export type {
  LedgerAccountView,
  LedgerEntrySearchQuery,
  LedgerEntryView,
  LedgerSummaryView,
} from "@wat/shared";

/** Render integer satang (string or number) as a Thai baht amount, e.g. "฿1,000.50". */
export function displayBaht(amountSatang: string | number | bigint): string {
  // Pass the integer-satang value straight to formatSatang (BigInt-safe); never
  // coerce through Number() so large summary totals keep full precision.
  return `฿${formatSatang(amountSatang)}`;
}

export function statusLabel(status: string): string {
  return LEDGER_ENTRY_STATUS_LABELS_TH[status as LedgerEntryStatus] ?? status;
}

export function accountTypeLabel(accountType: string): string {
  return LEDGER_ACCOUNT_TYPE_LABELS_TH[accountType as LedgerAccountType] ?? accountType;
}

export function directionLabel(direction: LedgerDirection | null): string {
  return direction ? LEDGER_DIRECTION_LABELS_TH[direction] : "—";
}

/** A `4000 รายรับเงินบริจาค` style label for an account option. */
export function accountOptionLabel(account: LedgerAccountView): string {
  return `${account.code} ${account.nameTh}`;
}

/** Accounts that can receive a manual entry (active revenue/expense only). */
export function postableAccounts(accounts: LedgerAccountView[]): LedgerAccountView[] {
  return accounts.filter((account) => account.isActive && account.direction !== null);
}

/** A manual entry can be voided here only if it is posted and not donation-linked. */
export function canVoidEntry(entry: LedgerEntryView): boolean {
  return entry.status === "posted" && entry.donationId === null;
}

export interface LedgerFormValues {
  accountId: string;
  amountBaht: string;
  entryDate: string;
  payee?: string;
  note?: string;
}

export function emptyLedgerForm(entryDate: string): LedgerFormValues {
  return { accountId: "", amountBaht: "", entryDate, payee: "", note: "" };
}

/**
 * Validate an entry form: convert baht -> integer satang, then defer to the
 * shared validator so the web enforces identical rules and Thai messages.
 */
export function validateLedgerEntryForm(
  values: LedgerFormValues,
): ValidationResult<CreateLedgerEntryInput> {
  const trimmed = values.amountBaht.trim();
  const baht = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(baht)) {
    return { success: false, errors: [{ field: "amountBaht", message: "กรุณาระบุจำนวนเงิน (บาท)" }] };
  }

  const payee = values.payee?.trim();
  const note = values.note?.trim();

  return validateCreateLedgerEntry({
    accountId: values.accountId,
    amountSatang: bahtToSatang(baht),
    entryDate: values.entryDate,
    payee: payee ? payee : undefined,
    note: note ? note : undefined,
  });
}

export function validateVoidReason(reason: string): ValidationResult<{ reason: string }> {
  return validateVoidLedgerEntry({ reason });
}

/** First validation message for a field, for inline form display. */
export function firstError(errors: FieldError[], field: string): string | undefined {
  return errors.find((error) => error.field === field)?.message;
}

// ---------------------------------------------------------------------------
// API client — connects the feature to the NestJS ledger API. Injectable
// `fetchFn` keeps it unit-testable without a live server.
// ---------------------------------------------------------------------------

export interface LedgerApi {
  listEntries(query?: LedgerEntrySearchQuery): Promise<LedgerEntryView[]>;
  listAccounts(): Promise<LedgerAccountView[]>;
  summary(query?: { month?: string; dateFrom?: string; dateTo?: string }): Promise<LedgerSummaryView>;
  create(input: CreateLedgerEntryInput): Promise<LedgerEntryView>;
  void(id: string, reason: string): Promise<LedgerEntryView>;
}

export function buildLedgerQuery(query: LedgerEntrySearchQuery = {}): string {
  const params = new URLSearchParams();
  if (query.accountId) params.set("accountId", query.accountId);
  if (query.status) params.set("status", query.status);
  if (query.direction) params.set("direction", query.direction);
  if (query.donationId) params.set("donationId", query.donationId);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  const qs = params.toString();

  return qs ? `?${qs}` : "";
}

export interface LedgerApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createLedgerApiClient(options: LedgerApiClientOptions): LedgerApi {
  const doFetch = options.fetchFn ?? fetch;

  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  };

  const handle = async <T>(
    response: Response,
    pick: (body: Record<string, unknown>) => T,
  ): Promise<T> => {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
    if (!response.ok) {
      throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    }
    return pick(body);
  };

  return {
    async listEntries(query) {
      const response = await doFetch(`${options.baseUrl}/ledger/entries${buildLedgerQuery(query)}`, {
        headers: headers(),
      });
      return handle(response, (body) => (body.entries as LedgerEntryView[]) ?? []);
    },
    async listAccounts() {
      const response = await doFetch(`${options.baseUrl}/ledger/accounts?activeOnly=true`, {
        headers: headers(),
      });
      return handle(response, (body) => (body.accounts as LedgerAccountView[]) ?? []);
    },
    async summary(query = {}) {
      const params = new URLSearchParams();
      if (query.month) params.set("month", query.month);
      if (query.dateFrom) params.set("dateFrom", query.dateFrom);
      if (query.dateTo) params.set("dateTo", query.dateTo);
      const qs = params.toString();
      const response = await doFetch(`${options.baseUrl}/ledger/summary${qs ? `?${qs}` : ""}`, {
        headers: headers(),
      });
      return handle(response, (body) => body.summary as LedgerSummaryView);
    },
    async create(input) {
      const response = await doFetch(`${options.baseUrl}/ledger/entries`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(input),
      });
      return handle(response, (body) => body.entry as LedgerEntryView);
    },
    async void(id, reason) {
      const response = await doFetch(`${options.baseUrl}/ledger/entries/${id}/void`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ reason }),
      });
      return handle(response, (body) => body.entry as LedgerEntryView);
    },
  };
}
