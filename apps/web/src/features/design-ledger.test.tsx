import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignLedger } from "./design-backed-pages";
import type { LedgerApi, LedgerEntryView, LedgerSummaryView } from "./ledger/ledger";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; container: HTMLElement }[] = [];

async function mount(ui: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  while (mounted.length) {
    const e = mounted.pop();
    if (!e) continue;
    act(() => e.root.unmount());
    e.container.remove();
  }
  vi.restoreAllMocks();
});

const SUMMARY: LedgerSummaryView = {
  dateFrom: "2569-06-01", dateTo: "2569-06-30",
  incomeSatang: "500000", expenseSatang: "842000", balanceSatang: "-342000",
  incomeCount: 1, expenseCount: 1,
};
function entry(over: Partial<LedgerEntryView>): LedgerEntryView {
  return {
    id: "e", entryNo: "LEDG-000001", accountId: "a", accountCode: "4000", accountNameTh: "เงินบริจาค",
    accountType: "revenue", direction: "income", amountSatang: "500000", entryDate: "2569-06-04",
    status: "posted", payee: null, description: "รับบริจาค บูรณะอุโบสถ", reconciledAt: null,
    donationId: "d1", createdAt: "", updatedAt: "", ...over,
  };
}

describe("DesignLedger — wired to /ledger entries + summary", () => {
  it("renders real summary KPIs and entry rows with income/expense + status", async () => {
    const api: LedgerApi = {
      listEntries: vi.fn(async () => [
        entry({}),
        entry({ entryNo: "LEDG-000002", direction: "expense", accountNameTh: "ค่าไฟฟ้า", amountSatang: "842000", description: "ค่าไฟฟ้า พ.ค.", status: "posted", reconciledAt: "2569-06-05", donationId: null }),
      ]),
      summary: vi.fn(async () => SUMMARY),
      listAccounts: vi.fn(), listPeriods: vi.fn(), create: vi.fn(), void: vi.fn(), reconcile: vi.fn(), closePeriod: vi.fn(),
    } as unknown as LedgerApi;

    const container = await mount(<DesignLedger api={api} today="2026-06-02" />);
    const text = container.textContent ?? "";

    expect(api.listEntries).toHaveBeenCalled();
    expect(text).toContain("฿5,000.00"); // income KPI + row
    expect(text).toContain("฿8,420.00"); // expense
    expect(text).toContain("LEDG-000001");
    expect(text).toContain("เงินบริจาค");
    expect(text).toContain("กระทบยอดแล้ว"); // reconciledAt -> reconciled status
  });

  it("shows an empty state when there are no entries", async () => {
    const api = {
      listEntries: vi.fn(async () => [] as LedgerEntryView[]),
      summary: vi.fn(async () => SUMMARY),
    } as unknown as LedgerApi;
    const container = await mount(<DesignLedger api={api} today="2026-06-02" />);
    expect(container.textContent).toContain("ไม่พบรายการบัญชี");
  });

  it("surfaces a load error", async () => {
    const api = {
      listEntries: vi.fn(async () => { throw new Error("boom"); }),
      summary: vi.fn(async () => SUMMARY),
    } as unknown as LedgerApi;
    const container = await mount(<DesignLedger api={api} today="2026-06-02" />);
    expect(container.textContent).toContain("โหลดข้อมูลบัญชีไม่สำเร็จ");
  });
});
