import { describe, expect, it, vi } from "vitest";
import {
  buildReceiptQuery,
  createReceiptsApiClient,
  displayBaht,
  receiptStatusLabel,
  validateReissueReason,
  validateVoidReason,
} from "./receipts";

describe("receipt formatting and labels", () => {
  it("formats baht and maps statuses to Thai", () => {
    expect(displayBaht("50000")).toBe("฿500.00");
    expect(receiptStatusLabel("issued")).toBe("ออกแล้ว");
    expect(receiptStatusLabel("voided")).toBe("ยกเลิก");
    expect(receiptStatusLabel("superseded")).toBe("ออกใหม่แทนแล้ว");
  });

  it("builds receipt query strings", () => {
    expect(buildReceiptQuery({})).toBe("");
    expect(buildReceiptQuery({ donationId: "d1", status: "issued" })).toBe("?donationId=d1&status=issued");
  });
});

describe("void / reissue reason validation", () => {
  it("requires a non-empty reason for both", () => {
    expect(validateVoidReason("  ").success).toBe(false);
    expect(validateVoidReason("พิมพ์ผิด").success).toBe(true);
    expect(validateReissueReason("").success).toBe(false);
    expect(validateReissueReason("แก้ชื่อ").success).toBe(true);
  });
});

describe("receipts API client", () => {
  it("issues with bearer token and parses the receipt", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ receipt: { id: "r1", receiptNo: "RCPT-000001" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createReceiptsApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const receipt = await api.issue("11111111-1111-4111-8111-111111111111");
    expect(receipt.receiptNo).toBe("RCPT-000001");
    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("parses a reissue into superseded + new receipt", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ superseded: { id: "old", status: "superseded" }, receipt: { id: "new", status: "issued" } }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    const api = createReceiptsApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await api.reissue("old", "แก้ไข");
    expect(result.superseded.id).toBe("old");
    expect(result.receipt.id).toBe("new");
  });

  it("surfaces the API Thai error message", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "มีใบอนุโมทนาที่ใช้งานอยู่แล้ว" } }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createReceiptsApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.issue("d1")).rejects.toThrow("มีใบอนุโมทนาที่ใช้งานอยู่แล้ว");
  });
});
