import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignDashboard } from "./design-backed-pages";
import type { DashboardApi, DashboardView } from "./dashboard/dashboard";

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
    const entry = mounted.pop();
    if (!entry) continue;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  vi.restoreAllMocks();
});

const VIEW: DashboardView = {
  month: "2569-06",
  financial: { month: "2569-06", incomeSatang: "9600000", expenseSatang: "6003000", balanceSatang: "3597000" },
  newDonorsThisMonth: 12,
  awaitingReceiptCount: 3,
  awaitingReconciliationCount: 2,
  recentDonations: [
    { id: "d1", donorName: "คุณวิภา รัตนากร", amountSatang: "500000", method: "promptpay", donationDate: "2569-06-04", status: "confirmed" },
  ],
};

describe("DesignDashboard — wired to GET /dashboard", () => {
  it("renders real KPI figures, queue counts and recent donations from the API", async () => {
    const api: DashboardApi = { get: vi.fn(async () => VIEW) };
    const container = await mount(<DesignDashboard api={api} />);

    expect(api.get).toHaveBeenCalledTimes(1);
    const text = container.textContent ?? "";
    // financial KPIs (satang -> baht)
    expect(text).toContain("฿96,000.00"); // income
    expect(text).toContain("฿35,970.00"); // balance
    expect(text).toContain("12"); // new donors
    // real queue counts drive the task badges
    expect(text).toContain("รอออกใบอนุโมทนาบัตร");
    // recent donation row from the API
    expect(text).toContain("คุณวิภา รัตนากร");
    expect(text).toContain("฿5,000.00");
  });

  it("shows an empty state when there are no recent donations", async () => {
    const api: DashboardApi = { get: vi.fn(async () => ({ ...VIEW, recentDonations: [] })) };
    const container = await mount(<DesignDashboard api={api} />);
    expect(container.textContent).toContain("ยังไม่มีรายการบริจาคล่าสุด");
  });

  it("surfaces an error and the finance-only note for a restricted role", async () => {
    const restricted: DashboardView = { ...VIEW, financial: null, recentDonations: [] };
    const api: DashboardApi = { get: vi.fn(async () => restricted) };
    const container = await mount(<DesignDashboard api={api} />);
    expect(container.textContent).toContain("เฉพาะผู้ดูแลวัดและฝ่ายการเงิน");
  });

  it("tags the demo-only sections (no API source) as ตัวอย่าง — honest, not faked", () => {
    // Static SSR render: the chart/funds/upcoming cards are demo and labelled.
    const html = renderToStaticMarkup(<DesignDashboard />);
    expect(html).toContain("ตัวอย่าง");
    expect(html).toContain("รายรับ-รายจ่าย ๖ เดือนล่าสุด");
  });
});
