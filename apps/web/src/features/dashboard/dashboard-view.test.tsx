import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DashboardApi, DashboardView } from "./dashboard";
import {
  DashboardCards,
  DashboardPage,
  DashboardQueues,
  DashboardRecentDonations,
} from "./dashboard-view";

const financeView: DashboardView = {
  month: "2026-05",
  financial: { month: "2026-05", incomeSatang: "100000", expenseSatang: "30000", balanceSatang: "70000" },
  newDonorsThisMonth: 4,
  awaitingReceiptCount: 2,
  awaitingReconciliationCount: 1,
  recentDonations: [
    { id: "d1", donorName: "คุณสมชาย ใจบุญ", amountSatang: "50000", method: "cash", donationDate: "2026-05-20", status: "confirmed" },
  ],
};

const staffView: DashboardView = { ...financeView, financial: null, recentDonations: [] };

describe("dashboard view", () => {
  it("shows income/expense/balance + new-donor cards for finance", () => {
    const html = renderToStaticMarkup(<DashboardCards view={financeView} />);
    expect(html).toContain("รับเดือนนี้");
    expect(html).toContain("฿1,000.00");
    expect(html).toContain("฿300.00");
    expect(html).toContain("฿700.00");
    expect(html).toContain("ผู้บริจาคใหม่เดือนนี้");
  });

  it("hides money from a restricted (staff) view but keeps the operational card", () => {
    const html = renderToStaticMarkup(<DashboardCards view={staffView} />);
    expect(html).not.toContain("฿");
    expect(html).toContain("เฉพาะผู้ดูแล/ฝ่ายการเงิน");
    expect(html).toContain("ผู้บริจาคใหม่เดือนนี้");
  });

  it("shows the work queues with Thai labels", () => {
    const html = renderToStaticMarkup(<DashboardQueues view={financeView} />);
    expect(html).toContain("รอออกใบอนุโมทนา");
    expect(html).toContain("รอกระทบยอด");
  });

  it("renders recent donations for finance, empty state when none, and restricted note for staff", () => {
    expect(renderToStaticMarkup(<DashboardRecentDonations view={financeView} />)).toContain("คุณสมชาย ใจบุญ");
    expect(
      renderToStaticMarkup(<DashboardRecentDonations view={{ ...financeView, recentDonations: [] }} />),
    ).toContain("ยังไม่มีรายการบริจาคล่าสุด");
    expect(renderToStaticMarkup(<DashboardRecentDonations view={staffView} />)).toContain(
      "เฉพาะผู้ดูแล/ฝ่ายการเงิน",
    );
  });

  it("page shell renders the heading and a loading state before data arrives", () => {
    const api: DashboardApi = { get: async () => financeView };
    const html = renderToStaticMarkup(<DashboardPage api={api} />);
    expect(html).toContain("แดชบอร์ดการเงิน");
    expect(html).toContain("กำลังโหลด");
  });
});
