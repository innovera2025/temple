/**
 * Donor registry feature client (web Task 5). The design NAV has a "ทะเบียนผู้บริจาค"
 * page but no extracted view, while the backend /donors API is ready — so this is a
 * minimal adapter over the existing API + @wat/shared schema (no new backend).
 */
import {
  type CreateDonorInput,
  type DonorSearchQuery,
  type DonorType,
} from "@wat/shared";

export type { CreateDonorInput, DonorSearchQuery } from "@wat/shared";

export const DONOR_TYPE_LABELS_TH: Record<DonorType, string> = {
  person: "บุคคล",
  organization: "นิติบุคคล",
};

export function donorTypeLabel(type: string): string {
  return DONOR_TYPE_LABELS_TH[type as DonorType] ?? type;
}

// Mirrors the API's SerializedDonor (apps/api/src/donors/donors.controller.ts).
export interface DonorRecord {
  id: string;
  displayName: string;
  legalName: string | null;
  donorType: string;
  email: string | null;
  phone: string | null;
  lineId: string | null;
  address: string | null;
  taxId: string | null;
  tags: string[];
  notes: string | null;
  consent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DonorsApi {
  list(query?: DonorSearchQuery): Promise<DonorRecord[]>;
  create(input: CreateDonorInput): Promise<DonorRecord>;
}

export interface DonorsApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message ?? `คำขอไม่สำเร็จ (${response.status})`;
}

export function createDonorsApiClient(options: DonorsApiClientOptions): DonorsApi {
  const doFetch = options.fetchFn ?? fetch;

  function headers(): Record<string, string> {
    const token = options.getToken();
    return {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  return {
    async list(query) {
      const params = new URLSearchParams();
      if (query?.q) params.set("q", query.q);
      if (query?.donorType) params.set("donorType", query.donorType);
      const qs = params.toString();
      const response = await doFetch(`${options.baseUrl}/donors${qs ? `?${qs}` : ""}`, {
        headers: headers(),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { donors: DonorRecord[] };
      return body.donors;
    },
    async create(input) {
      const response = await doFetch(`${options.baseUrl}/donors`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = (await response.json()) as { donor: DonorRecord };
      return body.donor;
    },
  };
}
