/**
 * Donations feature — framework-free logic shared by the UI and tests (Task 5).
 *
 * Validation, money conversion, and Thai labels all come from `@wat/shared`, so
 * the web app enforces exactly the same rules (and shows the same Thai messages)
 * as the NestJS API.
 */

import {
  bahtToSatang,
  DONATION_METHOD_LABELS_TH,
  DONATION_METHODS,
  DONATION_STATUS_LABELS_TH,
  DONATION_STATUSES,
  formatSatang,
  validateCreateDonation,
  validateVoidDonation,
  type CreateDonationInput,
  type DonationMethod,
  type DonationSearchQuery,
  type DonationStatus,
  type FieldError,
  type ValidationResult,
} from "@wat/shared";

/** A donation as returned by the API. `amountSatang` is a string (integer satang). */
export interface DonationView {
  id: string;
  donorId: string | null;
  amountSatang: string;
  currency: string;
  method: DonationMethod;
  donationDate: string;
  status: DonationStatus;
  note: string | null;
  fundAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MethodOption {
  value: DonationMethod;
  label: string;
}

export interface StatusOption {
  value: DonationStatus;
  label: string;
}

export const DONATION_METHOD_OPTIONS: MethodOption[] = DONATION_METHODS.map((value) => ({
  value,
  label: DONATION_METHOD_LABELS_TH[value],
}));

export const DONATION_STATUS_OPTIONS: StatusOption[] = DONATION_STATUSES.map((value) => ({
  value,
  label: DONATION_STATUS_LABELS_TH[value],
}));

export function methodLabel(method: string): string {
  return DONATION_METHOD_LABELS_TH[method as DonationMethod] ?? method;
}

export function statusLabel(status: string): string {
  return DONATION_STATUS_LABELS_TH[status as DonationStatus] ?? status;
}

/** Render integer satang (string or number) as a Thai baht amount, e.g. "฿1,000.50". */
export function displayBaht(amountSatang: string | number | bigint): string {
  const satang = typeof amountSatang === "string" ? Number(amountSatang) : amountSatang;
  return `฿${formatSatang(satang)}`;
}

/** Raw create-form values; `amountBaht` is the string straight from the input. */
export interface DonationFormValues {
  amountBaht: string;
  method: DonationMethod;
  donationDate: string;
  donorId?: string;
  note?: string;
}

export function emptyDonationForm(donationDate: string): DonationFormValues {
  return { amountBaht: "", method: "cash", donationDate, donorId: "", note: "" };
}

/**
 * Validate a create form: convert baht -> integer satang, then defer to the
 * shared validator so the web enforces identical rules and Thai messages.
 */
export function validateDonationForm(
  values: DonationFormValues,
): ValidationResult<CreateDonationInput> {
  const trimmed = values.amountBaht.trim();
  const baht = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(baht)) {
    return { success: false, errors: [{ field: "amountBaht", message: "กรุณาระบุจำนวนเงิน (บาท)" }] };
  }

  const donorId = values.donorId?.trim();
  const note = values.note?.trim();

  return validateCreateDonation({
    amountSatang: bahtToSatang(baht),
    method: values.method,
    donationDate: values.donationDate,
    donorId: donorId ? donorId : undefined,
    note: note ? note : undefined,
  });
}

export function validateVoidReason(reason: string): ValidationResult<{ reason: string }> {
  return validateVoidDonation({ reason });
}

/** First validation message for a field, for inline form display. */
export function firstError(errors: FieldError[], field: string): string | undefined {
  return errors.find((error) => error.field === field)?.message;
}

// ---------------------------------------------------------------------------
// API client — connects the feature to the NestJS donations API. Injectable
// `fetchFn` keeps it unit-testable without a live server.
// ---------------------------------------------------------------------------

export interface DonationsApi {
  list(query?: DonationSearchQuery): Promise<DonationView[]>;
  create(input: CreateDonationInput): Promise<DonationView>;
  void(id: string, reason: string): Promise<DonationView>;
}

export function buildDonationQuery(query: DonationSearchQuery = {}): string {
  const params = new URLSearchParams();
  if (query.donorId) params.set("donorId", query.donorId);
  if (query.method) params.set("method", query.method);
  if (query.status) params.set("status", query.status);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  const qs = params.toString();

  return qs ? `?${qs}` : "";
}

export interface DonationsApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createDonationsApiClient(options: DonationsApiClientOptions): DonationsApi {
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
      const response = await doFetch(`${options.baseUrl}/donations${buildDonationQuery(query)}`, {
        headers: headers(),
      });
      return handle(response, (body) => (body.donations as DonationView[]) ?? []);
    },
    async create(input) {
      const response = await doFetch(`${options.baseUrl}/donations`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(input),
      });
      return handle(response, (body) => body.donation as DonationView);
    },
    async void(id, reason) {
      const response = await doFetch(`${options.baseUrl}/donations/${id}/void`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ reason }),
      });
      return handle(response, (body) => body.donation as DonationView);
    },
  };
}
