import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignReceipt } from "./design-backed-pages";
import type { ReceiptsApi, ReceiptView } from "./receipts/receipts";
import type { DonationsApi, DonationView } from "./donations/donations";
import type { DonorRecord, DonorsApi } from "./donors/donors";

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
async function setValue(el: Element | null, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set?.call(el, value);
    el?.dispatchEvent(new Event("input", { bubbles: true }));
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

const receipt: ReceiptView = {
  id: "r1", donationId: "dn1", receiptNo: "RCPT-000142", status: "issued",
  issuedAt: "2569-06-04T03:00:00.000Z", supersededByReceiptId: null, createdAt: "", updatedAt: "",
};
const donation = { id: "dn1", donorId: "do1", amountSatang: "500000", currency: "THB", method: "qr", donationDate: "2569-06-04", status: "confirmed", note: null, fundAccountId: null, createdAt: "", updatedAt: "" } as DonationView;
const donor = { id: "do1", displayName: "คุณวิภา รัตนากร", donorType: "person", tags: [], createdAt: "", updatedAt: "", legalName: null, email: null, phone: null, lineId: null, address: "เชียงใหม่", taxId: null, notes: null, consent: true } as DonorRecord;

function apis(over: Partial<ReceiptsApi> = {}) {
  return {
    api: { list: vi.fn(async () => [receipt]), issue: vi.fn(), void: vi.fn(async () => receipt), reissue: vi.fn(), ...over } as unknown as ReceiptsApi,
    donationsApi: { list: vi.fn(async () => [donation]) } as unknown as DonationsApi,
    donorsApi: { list: vi.fn(async () => [donor]) } as unknown as DonorsApi,
  };
}

describe("DesignReceipt — wired to /receipts (+ donations/donors join)", () => {
  it("renders the real receipt list and document with joined donor + amount + Thai baht text", async () => {
    const { api, donationsApi, donorsApi } = apis();
    const container = await mount(<DesignReceipt api={api} donationsApi={donationsApi} donorsApi={donorsApi} />);
    expect(api.list).toHaveBeenCalled();
    const text = container.textContent ?? "";
    expect(text).toContain("RCPT-000142");
    expect(text).toContain("คุณวิภา รัตนากร");
    expect(text).toContain("฿5,000.00");
    expect(text).toContain("ห้าพันบาทถ้วน"); // bahtText(500000)
    expect(text).toContain("ออกแล้ว"); // receiptStatusLabel("issued")
  });

  it("voids the selected receipt with a reason via the modal", async () => {
    const { api, donationsApi, donorsApi } = apis();
    const container = await mount(<DesignReceipt api={api} donationsApi={donationsApi} donorsApi={donorsApi} />);
    await click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("ยกเลิกใบ")) ?? null);
    expect(container.querySelector(".modal")).not.toBeNull();
    await setValue(container.querySelector(".modal textarea"), "ระบุยอดผิด");
    await click(Array.from(container.querySelectorAll(".modal button")).find((b) => b.textContent?.includes("ยืนยันยกเลิก")) ?? null);
    expect(api.void).toHaveBeenCalledWith("r1", "ระบุยอดผิด");
  });

  it("shows an empty state when no receipts are issued yet", async () => {
    const api = { list: vi.fn(async () => [] as ReceiptView[]), issue: vi.fn(), void: vi.fn(), reissue: vi.fn() } as unknown as ReceiptsApi;
    const container = await mount(<DesignReceipt api={api} />);
    expect(container.textContent).toContain("ยังไม่มีใบอนุโมทนาบัตร");
  });
});
