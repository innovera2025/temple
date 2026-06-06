import { describe, expect, it } from "vitest";
import {
  loanShortage,
  MAX_LOAN_PHOTOS,
  validateCreateBorrowableItem,
  validateCreateLoan,
  validateReturnLoan,
} from "./item-loan";

describe("borrowable item validation", () => {
  it("requires a name and accepts totalQty + category", () => {
    expect(validateCreateBorrowableItem({ name: "  " }).success).toBe(false);
    const ok = validateCreateBorrowableItem({ name: "เต็นท์", category: "equipment", totalQty: 10, unit: "หลัง" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.totalQty).toBe(10);
  });
  it("rejects a negative/!integer totalQty and unknown fields", () => {
    expect(validateCreateBorrowableItem({ name: "x", totalQty: -1 }).success).toBe(false);
    expect(validateCreateBorrowableItem({ name: "x", quantity: 5 }).success).toBe(false);
  });
});

describe("create loan validation", () => {
  const base = { itemId: "i1", borrowerName: "คุณสมชาย", quantity: 2, borrowedAt: "2026-06-02", borrowPhotoId: "p1" };
  it("accepts a complete loan", () => {
    const r = validateCreateLoan(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ itemId: "i1", quantity: 2, borrowPhotoId: "p1" });
  });
  it("requires at least one borrow photo (ถ่ายรูปก่อนยืม)", () => {
    const r = validateCreateLoan({ ...base, borrowPhotoId: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.some((e) => e.field === "borrowPhotoIds")).toBe(true);
    expect(validateCreateLoan({ ...base, borrowPhotoId: undefined, borrowPhotoIds: [] }).success).toBe(false);
  });
  it("accepts multiple borrow photos and derives the primary from the first", () => {
    const r = validateCreateLoan({ itemId: "i1", borrowerName: "ก", quantity: 1, borrowedAt: "2026-06-02", borrowPhotoIds: ["a", "b", "c"] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.borrowPhotoIds).toEqual(["a", "b", "c"]);
      expect(r.data.borrowPhotoId).toBe("a");
    }
  });
  it("rejects more than the max number of borrow photos", () => {
    const many = Array.from({ length: MAX_LOAN_PHOTOS + 1 }, (_, i) => `p${i}`);
    expect(validateCreateLoan({ itemId: "i1", borrowerName: "ก", quantity: 1, borrowedAt: "2026-06-02", borrowPhotoIds: many }).success).toBe(false);
  });
  it("requires item, borrower, positive quantity and valid date", () => {
    expect(validateCreateLoan({ ...base, itemId: "" }).success).toBe(false);
    expect(validateCreateLoan({ ...base, borrowerName: "" }).success).toBe(false);
    expect(validateCreateLoan({ ...base, quantity: 0 }).success).toBe(false);
    expect(validateCreateLoan({ ...base, borrowedAt: "06/02/2026" }).success).toBe(false);
  });
});

describe("return loan validation", () => {
  it("accepts a full return with no settlement", () => {
    const r = validateReturnLoan({ returnedQty: 2, returnedAt: "2026-06-05" });
    expect(r.success).toBe(true);
  });
  it("validates a cash settlement (requires a positive amount)", () => {
    expect(validateReturnLoan({ returnedQty: 1, returnedAt: "2026-06-05", settlement: { settlementType: "cash" } }).success).toBe(false);
    const ok = validateReturnLoan({ returnedQty: 1, returnedAt: "2026-06-05", settlement: { settlementType: "cash", cashAmountSatang: 50000 } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.settlement?.cashAmountSatang).toBe(50000);
  });
  it("accepts a replacement settlement with a note", () => {
    const ok = validateReturnLoan({ returnedQty: 0, returnedAt: "2026-06-05", settlement: { settlementType: "replacement", replacementNote: "ซื้อเต็นท์ใหม่ 1 หลัง" } });
    expect(ok.success).toBe(true);
  });
  it("rejects an unknown settlement type", () => {
    expect(validateReturnLoan({ returnedQty: 1, returnedAt: "2026-06-05", settlement: { settlementType: "freebie" } }).success).toBe(false);
  });
});

describe("loanShortage", () => {
  it("never goes negative", () => {
    expect(loanShortage(5, 3)).toBe(2);
    expect(loanShortage(5, 5)).toBe(0);
    expect(loanShortage(5, 9)).toBe(0);
  });
});
