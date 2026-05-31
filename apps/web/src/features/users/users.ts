/**
 * Tenant user-management feature — framework-free logic shared by the UI and
 * tests (Task 17). Admin-only; wraps /users CRUD. Password is write-only.
 */

import {
  TENANT_ROLE_LABELS_TH,
  TENANT_ROLES,
  type CreateUserInput,
  type TenantRole,
  type UpdateUserInput,
} from "@wat/shared";

export type { TenantRole, CreateUserInput, UpdateUserInput } from "@wat/shared";

export interface TenantUser {
  id: string;
  email: string;
  displayName: string;
  role: TenantRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserFilters {
  q?: string;
  role?: TenantRole;
  isActive?: boolean;
}

export function roleLabel(role: TenantRole): string {
  return TENANT_ROLE_LABELS_TH[role];
}

export const ROLE_OPTIONS = TENANT_ROLES.map((value) => ({ value, label: TENANT_ROLE_LABELS_TH[value] }));

export function buildUserQuery(filters: UserFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.role) params.set("role", filters.role);
  if (filters.isActive !== undefined) params.set("isActive", String(filters.isActive));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface UsersApi {
  list(filters?: UserFilters): Promise<TenantUser[]>;
  get(id: string): Promise<TenantUser>;
  create(input: CreateUserInput): Promise<TenantUser>;
  update(id: string, patch: UpdateUserInput): Promise<TenantUser>;
}

export interface UsersApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createUsersApiClient(options: UsersApiClientOptions): UsersApi {
  const doFetch = options.fetchFn ?? fetch;
  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  };
  const one = async (response: Response): Promise<TenantUser> => {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
    if (!response.ok) {
      throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    }
    return body.user as TenantUser;
  };

  return {
    async list(filters = {}) {
      const response = await doFetch(`${options.baseUrl}/users${buildUserQuery(filters)}`, { headers: headers() });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
      }
      return (body.users ?? []) as TenantUser[];
    },
    async get(id) {
      return one(await doFetch(`${options.baseUrl}/users/${id}`, { headers: headers() }));
    },
    async create(input) {
      return one(
        await doFetch(`${options.baseUrl}/users`, { method: "POST", headers: headers(), body: JSON.stringify(input) }),
      );
    },
    async update(id, patch) {
      return one(
        await doFetch(`${options.baseUrl}/users/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(patch) }),
      );
    },
  };
}
