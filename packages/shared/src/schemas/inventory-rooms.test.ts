import { describe, expect, it } from "vitest";
import { validateCreateItem, validateCreateRoom, validateImportItems } from "./inventory";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("storage room validation", () => {
  it("requires a name", () => {
    expect(validateCreateRoom({ name: "" }).success).toBe(false);
    const ok = validateCreateRoom({ name: "โรงเก็บหลังโบสถ์", note: "ของหนัก" });
    expect(ok.success).toBe(true);
  });
  it("rejects unknown fields", () => {
    expect(validateCreateRoom({ name: "x", capacity: 10 }).success).toBe(false);
  });
});

describe("item roomId", () => {
  it("accepts a uuid room, clears with null/blank, rejects junk", () => {
    const ok = validateCreateItem({ name: "เต็นท์", roomId: UUID });
    expect(ok.success && ok.data.roomId).toBe(UUID);
    const cleared = validateCreateItem({ name: "เต็นท์", roomId: "" });
    expect(cleared.success && cleared.data.roomId).toBeNull();
    expect(validateCreateItem({ name: "เต็นท์", roomId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("Excel import validation", () => {
  it("accepts rows with category by enum or Thai label, optional qty/room", () => {
    const r = validateImportItems([
      { name: "เก้าอี้", category: "equipment", quantity: 20, unit: "ตัว", roomName: "โรงเก็บ A" },
      { name: "จาน", category: "พัสดุ/วัสดุสิ้นเปลือง", note: "ชุดเลี้ยงพระ" }, // Thai label -> supplies
    ]);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data[0]).toMatchObject({ name: "เก้าอี้", category: "equipment", quantity: 20, roomName: "โรงเก็บ A" });
      expect(r.data[1]?.category).toBe("supplies");
    }
  });
  it("reports per-row errors (missing name, bad category, bad qty)", () => {
    const r = validateImportItems([{ name: "" }, { name: "x", category: "ไม่รู้" }, { name: "y", quantity: -3 }]);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.errors.some((e) => e.field === "row[0].name")).toBe(true);
      expect(r.errors.some((e) => e.field === "row[1].category")).toBe(true);
      expect(r.errors.some((e) => e.field === "row[2].quantity")).toBe(true);
    }
  });
  it("rejects a non-array or empty import", () => {
    expect(validateImportItems({}).success).toBe(false);
    expect(validateImportItems([]).success).toBe(false);
  });
});
