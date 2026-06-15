import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_OWNER_TYPES,
  FINANCIAL_EVIDENCE_OWNER_TYPES,
  isFinancialEvidenceOwnerType,
} from "./attachment";

describe("financial-evidence owner-type classification", () => {
  it("treats every owner type EXCEPT donor as financial evidence", () => {
    for (const t of ATTACHMENT_OWNER_TYPES) {
      expect(isFinancialEvidenceOwnerType(t)).toBe(t !== "donor");
    }
  });

  it("donor photos are NOT financial evidence (deletable without a reason)", () => {
    expect(isFinancialEvidenceOwnerType("donor")).toBe(false);
    expect(FINANCIAL_EVIDENCE_OWNER_TYPES.has("donor")).toBe(false);
  });

  it("the financial set is exactly the canonical owner list minus donor", () => {
    expect([...FINANCIAL_EVIDENCE_OWNER_TYPES].sort()).toEqual(
      ATTACHMENT_OWNER_TYPES.filter((t) => t !== "donor").sort(),
    );
  });

  it("unknown owner types are not financial evidence", () => {
    expect(isFinancialEvidenceOwnerType("something-else")).toBe(false);
  });
});
