import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignLedger } from "./design-backed-pages";
import type { LedgerAccountView, LedgerApi, LedgerEntryView, LedgerSummaryView } from "./ledger/ledger";

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
async function click(el: Element | null): Promise<void> {
  await act(async () => { (el as HTMLElement).click(); });
}
function findButton(root: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.includes(text)) ?? null;
}
// Set a controlled <input>/<select> the way React expects (native setter + the event React listens to).
async function setControl(el: Element | null, value: string): Promise<void> {
  const isSelect = el instanceof HTMLSelectElement;
  const proto = isSelect ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el?.dispatchEvent(new Event(isSelect ? "change" : "input", { bubbles: true }));
  });
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
      listAccounts: vi.fn(async () => [] as LedgerAccountView[]),
    } as unknown as LedgerApi;
    const container = await mount(<DesignLedger api={api} today="2026-06-02" />);
    expect(container.textContent).toContain("ไม่พบรายการบัญชี");
  });

  it("surfaces a load error", async () => {
    const api = {
      listEntries: vi.fn(async () => { throw new Error("boom"); }),
      summary: vi.fn(async () => SUMMARY),
      listAccounts: vi.fn(async () => [] as LedgerAccountView[]),
    } as unknown as LedgerApi;
    const container = await mount(<DesignLedger api={api} today="2026-06-02" />);
    expect(container.textContent).toContain("โหลดข้อมูลบัญชีไม่สำเร็จ");
  });

  it("exports the ledger CSV via the reports endpoint", async () => {
    const api = {
      listEntries: vi.fn(async () => [] as LedgerEntryView[]),
      summary: vi.fn(async () => SUMMARY),
      listAccounts: vi.fn(async () => [] as LedgerAccountView[]),
    } as unknown as LedgerApi;
    const reportsApi = { get: vi.fn(async () => ({ type: "ledger", csv: "a,b\n1,2", count: 1, generatedAt: "" })) } as unknown as Parameters<typeof DesignLedger>[0]["reportsApi"];
    const container = await mount(<DesignLedger api={api} reportsApi={reportsApi} today="2026-06-02" />);
    await click(findButton(container, "ส่งออก"));
    expect((reportsApi as unknown as { get: ReturnType<typeof vi.fn> }).get).toHaveBeenCalledWith("ledger");
  });

  it("opens the add-entry modal and creates a ledger entry when canWrite", async () => {
    const created = entry({ entryNo: "LEDG-000099" });
    const api = {
      listEntries: vi.fn(async () => [] as LedgerEntryView[]),
      summary: vi.fn(async () => SUMMARY),
      listAccounts: vi.fn(async () => [
        { id: "11111111-1111-4111-8111-111111111111", code: "4000", nameTh: "รายรับเงินบริจาค", accountType: "revenue", direction: "income", isActive: true },
      ] as unknown as LedgerAccountView[]),
      create: vi.fn(async () => created),
      void: vi.fn(), reconcile: vi.fn(), listPeriods: vi.fn(), closePeriod: vi.fn(),
    } as unknown as LedgerApi;

    const container = await mount(<DesignLedger api={api} today="2026-06-02" canWrite />);
    // not a permission problem: the button is now actionable for writers
    await click(findButton(container, "เพิ่มรายการ"));
    expect(container.querySelector(".modal")).not.toBeNull();

    await setControl(container.querySelector(".modal select"), "11111111-1111-4111-8111-111111111111");
    await setControl(container.querySelector(".modal input[inputmode='decimal']"), "1500");
    await click(Array.from(container.querySelectorAll(".modal button")).find((b) => b.textContent?.includes("บันทึก")) ?? null);

    expect(api.create).toHaveBeenCalled();
    const arg = ((api.create as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] ?? {}) as { accountId: string; amountSatang: number };
    expect(arg.accountId).toBe("11111111-1111-4111-8111-111111111111");
    expect(arg.amountSatang).toBe(150000); // 1500 บาท -> สตางค์
  });
});
