/**
 * Ceremonies (งานบุญ/พิธี) feature — framework-free logic shared by the UI and
 * tests (Task 14). Wraps /ceremonies CRUD and describes the form layout.
 */

import {
  CEREMONY_STAFF_SETTABLE_STATUSES,
  CEREMONY_STATUS_LABELS_TH,
  CEREMONY_STATUSES,
  CEREMONY_TYPE_LABELS_TH,
  CEREMONY_TYPES,
  type CeremonyStatus,
  type CeremonyType,
  type CreateCeremonyInput,
  type UpdateCeremonyInput,
} from "@wat/shared";

export type { CeremonyType, CeremonyStatus, CreateCeremonyInput, UpdateCeremonyInput } from "@wat/shared";

export interface Ceremony {
  id: string;
  ceremonyType: CeremonyType;
  status: CeremonyStatus;
  title: string;
  ceremonyDate: string;
  timeNote: string | null;
  location: string | null;
  hallId: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  assignedMonks: string | null;
  monkCount: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CeremonyFilters {
  q?: string;
  ceremonyType?: CeremonyType;
  status?: CeremonyStatus;
  dateFrom?: string;
  dateTo?: string;
}

export function ceremonyTypeLabel(type: CeremonyType): string {
  return CEREMONY_TYPE_LABELS_TH[type];
}

export function ceremonyStatusLabel(status: CeremonyStatus): string {
  return CEREMONY_STATUS_LABELS_TH[status];
}

export const CEREMONY_TYPE_OPTIONS = CEREMONY_TYPES.map((value) => ({ value, label: CEREMONY_TYPE_LABELS_TH[value] }));
export const CEREMONY_STATUS_OPTIONS = CEREMONY_STATUSES.map((value) => ({
  value,
  label: CEREMONY_STATUS_LABELS_TH[value],
}));

// Statuses staff may set from the UI (excludes the server-only "requested").
export const CEREMONY_STAFF_STATUS_OPTIONS = CEREMONY_STAFF_SETTABLE_STATUSES.map((value) => ({
  value,
  label: CEREMONY_STATUS_LABELS_TH[value],
}));

export type CeremonyFieldType = "text" | "date" | "number" | "textarea";

export interface CeremonyFormField {
  key: keyof CreateCeremonyInput;
  label: string;
  type: CeremonyFieldType;
}

export interface CeremonyFormSection {
  title: string;
  fields: CeremonyFormField[];
}

export const CEREMONY_FORM_SECTIONS: CeremonyFormSection[] = [
  {
    title: "ข้อมูลงาน",
    fields: [
      { key: "title", label: "ชื่องาน", type: "text" },
      { key: "ceremonyDate", label: "วันที่จัดงาน", type: "date" },
      { key: "timeNote", label: "เวลา", type: "text" },
      { key: "location", label: "สถานที่/ศาลา", type: "text" },
    ],
  },
  {
    title: "เจ้าภาพ",
    fields: [
      { key: "requesterName", label: "เจ้าภาพ/ผู้ขอ", type: "text" },
      { key: "requesterPhone", label: "โทรศัพท์เจ้าภาพ", type: "text" },
    ],
  },
  {
    title: "พระ / หมายเหตุ",
    fields: [
      { key: "monkCount", label: "จำนวนพระ", type: "number" },
      { key: "assignedMonks", label: "พระที่นิมนต์", type: "textarea" },
      { key: "note", label: "หมายเหตุ", type: "textarea" },
    ],
  },
];

/** Build the editable draft from a loaded record (for the edit form). */
export function createDraftFromCeremony(record: Ceremony): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const section of CEREMONY_FORM_SECTIONS) {
    for (const { key } of section.fields) {
      const value = record[key as keyof Ceremony];
      draft[key as string] = value === null || value === undefined ? "" : String(value);
    }
  }
  return draft;
}

export function buildCeremonyQuery(filters: CeremonyFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.ceremonyType) params.set("ceremonyType", filters.ceremonyType);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export interface HallView {
  id: string;
  name: string;
  capacity: number | null;
  note: string | null;
  isActive: boolean;
}

export interface CeremoniesApi {
  list(filters?: CeremonyFilters): Promise<Ceremony[]>;
  get(id: string): Promise<Ceremony>;
  create(input: CreateCeremonyInput): Promise<Ceremony>;
  update(id: string, patch: UpdateCeremonyInput): Promise<Ceremony>;
  /** ศาลา/สถานที่ของวัด (จองศาลา). */
  listHalls(includeInactive?: boolean): Promise<HallView[]>;
  createHall(input: { name: string; capacity?: number | null; note?: string | null }): Promise<HallView>;
  updateHall(id: string, patch: { name?: string; capacity?: number | null; isActive?: boolean }): Promise<HallView>;
}

export interface CeremoniesApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string; details?: Array<{ field?: string; message?: string }> };
}

/**
 * Build a human-readable error from an API error body. Validation failures (422)
 * return the generic "ข้อมูลไม่ถูกต้อง" with per-field `details`; surface those so
 * temple staff see exactly which field is wrong (e.g. "ต้องระบุชื่องาน") instead of a
 * vague message they cannot act on. Falls back to the top-level message.
 */
function apiErrorMessage(body: ApiErrorBody, fallback = "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ"): string {
  const details = body.error?.details;
  if (Array.isArray(details) && details.length > 0) {
    const lines = details.map((d) => d?.message).filter((m): m is string => typeof m === "string" && m.trim() !== "");
    if (lines.length > 0) return lines.join(" • ");
  }
  return body.error?.message ?? fallback;
}

export function createCeremoniesApiClient(options: CeremoniesApiClientOptions): CeremoniesApi {
  const doFetch = options.fetchFn ?? fetch;
  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  };

  const one = async (response: Response): Promise<Ceremony> => {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
    if (!response.ok) {
      throw new Error(apiErrorMessage(body));
    }
    return body.ceremony as Ceremony;
  };

  return {
    async list(filters = {}) {
      const response = await doFetch(`${options.baseUrl}/ceremonies${buildCeremonyQuery(filters)}`, {
        headers: headers(),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(apiErrorMessage(body));
      }
      return (body.ceremonies ?? []) as Ceremony[];
    },
    async get(id) {
      return one(await doFetch(`${options.baseUrl}/ceremonies/${id}`, { headers: headers() }));
    },
    async create(input) {
      return one(
        await doFetch(`${options.baseUrl}/ceremonies`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        }),
      );
    },
    async update(id, patch) {
      return one(
        await doFetch(`${options.baseUrl}/ceremonies/${id}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify(patch),
        }),
      );
    },
    async listHalls(includeInactive = false) {
      const response = await doFetch(
        `${options.baseUrl}/ceremonies/halls${includeInactive ? "?includeInactive=true" : ""}`,
        { headers: headers() },
      );
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(apiErrorMessage(body));
      }
      return (body.halls ?? []) as HallView[];
    },
    async createHall(input) {
      const response = await doFetch(`${options.baseUrl}/ceremonies/halls`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(input),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(apiErrorMessage(body));
      }
      return body.hall as HallView;
    },
    async updateHall(id, patch) {
      const response = await doFetch(`${options.baseUrl}/ceremonies/halls/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(patch),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(apiErrorMessage(body));
      }
      return body.hall as HallView;
    },
  };
}
