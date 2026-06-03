/**
 * Inventory / คลังของบริจาค-พัสดุ-สังฆทาน validation + types (Task 15).
 *
 * Dependency-free; shared by the NestJS inventory module and the React UI.
 * Items hold a denormalised quantity that may ONLY change via a movement, so the
 * item validators intentionally do NOT accept `quantity`.
 */

import { isValidIsoDate } from "./donation";
import { type FieldError, type ValidationResult } from "./donor";
import { isUuid } from "./platform";

export const INVENTORY_CATEGORIES = ["sangha_offering", "supplies", "equipment", "other"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const INVENTORY_STATUSES = ["active", "inactive"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const INVENTORY_MOVEMENT_TYPES = ["receive", "issue"] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_CATEGORY_LABELS_TH: Record<InventoryCategory, string> = {
  sangha_offering: "ของบริจาค/สังฆทาน",
  supplies: "พัสดุ/วัสดุสิ้นเปลือง",
  equipment: "อุปกรณ์/ครุภัณฑ์",
  other: "อื่น ๆ",
};

export const INVENTORY_STATUS_LABELS_TH: Record<InventoryStatus, string> = {
  active: "ใช้งาน",
  inactive: "เลิกใช้/เก็บถาวร",
};

export const INVENTORY_MOVEMENT_TYPE_LABELS_TH: Record<InventoryMovementType, string> = {
  receive: "รับเข้า",
  issue: "เบิกออก",
};

export const INVENTORY_LIMITS = {
  name: 200,
  unit: 40,
  note: 2000,
  reason: 200,
  reference: 200,
} as const;

export const MAX_MOVEMENT_QUANTITY = 1_000_000;

export interface ItemInput {
  name: string;
  category?: InventoryCategory;
  unit?: string | null;
  status?: InventoryStatus;
  note?: string | null;
  /** Optional storage room (ห้อง/โรงเก็บ) id; null clears it. */
  roomId?: string | null;
}

export type CreateItemInput = ItemInput;
export type UpdateItemInput = Partial<ItemInput>;

export interface CreateMovementInput {
  movementType: InventoryMovementType;
  quantity: number;
  movementDate: string;
  reason?: string | null;
  reference?: string | null;
  note?: string | null;
}

export interface ItemSearchQuery {
  q?: string;
  category?: InventoryCategory;
  status?: InventoryStatus;
  take?: number;
  skip?: number;
}

const ITEM_KEYS = ["name", "category", "unit", "status", "note", "roomId"] as const;
const MOVEMENT_KEYS = ["movementType", "quantity", "movementDate", "reason", "reference", "note"] as const;
const DEFAULT_TAKE = 200;
const MAX_TAKE = 1000;

export function isInventoryCategory(value: unknown): value is InventoryCategory {
  return typeof value === "string" && (INVENTORY_CATEGORIES as readonly string[]).includes(value);
}

export function isInventoryStatus(value: unknown): value is InventoryStatus {
  return typeof value === "string" && (INVENTORY_STATUSES as readonly string[]).includes(value);
}

export function isInventoryMovementType(value: unknown): value is InventoryMovementType {
  return typeof value === "string" && (INVENTORY_MOVEMENT_TYPES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optString(value: unknown, key: string, max: number, errors: FieldError[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string") {
    errors.push({ field: key, message: `${key} ไม่ถูกต้อง` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    errors.push({ field: key, message: `${key} ต้องไม่เกิน ${max} ตัวอักษร` });
    return undefined;
  }
  return trimmed;
}

function rejectUnknownKeys(input: Record<string, unknown>, allowed: readonly string[], errors: FieldError[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      errors.push({ field: key, message: `ไม่สามารถแก้ไขฟิลด์ "${key}" ได้` });
    }
  }
}

function applyItemOptionalFields(
  input: Record<string, unknown>,
  data: Record<string, unknown>,
  errors: FieldError[],
): void {
  if ("category" in input) {
    if (isInventoryCategory(input.category)) data.category = input.category;
    else errors.push({ field: "category", message: "ประเภทไม่ถูกต้อง" });
  }
  if ("status" in input) {
    if (isInventoryStatus(input.status)) data.status = input.status;
    else errors.push({ field: "status", message: "สถานะไม่ถูกต้อง" });
  }
  if ("unit" in input) {
    const v = optString(input.unit, "unit", INVENTORY_LIMITS.unit, errors);
    if (v !== undefined) data.unit = v;
  }
  if ("note" in input) {
    const v = optString(input.note, "note", INVENTORY_LIMITS.note, errors);
    if (v !== undefined) data.note = v;
  }
  if ("roomId" in input) {
    if (input.roomId === null || input.roomId === undefined || (typeof input.roomId === "string" && input.roomId.trim() === "")) {
      data.roomId = null;
    } else if (typeof input.roomId === "string" && isUuid(input.roomId.trim())) {
      data.roomId = input.roomId.trim();
    } else {
      errors.push({ field: "roomId", message: "ห้อง/โรงเก็บไม่ถูกต้อง" });
    }
  }
}

export function validateCreateItem(input: unknown): ValidationResult<CreateItemInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if (typeof input.name !== "string" || input.name.trim() === "") {
    errors.push({ field: "name", message: "ต้องระบุชื่อรายการ" });
  } else if (input.name.trim().length > INVENTORY_LIMITS.name) {
    errors.push({ field: "name", message: `ชื่อรายการต้องไม่เกิน ${INVENTORY_LIMITS.name} ตัวอักษร` });
  } else {
    data.name = input.name.trim();
  }

  applyItemOptionalFields(input, data, errors);
  rejectUnknownKeys(input, ITEM_KEYS, errors); // `quantity` is intentionally NOT allowed here

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: data as unknown as CreateItemInput };
}

export function validateUpdateItem(input: unknown): ValidationResult<UpdateItemInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if ("name" in input) {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      errors.push({ field: "name", message: "ชื่อรายการห้ามว่าง" });
    } else if (input.name.trim().length > INVENTORY_LIMITS.name) {
      errors.push({ field: "name", message: `ชื่อรายการต้องไม่เกิน ${INVENTORY_LIMITS.name} ตัวอักษร` });
    } else {
      data.name = input.name.trim();
    }
  }

  applyItemOptionalFields(input, data, errors);
  rejectUnknownKeys(input, ITEM_KEYS, errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }
  if (Object.keys(data).length === 0) {
    return { success: false, errors: [{ field: "_root", message: "ต้องระบุอย่างน้อยหนึ่งฟิลด์ที่จะแก้ไข" }] };
  }
  return { success: true, data: data as UpdateItemInput };
}

export function validateCreateMovement(input: unknown): ValidationResult<CreateMovementInput> {
  if (!isPlainObject(input)) {
    return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  }
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};

  if (!isInventoryMovementType(input.movementType)) {
    errors.push({ field: "movementType", message: "ต้องระบุประเภท (รับเข้า/เบิกออก)" });
  } else {
    data.movementType = input.movementType;
  }

  // quantity: a strictly positive integer (reject booleans/arrays/hex/exponent strings)
  const rawQty = input.quantity;
  let qty: number | null = null;
  if (typeof rawQty === "number" && Number.isInteger(rawQty)) {
    qty = rawQty;
  } else if (typeof rawQty === "string" && /^\d+$/.test(rawQty.trim())) {
    qty = Number(rawQty.trim());
  }
  if (qty === null || qty < 1 || qty > MAX_MOVEMENT_QUANTITY) {
    errors.push({ field: "quantity", message: `จำนวนต้องเป็นจำนวนเต็มบวก (1-${MAX_MOVEMENT_QUANTITY})` });
  } else {
    data.quantity = qty;
  }

  if (typeof input.movementDate !== "string" || !isValidIsoDate(input.movementDate.trim())) {
    errors.push({ field: "movementDate", message: "ต้องระบุวันที่ (YYYY-MM-DD)" });
  } else {
    data.movementDate = input.movementDate.trim();
  }

  for (const key of ["reason", "reference", "note"] as const) {
    if (key in input) {
      const v = optString(input[key], key, INVENTORY_LIMITS[key], errors);
      if (v !== undefined) data[key] = v;
    }
  }

  rejectUnknownKeys(input, MOVEMENT_KEYS, errors);

  if (errors.length > 0) {
    return { success: false, errors };
  }
  return { success: true, data: data as unknown as CreateMovementInput };
}

export function parseItemQuery(raw: Record<string, unknown> | undefined): ItemSearchQuery {
  const query: ItemSearchQuery = {};
  if (!raw) return query;

  if (typeof raw.q === "string" && raw.q.trim() !== "") {
    query.q = raw.q.trim().slice(0, 200);
  }
  if (isInventoryCategory(raw.category)) query.category = raw.category;
  if (isInventoryStatus(raw.status)) query.status = raw.status;

  const take = Number(raw.take);
  query.take = Number.isFinite(take) && take > 0 ? Math.min(Math.floor(take), MAX_TAKE) : DEFAULT_TAKE;
  const skip = Number(raw.skip);
  if (Number.isFinite(skip) && skip > 0) {
    query.skip = Math.min(Math.floor(skip), 1_000_000);
  }

  return query;
}

// ---- storage rooms (ห้อง/โรงเก็บ) ------------------------------------------

export const ROOM_LIMITS = { name: 120, note: 500 } as const;

export interface RoomInput {
  name: string;
  note?: string | null;
}
export type CreateRoomInput = RoomInput;
export type UpdateRoomInput = Partial<RoomInput>;

export interface RoomView {
  id: string;
  name: string;
  note: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export function validateCreateRoom(input: unknown): ValidationResult<CreateRoomInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};
  if (typeof input.name !== "string" || input.name.trim() === "") errors.push({ field: "name", message: "ต้องระบุชื่อห้อง/โรงเก็บ" });
  else if (input.name.trim().length > ROOM_LIMITS.name) errors.push({ field: "name", message: `ชื่อต้องไม่เกิน ${ROOM_LIMITS.name} ตัวอักษร` });
  else data.name = input.name.trim();
  if ("note" in input) {
    const v = optString(input.note, "note", ROOM_LIMITS.note, errors);
    if (v !== undefined) data.note = v;
  }
  for (const key of Object.keys(input)) if (!["name", "note"].includes(key)) errors.push({ field: key, message: `ไม่รองรับฟิลด์ "${key}"` });
  return errors.length ? { success: false, errors } : { success: true, data: data as unknown as CreateRoomInput };
}

export function validateUpdateRoom(input: unknown): ValidationResult<UpdateRoomInput> {
  if (!isPlainObject(input)) return { success: false, errors: [{ field: "_root", message: "รูปแบบข้อมูลไม่ถูกต้อง" }] };
  const errors: FieldError[] = [];
  const data: Record<string, unknown> = {};
  if ("name" in input) {
    if (typeof input.name !== "string" || input.name.trim() === "") errors.push({ field: "name", message: "ชื่อห้อง/โรงเก็บไม่ถูกต้อง" });
    else if (input.name.trim().length > ROOM_LIMITS.name) errors.push({ field: "name", message: `ชื่อต้องไม่เกิน ${ROOM_LIMITS.name} ตัวอักษร` });
    else data.name = input.name.trim();
  }
  if ("note" in input) {
    const v = optString(input.note, "note", ROOM_LIMITS.note, errors);
    if (v !== undefined) data.note = v;
  }
  for (const key of Object.keys(input)) if (!["name", "note"].includes(key)) errors.push({ field: key, message: `ไม่รองรับฟิลด์ "${key}"` });
  if (Object.keys(data).length === 0 && errors.length === 0) errors.push({ field: "_root", message: "ไม่มีข้อมูลที่จะแก้ไข" });
  return errors.length ? { success: false, errors } : { success: true, data: data as UpdateRoomInput };
}

// ---- Excel / bulk import (นำเข้าของภายในวัด) --------------------------------

export const IMPORT_MAX_ROWS = 1000;

export interface ImportItemInput {
  name: string;
  category?: InventoryCategory;
  quantity?: number;
  unit?: string | null;
  /** Room name; the API resolves it to a room (creating it if new). */
  roomName?: string | null;
  note?: string | null;
}

const CATEGORY_BY_LABEL: Record<string, InventoryCategory> = Object.fromEntries(
  (Object.entries(INVENTORY_CATEGORY_LABELS_TH) as Array<[InventoryCategory, string]>).map(([key, label]) => [label, key]),
);

function resolveImportCategory(raw: unknown): InventoryCategory | undefined | "INVALID" {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return undefined;
  if (typeof raw !== "string") return "INVALID";
  const t = raw.trim();
  if (isInventoryCategory(t)) return t;
  return CATEGORY_BY_LABEL[t] ?? "INVALID";
}

/** Validate parsed import rows (from an .xlsx the web reads client-side). */
export function validateImportItems(input: unknown): ValidationResult<ImportItemInput[]> {
  if (!Array.isArray(input)) return { success: false, errors: [{ field: "_root", message: "ต้องเป็นรายการของแถวข้อมูล" }] };
  if (input.length === 0) return { success: false, errors: [{ field: "_root", message: "ไม่มีข้อมูลให้นำเข้า" }] };
  if (input.length > IMPORT_MAX_ROWS) return { success: false, errors: [{ field: "_root", message: `นำเข้าได้ไม่เกิน ${IMPORT_MAX_ROWS} แถวต่อครั้ง` }] };
  const errors: FieldError[] = [];
  const rows: ImportItemInput[] = [];
  input.forEach((raw, i) => {
    const p = `row[${i}]`;
    if (!isPlainObject(raw)) { errors.push({ field: p, message: "แถวไม่ถูกต้อง" }); return; }
    const row: ImportItemInput = { name: "" };
    if (typeof raw.name !== "string" || raw.name.trim() === "") errors.push({ field: `${p}.name`, message: "ต้องระบุชื่อสิ่งของ" });
    else if (raw.name.trim().length > INVENTORY_LIMITS.name) errors.push({ field: `${p}.name`, message: "ชื่อยาวเกินไป" });
    else row.name = raw.name.trim();

    const cat = resolveImportCategory(raw.category);
    if (cat === "INVALID") errors.push({ field: `${p}.category`, message: "ประเภทไม่ถูกต้อง" });
    else if (cat) row.category = cat;

    if (raw.quantity !== undefined && raw.quantity !== null && raw.quantity !== "") {
      const q = typeof raw.quantity === "number" ? raw.quantity : Number(raw.quantity);
      if (!Number.isFinite(q) || !Number.isInteger(q) || q < 0 || q > MAX_MOVEMENT_QUANTITY) errors.push({ field: `${p}.quantity`, message: "จำนวนไม่ถูกต้อง" });
      else if (q > 0) row.quantity = q;
    }
    const unit = optString(raw.unit, `${p}.unit`, INVENTORY_LIMITS.unit, errors);
    if (typeof unit === "string") row.unit = unit;
    const room = optString(raw.roomName ?? raw.room, `${p}.room`, ROOM_LIMITS.name, errors);
    if (typeof room === "string") row.roomName = room;
    const note = optString(raw.note, `${p}.note`, INVENTORY_LIMITS.note, errors);
    if (typeof note === "string") row.note = note;
    rows.push(row);
  });
  return errors.length ? { success: false, errors } : { success: true, data: rows };
}
