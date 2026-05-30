import { describe, expect, it } from "vitest";
import { nextDocumentNumber } from "../src/tenant-context";
import { resetTenantFixtures, tenantA, tenantB } from "./db-test-utils";

describe("document number concurrency", () => {
  it("allocates unique sequential numbers per tenant under concurrent calls", async () => {
    await resetTenantFixtures();

    const tenantANumbers = await Promise.all(
      Array.from({ length: 12 }, () => nextDocumentNumber(tenantA, "receipt")),
    );
    const tenantBNumbers = await Promise.all(
      Array.from({ length: 12 }, () => nextDocumentNumber(tenantB, "receipt")),
    );

    expect([...new Set(tenantANumbers)]).toHaveLength(12);
    expect([...new Set(tenantBNumbers)]).toHaveLength(12);
    expect(tenantANumbers.sort()).toEqual([
      "RCPT-000001",
      "RCPT-000002",
      "RCPT-000003",
      "RCPT-000004",
      "RCPT-000005",
      "RCPT-000006",
      "RCPT-000007",
      "RCPT-000008",
      "RCPT-000009",
      "RCPT-000010",
      "RCPT-000011",
      "RCPT-000012",
    ]);
    expect(tenantBNumbers.sort()).toEqual(tenantANumbers);
  });
});
