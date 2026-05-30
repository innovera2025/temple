import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyDonationForm, type DonationsApi, type DonationView } from "./donations";
import {
  DonationCreateForm,
  DonationsEmptyState,
  DonationsPage,
  DonationTable,
  DonationVoidDialog,
} from "./donations-view";

const sampleDonation: DonationView = {
  id: "11111111-1111-4111-8111-111111111111",
  donorId: null,
  amountSatang: "50000",
  currency: "THB",
  method: "cash",
  donationDate: "2026-05-30",
  status: "confirmed",
  note: null,
  fundAccountId: null,
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
};

describe("donations view", () => {
  it("empty state shows Thai guidance", () => {
    const html = renderToStaticMarkup(<DonationsEmptyState />);
    expect(html).toContain("ยังไม่มีรายการบริจาค");
  });

  it("table falls back to the empty state when there are no donations", () => {
    const html = renderToStaticMarkup(<DonationTable donations={[]} onVoid={() => undefined} />);
    expect(html).toContain("ยังไม่มีรายการบริจาค");
  });

  it("renders donation rows with baht amount, Thai method/status, and a void action when confirmed", () => {
    const html = renderToStaticMarkup(<DonationTable donations={[sampleDonation]} onVoid={() => undefined} />);
    expect(html).toContain("฿500.00");
    expect(html).toContain("เงินสด");
    expect(html).toContain("ยืนยันแล้ว");
    expect(html).toContain("ไม่ระบุผู้บริจาค");
    expect(html).toContain(">ยกเลิก</button>");
  });

  it("omits the void action for a cancelled donation", () => {
    const cancelled: DonationView = { ...sampleDonation, status: "cancelled" };
    const html = renderToStaticMarkup(<DonationTable donations={[cancelled]} onVoid={() => undefined} />);
    expect(html).toContain("ยกเลิกแล้ว");
    expect(html).not.toContain(">ยกเลิก</button>");
  });

  it("create form renders all Thai fields, method options, and submit label", () => {
    const html = renderToStaticMarkup(
      <DonationCreateForm
        values={emptyDonationForm("2026-05-30")}
        errors={[]}
        submitting={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(html).toContain("จำนวนเงิน (บาท)");
    expect(html).toContain("ช่องทางการบริจาค");
    expect(html).toContain("วันที่บริจาค");
    expect(html).toContain("โอนเงิน");
    expect(html).toContain("บันทึกการบริจาค");
  });

  it("create form shows an inline field error", () => {
    const html = renderToStaticMarkup(
      <DonationCreateForm
        values={emptyDonationForm("2026-05-30")}
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
      <DonationVoidDialog
        donation={sampleDonation}
        reason=""
        submitting={false}
        onReasonChange={() => undefined}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("เหตุผลในการยกเลิก");
    expect(html).toContain("ยืนยันการยกเลิก");
    expect(html).toContain("฿500.00");
  });

  it("page shell renders the form and an empty list on first paint", () => {
    const api: DonationsApi = {
      list: async () => [],
      create: async () => sampleDonation,
      void: async () => sampleDonation,
    };
    const html = renderToStaticMarkup(<DonationsPage api={api} today="2026-05-30" />);
    expect(html).toContain("รับบริจาค");
    expect(html).toContain("บันทึกการบริจาค");
    expect(html).toContain("ยังไม่มีรายการบริจาค");
  });
});
