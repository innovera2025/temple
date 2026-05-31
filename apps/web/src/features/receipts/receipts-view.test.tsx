import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReceiptPreview, ReceiptView } from "./receipts";
import {
  ReceiptList,
  ReceiptPreviewCard,
  ReceiptReasonDialog,
  ReceiptsPanel,
} from "./receipts-view";

const issuedReceipt: ReceiptView = {
  id: "11111111-1111-4111-8111-111111111111",
  donationId: "22222222-2222-4222-8222-222222222222",
  receiptNo: "RCPT-000001",
  status: "issued",
  issuedAt: "2026-05-30T00:00:00.000Z",
  supersededByReceiptId: null,
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
};

const preview: ReceiptPreview = {
  receiptNo: "RCPT-000001",
  status: "issued",
  issuedAt: "2026-05-30T00:00:00.000Z",
  templeNameTh: "วัดอรุณเดโม",
  templeNameEn: "Wat Arun Demo",
  donorName: "คุณสมชาย ใจบุญ",
  amountSatang: "50000",
  amountText: "ห้าร้อยบาทถ้วน",
  donationDate: "2026-05-30",
  donationMethod: "cash",
};

describe("receipt preview card", () => {
  it("renders the temple header, number, donor, amount in digits and Thai words", () => {
    const html = renderToStaticMarkup(<ReceiptPreviewCard preview={preview} />);
    expect(html).toContain("ใบอนุโมทนาบุญ");
    expect(html).toContain("วัดอรุณเดโม");
    expect(html).toContain("RCPT-000001");
    expect(html).toContain("คุณสมชาย ใจบุญ");
    expect(html).toContain("฿500.00");
    expect(html).toContain("ห้าร้อยบาทถ้วน");
    expect(html).toContain("เงินสด");
  });

  it("renders temple master-data (header, address, footer) on the document when present", () => {
    const html = renderToStaticMarkup(
      <ReceiptPreviewCard
        preview={{
          ...preview,
          templeReceiptHeaderTh: "ในนามคณะสงฆ์วัดอรุณ",
          templeAddressTh: "123 ถนนอรุณอมรินทร์ กรุงเทพมหานคร 10600",
          templeReceiptFooterTh: "ขอบคุณที่ร่วมทำบุญ",
        }}
      />,
    );
    expect(html).toContain("ในนามคณะสงฆ์วัดอรุณ");
    expect(html).toContain("123 ถนนอรุณอมรินทร์ กรุงเทพมหานคร 10600");
    expect(html).toContain("ขอบคุณที่ร่วมทำบุญ");
  });

  it("flags a voided/superseded preview as not usable", () => {
    const html = renderToStaticMarkup(<ReceiptPreviewCard preview={{ ...preview, status: "voided" }} />);
    expect(html).toContain("ไม่ใช่ใบที่ใช้งานได้");
    expect(html).toContain("ยกเลิก");
  });
});

describe("receipt list", () => {
  it("shows an empty state in Thai", () => {
    const html = renderToStaticMarkup(
      <ReceiptList receipts={[]} onVoid={() => undefined} onReissue={() => undefined} onPreview={() => undefined} />,
    );
    expect(html).toContain("ยังไม่มีใบอนุโมทนา");
  });

  it("renders void/reissue/preview actions for an issued receipt", () => {
    const html = renderToStaticMarkup(
      <ReceiptList
        receipts={[issuedReceipt]}
        onVoid={() => undefined}
        onReissue={() => undefined}
        onPreview={() => undefined}
      />,
    );
    expect(html).toContain("RCPT-000001");
    expect(html).toContain("ออกแล้ว");
    expect(html).toContain("ดูตัวอย่าง / พิมพ์");
    expect(html).toContain("ออกใหม่แทน");
    expect(html).toContain(">ยกเลิก</button>");
  });

  it("hides void/reissue for a non-issued receipt", () => {
    const html = renderToStaticMarkup(
      <ReceiptList
        receipts={[{ ...issuedReceipt, status: "voided" }]}
        onVoid={() => undefined}
        onReissue={() => undefined}
        onPreview={() => undefined}
      />,
    );
    expect(html).toContain("ดูตัวอย่าง / พิมพ์");
    expect(html).not.toContain("ออกใหม่แทน");
    expect(html).not.toContain(">ยกเลิก</button>");
  });
});

describe("receipt reason dialog", () => {
  it("renders a titled reason prompt with a confirm label", () => {
    const html = renderToStaticMarkup(
      <ReceiptReasonDialog
        title="ยกเลิกใบอนุโมทนา"
        confirmLabel="ยืนยันการยกเลิก"
        reason=""
        submitting={false}
        onReasonChange={() => undefined}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("ยกเลิกใบอนุโมทนา");
    expect(html).toContain("เหตุผล");
    expect(html).toContain("ยืนยันการยกเลิก");
  });
});

describe("receipts panel", () => {
  it("renders an issue button and empty list on first paint", () => {
    const api = {
      list: async () => [],
      issue: async () => issuedReceipt,
      void: async () => issuedReceipt,
      reissue: async () => ({ superseded: issuedReceipt, receipt: issuedReceipt }),
      preview: async () => preview,
    };
    const html = renderToStaticMarkup(<ReceiptsPanel api={api} donationId="22222222-2222-4222-8222-222222222222" />);
    expect(html).toContain("ใบอนุโมทนา");
    expect(html).toContain("ออกใบอนุโมทนา");
    expect(html).toContain("ยังไม่มีใบอนุโมทนา");
  });
});
