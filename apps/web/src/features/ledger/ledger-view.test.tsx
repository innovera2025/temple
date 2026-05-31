import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LedgerAccountView, LedgerEntryView, LedgerSummaryView } from "@wat/shared";
import { emptyLedgerForm, type LedgerApi, type ReconciliationPeriodView } from "./ledger";
import {
  ClosePeriodForm,
  LedgerEntriesEmptyState,
  LedgerEntryForm,
  LedgerPage,
  LedgerPeriodList,
  LedgerSummaryCards,
  LedgerTable,
  LedgerVoidDialog,
} from "./ledger-view";

const sampleEntry: LedgerEntryView = {
  id: "11111111-1111-4111-8111-111111111111",
  entryNo: "LEDG-000001",
  accountId: "acc-1",
  accountCode: "5000",
  accountNameTh: "ค่าใช้จ่ายทั่วไป",
  accountType: "expense",
  direction: "expense",
  amountSatang: "30000",
  entryDate: "2026-05-20",
  status: "posted",
  payee: "ร้านดอกไม้",
  description: null,
  reconciledAt: null,
  donationId: null,
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z",
};

const sampleAccounts: LedgerAccountView[] = [
  { id: "acc-r", code: "4000", nameTh: "รายรับเงินบริจาค", accountType: "revenue", direction: "income", isActive: true },
  { id: "acc-1", code: "5000", nameTh: "ค่าใช้จ่ายทั่วไป", accountType: "expense", direction: "expense", isActive: true },
  { id: "acc-x", code: "1000", nameTh: "เงินสด", accountType: "asset", direction: null, isActive: true },
];

const sampleSummary: LedgerSummaryView = {
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  incomeSatang: "100000",
  expenseSatang: "30000",
  balanceSatang: "70000",
  incomeCount: 1,
  expenseCount: 1,
};

describe("ledger view", () => {
  it("summary cards show Thai labels and baht amounts", () => {
    const html = renderToStaticMarkup(<LedgerSummaryCards summary={sampleSummary} />);
    expect(html).toContain("รับเดือนนี้");
    expect(html).toContain("จ่ายเดือนนี้");
    expect(html).toContain("คงเหลือ");
    expect(html).toContain("฿1,000.00");
    expect(html).toContain("฿700.00");
  });

  it("summary cards fall back to em dash before data loads", () => {
    const html = renderToStaticMarkup(<LedgerSummaryCards summary={null} />);
    expect(html).toContain("รับเดือนนี้");
    expect(html).toContain("—");
  });

  it("empty state shows Thai guidance", () => {
    const html = renderToStaticMarkup(<LedgerEntriesEmptyState />);
    expect(html).toContain("ยังไม่มีรายการบัญชี");
  });

  it("table falls back to the empty state when there are no entries", () => {
    const html = renderToStaticMarkup(<LedgerTable entries={[]} onVoid={() => undefined} />);
    expect(html).toContain("ยังไม่มีรายการบัญชี");
  });

  it("renders a posted entry with baht, direction, payee, and a void action", () => {
    const html = renderToStaticMarkup(<LedgerTable entries={[sampleEntry]} onVoid={() => undefined} />);
    expect(html).toContain("฿300.00");
    expect(html).toContain("รายจ่าย");
    expect(html).toContain("ร้านดอกไม้");
    expect(html).toContain("LEDG-000001");
    expect(html).toContain(">ยกเลิก</button>");
  });

  it("omits the void action for a voided entry", () => {
    const html = renderToStaticMarkup(
      <LedgerTable entries={[{ ...sampleEntry, status: "voided" }]} onVoid={() => undefined} />,
    );
    expect(html).toContain("ยกเลิกแล้ว");
    expect(html).not.toContain(">ยกเลิก</button>");
  });

  it("omits the void action for a donation-linked entry", () => {
    const html = renderToStaticMarkup(
      <LedgerTable entries={[{ ...sampleEntry, donationId: "d1" }]} onVoid={() => undefined} />,
    );
    expect(html).not.toContain(">ยกเลิก</button>");
  });

  it("entry form lists only postable (revenue/expense) accounts and a submit label", () => {
    const html = renderToStaticMarkup(
      <LedgerEntryForm
        values={emptyLedgerForm("2026-05-20")}
        accounts={sampleAccounts}
        errors={[]}
        submitting={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("บัญชี/หมวด");
    expect(html).toContain("4000 รายรับเงินบริจาค");
    expect(html).toContain("5000 ค่าใช้จ่ายทั่วไป");
    expect(html).not.toContain("1000 เงินสด"); // asset is not postable
    expect(html).toContain("บันทึกรายการ");
  });

  it("entry form shows an inline field error", () => {
    const html = renderToStaticMarkup(
      <LedgerEntryForm
        values={emptyLedgerForm("2026-05-20")}
        accounts={sampleAccounts}
        errors={[{ field: "amountBaht", message: "กรุณาระบุจำนวนเงิน (บาท)" }]}
        submitting={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("กรุณาระบุจำนวนเงิน (บาท)");
  });

  it("void dialog asks for a reason with Thai copy", () => {
    const html = renderToStaticMarkup(
      <LedgerVoidDialog
        entry={sampleEntry}
        reason=""
        submitting={false}
        onReasonChange={() => undefined}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("เหตุผลในการยกเลิก");
    expect(html).toContain("ยืนยันการยกเลิก");
    expect(html).toContain("LEDG-000001");
    expect(html).toContain("฿300.00");
  });

  it("page shell renders the heading, form, and empty list on first paint", () => {
    const api: LedgerApi = {
      listEntries: async () => [],
      listAccounts: async () => sampleAccounts,
      summary: async () => sampleSummary,
      create: async () => sampleEntry,
      void: async () => sampleEntry,
      reconcile: async () => sampleEntry,
      closePeriod: async () => closedPeriod,
      listPeriods: async () => [closedPeriod],
    };
    const html = renderToStaticMarkup(<LedgerPage api={api} today="2026-05-20" month="2026-05" />);
    expect(html).toContain("บัญชีรายรับรายจ่าย");
    expect(html).toContain("บันทึกรายรับ/รายจ่าย");
    expect(html).toContain("ยังไม่มีรายการบัญชี");
  });
});

const closedPeriod: ReconciliationPeriodView = {
  id: "99999999-9999-4999-8999-999999999999",
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  status: "closed",
  closedAt: "2026-06-01T00:00:00.000Z",
  closedByUserId: "user-1",
};

describe("reconciliation view", () => {
  it("renders a reconcile action and reconciled badge in the table", () => {
    const withReconcile = renderToStaticMarkup(
      <LedgerTable entries={[sampleEntry]} onVoid={() => undefined} onReconcile={() => undefined} />,
    );
    expect(withReconcile).toContain(">กระทบยอด</button>");

    const reconciled = renderToStaticMarkup(
      <LedgerTable
        entries={[{ ...sampleEntry, reconciledAt: "2026-05-21T00:00:00.000Z" }]}
        onVoid={() => undefined}
        onReconcile={() => undefined}
      />,
    );
    expect(reconciled).toContain("กระทบยอดแล้ว");
    expect(reconciled).not.toContain(">กระทบยอด</button>"); // already reconciled
  });

  it("close-period form renders Thai date fields and a submit label", () => {
    const html = renderToStaticMarkup(
      <ClosePeriodForm
        values={{ periodStart: "", periodEnd: "" }}
        errors={[]}
        submitting={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("ตั้งแต่วันที่");
    expect(html).toContain("ถึงวันที่");
    expect(html).toContain("ปิดงวดบัญชี");
  });

  it("period list shows an empty state and closed-period rows", () => {
    expect(renderToStaticMarkup(<LedgerPeriodList periods={[]} />)).toContain("ยังไม่มีการปิดงวดบัญชี");

    const html = renderToStaticMarkup(<LedgerPeriodList periods={[closedPeriod]} />);
    expect(html).toContain("2026-05-01 – 2026-05-31");
    expect(html).toContain("ปิดงวดแล้ว");
  });
});
