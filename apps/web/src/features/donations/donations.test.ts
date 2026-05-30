import { describe, expect, it, vi } from "vitest";
import {
  buildDonationQuery,
  createDonationsApiClient,
  displayBaht,
  methodLabel,
  statusLabel,
  validateDonationForm,
  validateVoidReason,
} from "./donations";

describe("validateDonationForm", () => {
  it("converts baht to integer satang and accepts a valid form", () => {
    const result = validateDonationForm({ amountBaht: "100.50", method: "cash", donationDate: "2026-05-30" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amountSatang).toBe(10050);
      expect(result.data.method).toBe("cash");
    }
  });

  it("converts whole and large baht amounts exactly", () => {
    const small = validateDonationForm({ amountBaht: "1", method: "qr", donationDate: "2026-05-30" });
    const large = validateDonationForm({ amountBaht: "1234.5", method: "qr", donationDate: "2026-05-30" });
    expect(small.success && small.data.amountSatang).toBe(100);
    expect(large.success && large.data.amountSatang).toBe(123450);
  });

  it("rejects empty / non-numeric amount with a Thai message", () => {
    const result = validateDonationForm({ amountBaht: "", method: "cash", donationDate: "2026-05-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.message).toContain("จำนวนเงิน");
    }
  });

  it("rejects zero and negative amounts via the shared validator", () => {
    expect(validateDonationForm({ amountBaht: "0", method: "cash", donationDate: "2026-05-30" }).success).toBe(false);
    expect(validateDonationForm({ amountBaht: "-5", method: "cash", donationDate: "2026-05-30" }).success).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(
      validateDonationForm({ amountBaht: "10", method: "cash", donationDate: "2026-13-40" }).success,
    ).toBe(false);
  });

  it("trims optional donor/note and omits blanks", () => {
    const result = validateDonationForm({
      amountBaht: "10",
      method: "qr",
      donationDate: "2026-05-30",
      donorId: "   ",
      note: "  ทำบุญวันเกิด  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.donorId).toBeUndefined();
      expect(result.data.note).toBe("ทำบุญวันเกิด");
    }
  });
});

describe("validateVoidReason", () => {
  it("requires a non-empty reason", () => {
    expect(validateVoidReason("   ").success).toBe(false);
    expect(validateVoidReason("บันทึกผิด").success).toBe(true);
  });
});

describe("formatting and labels", () => {
  it("formats integer satang as grouped baht", () => {
    expect(displayBaht("100050")).toBe("฿1,000.50");
    expect(displayBaht(0)).toBe("฿0.00");
    expect(displayBaht("123456789")).toBe("฿1,234,567.89");
  });

  it("maps method and status codes to Thai", () => {
    expect(methodLabel("bank_transfer")).toBe("โอนเงิน");
    expect(methodLabel("qr")).toBe("QR");
    expect(statusLabel("confirmed")).toBe("ยืนยันแล้ว");
    expect(statusLabel("cancelled")).toBe("ยกเลิกแล้ว");
  });
});

describe("donations API client", () => {
  it("builds query strings from filters", () => {
    expect(buildDonationQuery({})).toBe("");
    expect(buildDonationQuery({ method: "cash", status: "confirmed" })).toBe("?method=cash&status=confirmed");
  });

  it("sends the bearer token and parses the created donation", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ donation: { id: "d1", amountSatang: "100" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createDonationsApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const donation = await api.create({ amountSatang: 100, method: "cash", donationDate: "2026-05-30" });
    expect(donation.id).toBe("d1");

    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("surfaces the API's Thai error message on failure", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "ข้อมูลไม่ถูกต้อง" } }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createDonationsApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(
      api.create({ amountSatang: 0, method: "cash", donationDate: "2026-05-30" }),
    ).rejects.toThrow("ข้อมูลไม่ถูกต้อง");
  });
});
