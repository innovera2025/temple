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
  type CreateRoomInput,
  type ImportItemInput,
  type InventoryCategory,
  type InventoryMovementType,
  type InventoryStatus,
  type RoomView,
  type UpdateItemInput,
} from "@wat/shared";

export type {
  InventoryCategory,
  InventoryStatus,
  InventoryMovementType,
  CreateItemInput,
  UpdateItemInput,
  CreateMovementInput,
  CreateRoomInput,
  ImportItemInput,
  RoomView,
} from "@wat/shared";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string | null;
  quantity: number;
  status: InventoryStatus;
  note: string | null;
  roomId: string | null;
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
  listRooms(): Promise<RoomView[]>;
  createRoom(input: CreateRoomInput): Promise<RoomView>;
  importItems(rows: ImportItemInput[]): Promise<{ itemsCreated: number; roomsCreated: number }>;
}

// Header aliases (TH/EN) -> import field. The temple's Excel can use Thai headers.
const HEADER_MAP: Record<string, keyof ImportItemInput> = {
  name: "name", "ชื่อ": "name", "ชื่อสิ่งของ": "name", "รายการ": "name",
  category: "category", "ประเภท": "category", "หมวด": "category", "หมวดหมู่": "category",
  quantity: "quantity", qty: "quantity", "จำนวน": "quantity",
  unit: "unit", "หน่วย": "unit",
  room: "roomName", roomname: "roomName", "ห้อง": "roomName", "โรงเก็บ": "roomName", "ห้อง/โรงเก็บ": "roomName", "ที่เก็บ": "roomName",
  note: "note", "หมายเหตุ": "note",
};

/**
 * Normalize an exceljs cell value to display text — cells can hold rich text,
 * hyperlinks, formula results, or dates, not just scalars.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as { richText?: Array<{ text: string }>; text?: unknown; result?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return cellText(v.result);
    return "";
  }
  return String(value);
}

/** Parse an .xlsx File (first sheet, header row first) into import rows,
 *  mapping TH/EN headers. exceljs is loaded on demand so it stays out of the
 *  main bundle. (Replaced the abandoned SheetJS build that carried unpatched
 *  advisories — exceljs reads modern .xlsx only, not legacy .xls.) */
export async function parseInventoryXlsx(file: File): Promise<ImportItemInput[]> {
  const ExcelJS = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  // Column -> import field, resolved from the header row (row 1).
  const fields = new Map<number, keyof ImportItemInput>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const header = cellText(cell.value).trim();
    const field = HEADER_MAP[header.toLowerCase()] ?? HEADER_MAP[header];
    if (field) fields.set(col, field);
  });

  const rows: ImportItemInput[] = [];
  sheet.eachRow({ includeEmpty: false }, (sheetRow, rowNumber) => {
    if (rowNumber === 1) return;
    const row: Record<string, unknown> = {};
    sheetRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const field = fields.get(col);
      if (!field) return;
      const text = cellText(cell.value).trim();
      if (field === "quantity") {
        const n = Number(text.replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(n) && text !== "") row.quantity = Math.trunc(n);
      } else if (text) {
        row[field] = text;
      }
    });
    // skip fully-empty rows
    if (Object.keys(row).length > 0) rows.push(row as unknown as ImportItemInput);
  });
  return rows;
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
    async listRooms() {
      const body = await parse(await doFetch(`${options.baseUrl}/inventory/rooms`, { headers: headers() }));
      return (body.rooms ?? []) as RoomView[];
    },
    async createRoom(input) {
      const body = await parse(
        await doFetch(`${options.baseUrl}/inventory/rooms`, { method: "POST", headers: headers(), body: JSON.stringify(input) }),
      );
      return body.room as RoomView;
    },
    async importItems(rows) {
      const body = await parse(
        await doFetch(`${options.baseUrl}/inventory/import`, { method: "POST", headers: headers(), body: JSON.stringify({ rows }) }),
      );
      return body as { itemsCreated: number; roomsCreated: number };
    },
  };
}
