import { describe, expect, it, vi } from "vitest";
import type { LedgerAccountView, LedgerEntryView } from "@wat/shared";
import {
  accountTypeLabel,
  buildLedgerQuery,
  canVoidEntry,
  createLedgerApiClient,
  directionLabel,
  displayBaht,
  periodStatusLabel,
  postableAccounts,
  statusLabel,
  validateClosePeriodForm,
  validateLedgerEntryForm,
  validateVoidReason,
} from "./ledger";

const account = "11111111-1111-4111-8111-111111111111";

describe("validateLedgerEntryForm", () => {
  it("converts baht to integer satang and accepts a valid form", () => {
    const result = validateLedgerEntryForm({
      accountId: account,
      amountBaht: "300.50",
      entryDate: "2026-05-20",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amountSatang).toBe(30050);
      expect(result.data.accountId).toBe(account);
    }
  });

  it("requires a valid account id", () => {
    const result = validateLedgerEntryForm({ accountId: "", amountBaht: "10", entryDate: "2026-05-20" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.field === "accountId")).toBe(true);
    }
  });

  it("rejects empty / non-numeric amount with a Thai message", () => {
    const result = validateLedgerEntryForm({ accountId: account, amountBaht: "", entryDate: "2026-05-20" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.message).toContain("จำนวนเงิน");
    }
  });

  it("rejects zero, negative amounts, and invalid dates via the shared validator", () => {
    expect(validateLedgerEntryForm({ accountId: account, amountBaht: "0", entryDate: "2026-05-20" }).success).toBe(false);
    expect(validateLedgerEntryForm({ accountId: account, amountBaht: "-5", entryDate: "2026-05-20" }).success).toBe(false);
    expect(validateLedgerEntryForm({ accountId: account, amountBaht: "10", entryDate: "2026-13-40" }).success).toBe(false);
  });

  it("trims optional payee/note and omits blanks", () => {
    const result = validateLedgerEntryForm({
      accountId: account,
      amountBaht: "10",
      entryDate: "2026-05-20",
      payee: "  ร้านค้า  ",
      note: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payee).toBe("ร้านค้า");
      expect(result.data.note).toBeUndefined();
    }
  });
});

describe("validateVoidReason", () => {
  it("requires a non-empty reason", () => {
    expect(validateVoidReason("   ").success).toBe(false);
    expect(validateVoidReason("บันทึกซ้ำ").success).toBe(true);
  });
});

describe("formatting, labels, and helpers", () => {
  it("formats integer satang as grouped baht", () => {
    expect(displayBaht("100050")).toBe("฿1,000.50");
    expect(displayBaht("-7000")).toBe("฿-70.00");
  });

  it("keeps full precision for large satang totals (no JS double rounding)", () => {
    // 9007199254740993 satang > 2^53; Number() would round it to ...992.
    // BigInt formatting must preserve the exact value.
    expect(displayBaht("900719925474099300")).toBe("฿9,007,199,254,740,993.00");
  });

  it("maps status, direction, and account-type codes to Thai", () => {
    expect(statusLabel("posted")).toBe("บันทึกแล้ว");
    expect(statusLabel("voided")).toBe("ยกเลิกแล้ว");
    expect(directionLabel("income")).toBe("รายรับ");
    expect(directionLabel("expense")).toBe("รายจ่าย");
    expect(directionLabel(null)).toBe("—");
    expect(accountTypeLabel("expense")).toBe("รายจ่าย");
  });

  it("keeps only active revenue/expense accounts as postable", () => {
    const accounts: LedgerAccountView[] = [
      { id: "a", code: "1000", nameTh: "เงินสด", accountType: "asset", direction: null, isActive: true },
      { id: "b", code: "4000", nameTh: "บริจาค", accountType: "revenue", direction: "income", isActive: true },
      { id: "c", code: "5000", nameTh: "ค่าใช้จ่าย", accountType: "expense", direction: "expense", isActive: true },
      { id: "d", code: "5990", nameTh: "ปิด", accountType: "expense", direction: "expense", isActive: false },
    ];
    expect(postableAccounts(accounts).map((a) => a.code)).toEqual(["4000", "5000"]);
  });

  it("only allows voiding posted, non-donation-linked entries", () => {
    const base: LedgerEntryView = {
      id: "e1",
      entryNo: "LEDG-000001",
      accountId: "a",
      accountCode: "5000",
      accountNameTh: "ค่าใช้จ่าย",
      accountType: "expense",
      direction: "expense",
      amountSatang: "30000",
      entryDate: "2026-05-20",
      status: "posted",
      payee: null,
      description: null,
      reconciledAt: null,
      donationId: null,
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
    };
    expect(canVoidEntry(base)).toBe(true);
    expect(canVoidEntry({ ...base, status: "voided" })).toBe(false);
    expect(canVoidEntry({ ...base, donationId: "d1" })).toBe(false);
  });
});

describe("ledger API client", () => {
  it("builds query strings from filters", () => {
    expect(buildLedgerQuery({})).toBe("");
    expect(buildLedgerQuery({ direction: "expense", status: "posted" })).toBe(
      "?status=posted&direction=expense",
    );
  });

  it("sends the bearer token and parses the created entry", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ entry: { id: "e1", amountSatang: "30000" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createLedgerApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const entry = await api.create({ accountId: account, amountSatang: 30000, entryDate: "2026-05-20" });
    expect(entry.id).toBe("e1");

    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("parses the monthly summary", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ summary: { incomeSatang: "100000", expenseSatang: "30000", balanceSatang: "70000" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const api = createLedgerApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const summary = await api.summary({ month: "2026-05" });
    expect(summary.balanceSatang).toBe("70000");
    expect(fetchFn.mock.calls[0]?.[0]).toContain("/ledger/summary?month=2026-05");
  });

  it("surfaces the API's Thai error message on failure", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "บัญชีไม่ถูกต้องสำหรับบันทึกรายรับ/รายจ่าย" } }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createLedgerApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(
      api.create({ accountId: account, amountSatang: 100, entryDate: "2026-05-20" }),
    ).rejects.toThrow("บัญชีไม่ถูกต้อง");
  });
});

describe("reconciliation period logic + client", () => {
  it("maps period status to Thai", () => {
    expect(periodStatusLabel("open")).toBe("เปิดอยู่");
    expect(periodStatusLabel("closed")).toBe("ปิดงวดแล้ว");
  });

  it("validates a close-period range (end must not precede start; real dates)", () => {
    expect(validateClosePeriodForm({ periodStart: "2026-05-01", periodEnd: "2026-05-31" }).success).toBe(true);
    expect(validateClosePeriodForm({ periodStart: "2026-05-31", periodEnd: "2026-05-01" }).success).toBe(false);
    expect(validateClosePeriodForm({ periodStart: "2026-13-40", periodEnd: "2026-05-31" }).success).toBe(false);
  });

  it("reconcile posts to the reconcile endpoint", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ entry: { id: "e1", reconciledAt: "2026-05-20T00:00:00.000Z" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createLedgerApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const entry = await api.reconcile("e1");
    expect(entry.id).toBe("e1");
    expect(fetchFn.mock.calls[0]?.[0]).toContain("/ledger/entries/e1/reconcile");
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("closePeriod posts the range; listPeriods reads them", async () => {
    const closeFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ period: { id: "p1", status: "closed" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const closeApi = createLedgerApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: closeFn as unknown as typeof fetch,
    });
    const period = await closeApi.closePeriod({ periodStart: "2026-05-01", periodEnd: "2026-05-31" });
    expect(period.id).toBe("p1");
    expect(closeFn.mock.calls[0]?.[0]).toContain("/ledger/periods/close");

    const listFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ periods: [{ id: "p1", status: "closed" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const listApi = createLedgerApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: listFn as unknown as typeof fetch,
    });
    const periods = await listApi.listPeriods();
    expect(periods).toHaveLength(1);
    expect(listFn.mock.calls[0]?.[0]).toContain("/ledger/periods");
  });
});
