/**
 * Personnel (พระ/สามเณร/บุคลากร) feature — framework-free logic shared by the UI
 * and tests (Task 13). Wraps /personnel CRUD and describes the form layout.
 */

import {
  PERSONNEL_STATUS_LABELS_TH,
  PERSONNEL_STATUSES,
  PERSONNEL_TYPE_LABELS_TH,
  PERSONNEL_TYPES,
  type CreatePersonnelInput,
  type PersonnelStatus,
  type PersonnelType,
  type UpdatePersonnelInput,
} from "@wat/shared";

export type { PersonnelType, PersonnelStatus, CreatePersonnelInput, UpdatePersonnelInput } from "@wat/shared";

export interface Personnel {
  id: string;
  personnelType: PersonnelType;
  status: PersonnelStatus;
  displayName: string;
  dharmaName: string | null;
  secularName: string | null;
  rank: string | null;
  position: string | null;
  ordinationDate: string | null;
  ordinationTemple: string | null;
  preceptor: string | null;
  phansaCount: number | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  phone: string | null;
  note: string | null;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonnelFilters {
  q?: string;
  personnelType?: PersonnelType;
  status?: PersonnelStatus;
}

export function personnelTypeLabel(type: PersonnelType): string {
  return PERSONNEL_TYPE_LABELS_TH[type];
}

export function personnelStatusLabel(status: PersonnelStatus): string {
  return PERSONNEL_STATUS_LABELS_TH[status];
}

export const PERSONNEL_TYPE_OPTIONS = PERSONNEL_TYPES.map((value) => ({
  value,
  label: PERSONNEL_TYPE_LABELS_TH[value],
}));

export const PERSONNEL_STATUS_OPTIONS = PERSONNEL_STATUSES.map((value) => ({
  value,
  label: PERSONNEL_STATUS_LABELS_TH[value],
}));

export type PersonnelFieldType = "text" | "date" | "number" | "textarea";

export interface PersonnelFormField {
  key: keyof CreatePersonnelInput;
  label: string;
  type: PersonnelFieldType;
}

export interface PersonnelFormSection {
  title: string;
  fields: PersonnelFormField[];
}

/** Form layout for create/edit (personnelType + status are dedicated selects). */
export const PERSONNEL_FORM_SECTIONS: PersonnelFormSection[] = [
  {
    title: "ข้อมูลหลัก",
    fields: [
      { key: "displayName", label: "ชื่อที่แสดง", type: "text" },
      { key: "dharmaName", label: "ฉายา", type: "text" },
      { key: "secularName", label: "ชื่อ-สกุลเดิม", type: "text" },
    ],
  },
  {
    title: "ตำแหน่ง / สมณศักดิ์",
    fields: [
      { key: "rank", label: "สมณศักดิ์/ยศ", type: "text" },
      { key: "position", label: "ตำแหน่งในวัด", type: "text" },
    ],
  },
  {
    title: "การอุปสมบท",
    fields: [
      { key: "ordinationDate", label: "วันอุปสมบท/บรรพชา", type: "date" },
      { key: "ordinationTemple", label: "วัดที่อุปสมบท", type: "text" },
      { key: "preceptor", label: "พระอุปัชฌาย์", type: "text" },
      { key: "phansaCount", label: "จำนวนพรรษา", type: "number" },
    ],
  },
  {
    title: "ข้อมูลส่วนตัว / ติดต่อ",
    fields: [
      { key: "dateOfBirth", label: "วันเกิด", type: "date" },
      { key: "nationalId", label: "เลขบัตรประชาชน", type: "text" },
      { key: "phone", label: "โทรศัพท์", type: "text" },
      { key: "joinedAt", label: "วันที่เข้าสังกัด", type: "date" },
      { key: "note", label: "หมายเหตุ", type: "textarea" },
    ],
  },
];

/** Build the editable text-field draft from a loaded record (for the edit form). */
export function createDraftFromPersonnel(record: Personnel): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const section of PERSONNEL_FORM_SECTIONS) {
    for (const { key } of section.fields) {
      const value = record[key as keyof Personnel];
      draft[key as string] = value === null || value === undefined ? "" : String(value);
    }
  }
  return draft;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export interface PersonnelApi {
  list(filters?: PersonnelFilters): Promise<Personnel[]>;
  get(id: string): Promise<Personnel>;
  create(input: CreatePersonnelInput): Promise<Personnel>;
  update(id: string, patch: UpdatePersonnelInput): Promise<Personnel>;
}

export interface PersonnelApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function buildPersonnelQuery(filters: PersonnelFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.personnelType) params.set("personnelType", filters.personnelType);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function createPersonnelApiClient(options: PersonnelApiClientOptions): PersonnelApi {
  const doFetch = options.fetchFn ?? fetch;
  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  };

  const one = async (response: Response): Promise<Personnel> => {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
    if (!response.ok) {
      throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    }
    return body.personnel as Personnel;
  };

  return {
    async list(filters = {}) {
      const response = await doFetch(`${options.baseUrl}/personnel${buildPersonnelQuery(filters)}`, {
        headers: headers(),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
      }
      return (body.personnel ?? []) as Personnel[];
    },
    async get(id) {
      return one(await doFetch(`${options.baseUrl}/personnel/${id}`, { headers: headers() }));
    },
    async create(input) {
      return one(
        await doFetch(`${options.baseUrl}/personnel`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        }),
      );
    },
    async update(id, patch) {
      return one(
        await doFetch(`${options.baseUrl}/personnel/${id}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify(patch),
        }),
      );
    },
  };
}
