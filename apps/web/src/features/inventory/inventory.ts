/**
 * Inventory (คลังของบริจาค/พัสดุ/สังฆทาน) feature — framework-free logic shared by
 * the UI and tests (Task 15). Items hold a balance changed only via movements.
 */

import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS_TH,
  INVENTORY_MOVEMENT_TYPE_LABELS_TH,
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_STATUS_LABELS_TH,
  INVENTORY_STATUSES,
  type CreateItemInput,
  type CreateMovementInput,
  type InventoryCategory,
  type InventoryMovementType,
  type InventoryStatus,
  type UpdateItemInput,
} from "@wat/shared";

export type {
  InventoryCategory,
  InventoryStatus,
  InventoryMovementType,
  CreateItemInput,
  UpdateItemInput,
  CreateMovementInput,
} from "@wat/shared";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string | null;
  quantity: number;
  status: InventoryStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantity: number;
  balanceAfter: number;
  movementDate: string;
  reason: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface ItemFilters {
  q?: string;
  category?: InventoryCategory;
  status?: InventoryStatus;
}

export function categoryLabel(category: InventoryCategory): string {
  return INVENTORY_CATEGORY_LABELS_TH[category];
}
export function statusLabel(status: InventoryStatus): string {
  return INVENTORY_STATUS_LABELS_TH[status];
}
export function movementTypeLabel(type: InventoryMovementType): string {
  return INVENTORY_MOVEMENT_TYPE_LABELS_TH[type];
}

export const CATEGORY_OPTIONS = INVENTORY_CATEGORIES.map((value) => ({ value, label: INVENTORY_CATEGORY_LABELS_TH[value] }));
export const STATUS_OPTIONS = INVENTORY_STATUSES.map((value) => ({ value, label: INVENTORY_STATUS_LABELS_TH[value] }));
export const MOVEMENT_TYPE_OPTIONS = INVENTORY_MOVEMENT_TYPES.map((value) => ({
  value,
  label: INVENTORY_MOVEMENT_TYPE_LABELS_TH[value],
}));

export function buildItemQuery(filters: ItemFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export interface InventoryApi {
  listItems(filters?: ItemFilters): Promise<InventoryItem[]>;
  getItem(id: string): Promise<InventoryItem>;
  createItem(input: CreateItemInput): Promise<InventoryItem>;
  updateItem(id: string, patch: UpdateItemInput): Promise<InventoryItem>;
  listMovements(itemId: string): Promise<InventoryMovement[]>;
  recordMovement(itemId: string, input: CreateMovementInput): Promise<{ movement: InventoryMovement; item: InventoryItem }>;
}

export interface InventoryApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createInventoryApiClient(options: InventoryApiClientOptions): InventoryApi {
  const doFetch = options.fetchFn ?? fetch;
  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  };
  const parse = async (response: Response): Promise<Record<string, unknown>> => {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
    if (!response.ok) {
      throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
    }
    return body;
  };

  return {
    async listItems(filters = {}) {
      const body = await parse(await doFetch(`${options.baseUrl}/inventory/items${buildItemQuery(filters)}`, { headers: headers() }));
      return (body.items ?? []) as InventoryItem[];
    },
    async getItem(id) {
      const body = await parse(await doFetch(`${options.baseUrl}/inventory/items/${id}`, { headers: headers() }));
      return body.item as InventoryItem;
    },
    async createItem(input) {
      const body = await parse(
        await doFetch(`${options.baseUrl}/inventory/items`, { method: "POST", headers: headers(), body: JSON.stringify(input) }),
      );
      return body.item as InventoryItem;
    },
    async updateItem(id, patch) {
      const body = await parse(
        await doFetch(`${options.baseUrl}/inventory/items/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(patch) }),
      );
      return body.item as InventoryItem;
    },
    async listMovements(itemId) {
      const body = await parse(await doFetch(`${options.baseUrl}/inventory/items/${itemId}/movements`, { headers: headers() }));
      return (body.movements ?? []) as InventoryMovement[];
    },
    async recordMovement(itemId, input) {
      const body = await parse(
        await doFetch(`${options.baseUrl}/inventory/items/${itemId}/movements`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(input),
        }),
      );
      return { movement: body.movement as InventoryMovement, item: body.item as InventoryItem };
    },
  };
}
