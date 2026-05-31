/**
 * Temple profile feature — framework-free logic shared by the UI and tests
 * (Task 12). Wraps GET/PATCH /temple and describes the editable field layout.
 */

import { TEMPLE_PROFILE_LABELS_TH, type TempleProfile, type TempleProfileUpdate } from "@wat/shared";

export type { TempleProfile, TempleProfileUpdate } from "@wat/shared";
export { TEMPLE_PROFILE_LABELS_TH } from "@wat/shared";

export interface TempleField {
  key: keyof TempleProfileUpdate;
  label: string;
  multiline?: boolean;
}

export interface TempleFieldGroup {
  title: string;
  fields: TempleField[];
}

function field(key: keyof TempleProfileUpdate, multiline = false): TempleField {
  return { key, label: TEMPLE_PROFILE_LABELS_TH[key as string] ?? (key as string), multiline };
}

/** Editable fields grouped into form sections (Thai-first). */
export const TEMPLE_FIELD_GROUPS: TempleFieldGroup[] = [
  {
    title: "ข้อมูลทั่วไป",
    fields: [field("nameTh"), field("nameEn"), field("abbotName"), field("denomination"), field("registrationNo"), field("taxId")],
  },
  {
    title: "ที่อยู่",
    fields: [field("addressTh"), field("subdistrict"), field("district"), field("province"), field("postalCode")],
  },
  {
    title: "ช่องทางติดต่อ",
    fields: [field("phone"), field("email"), field("lineId"), field("websiteUrl")],
  },
  {
    title: "เอกสาร / ใบอนุโมทนา",
    fields: [field("logoUrl"), field("receiptHeaderTh", true), field("receiptFooterTh", true)],
  },
];

/** Diff a draft against the loaded profile -> only the changed keys (the PATCH body). */
export function diffProfile(original: TempleProfile, draft: Record<string, string>): TempleProfileUpdate {
  const patch: Record<string, string> = {};
  for (const group of TEMPLE_FIELD_GROUPS) {
    for (const { key } of group.fields) {
      const k = key as string;
      // Only consider fields the draft actually carries; an absent key is not "cleared".
      if (!(k in draft)) {
        continue;
      }
      const next = (draft[k] ?? "").trim();
      const current = (original[key] ?? "") as string;
      if (next !== current) {
        patch[k] = next;
      }
    }
  }
  return patch as TempleProfileUpdate;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export interface TempleApi {
  get(): Promise<TempleProfile>;
  update(patch: TempleProfileUpdate): Promise<TempleProfile>;
}

export interface TempleApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createTempleApiClient(options: TempleApiClientOptions): TempleApi {
  const doFetch = options.fetchFn ?? fetch;
  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  };

  const parse = async (response: Response): Promise<TempleProfile> => {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
    if (!response.ok) {
      throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    }
    return body.temple as TempleProfile;
  };

  return {
    async get() {
      return parse(await doFetch(`${options.baseUrl}/temple`, { headers: headers() }));
    },
    async update(patch) {
      return parse(
        await doFetch(`${options.baseUrl}/temple`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify(patch),
        }),
      );
    },
  };
}
