import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignDonations } from "./design-backed-pages";
import type { DonationsApi } from "./donations/donations";
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
  await act(async () => {
    (el as HTMLElement).click();
  });
}
async function setInput(el: Element | null, value: string): Promise<void> {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
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

const donorsApi = {
  list: vi.fn(async () => [{ id: "d1", displayName: "คุณวิภา รัตนากร", donorType: "person", tags: [], createdAt: "", updatedAt: "", legalName: null, email: null, phone: null, lineId: null, address: null, taxId: null, notes: null, consent: true } as DonorRecord]),
  create: vi.fn(),
} as unknown as DonorsApi;

describe("DesignDonations — wired to POST /donations", () => {
  it("validates, posts the donation (baht→satang) and confirms via toast", async () => {
    const create = vi.fn(async () => ({}) as never);
    const api = { list: vi.fn(), create, void: vi.fn() } as unknown as DonationsApi;
    const container = await mount(<DesignDonations api={api} donorsApi={donorsApi} today="2026-06-02" />);

    // pick the 5,000 preset, then submit
    const presetBtn = Array.from(container.querySelectorAll(".chip")).find((b) => b.textContent?.includes("5,000"));
    await click(presetBtn ?? null);
    const submitBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("บันทึกการบริจาค"));
    await click(submitBtn ?? null);

    expect(create).toHaveBeenCalledTimes(1);
    const arg = (create.mock.calls[0] as unknown as [{ amountSatang: number; donationDate: string }])[0];
    expect(arg.amountSatang).toBe(500000); // 5,000 baht -> satang
    expect(arg.donationDate).toBe("2026-06-02");
    expect(container.textContent).toContain("บันทึกการบริจาคแล้ว");
  });

  it("blocks submit and shows a field error when the amount is empty", async () => {
    const create = vi.fn();
    const api = { list: vi.fn(), create, void: vi.fn() } as unknown as DonationsApi;
    const container = await mount(<DesignDonations api={api} donorsApi={donorsApi} today="2026-06-02" />);
    const submitBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("บันทึกการบริจาค"));
    await click(submitBtn ?? null);
    expect(create).not.toHaveBeenCalled();
    expect(container.querySelector(".error-text")).not.toBeNull();
  });

  it("lists recent donations with issue-receipt and void actions (confirmed rows only)", async () => {
    const baseDonation = {
      donorId: "d1", currency: "THB", method: "cash", note: null, fundAccountId: null,
      createdAt: "2026-06-02T00:00:00.000Z", updatedAt: "2026-06-02T00:00:00.000Z",
    };
    const list = vi.fn(async () => [
      { ...baseDonation, id: "don-1", amountSatang: "500000", donationDate: "2026-06-02", status: "confirmed" },
      { ...baseDonation, id: "don-2", amountSatang: "100000", donationDate: "2026-06-01", status: "cancelled" },
    ]);
    const issue = vi.fn(async () => ({ id: "rc-1", receiptNo: "RC-2569-0001", donationId: "don-1", status: "issued", issuedAt: "2026-06-02T00:00:00.000Z" }));
    const api = { list, create: vi.fn(), void: vi.fn() } as unknown as DonationsApi;
    const receiptsApi = { list: vi.fn(async () => []), issue } as unknown as import("./receipts/receipts").ReceiptsApi;
    const container = await mount(<DesignDonations api={api} donorsApi={donorsApi} receiptsApi={receiptsApi} today="2026-06-02" />);

    expect(container.textContent).toContain("รายการบริจาคล่าสุด");
    // confirmed row gets both actions; cancelled row gets none
    const issueBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "ออกใบอนุโมทนา");
    expect(issueBtn).toBeDefined();
    await click(issueBtn ?? null);
    expect(issue).toHaveBeenCalledWith("don-1");
    expect(container.textContent).toContain("ออกใบอนุโมทนาบัตรแล้ว · เลขที่ RC-2569-0001");
  });

  it("voids a donation through the reason modal (reason required)", async () => {
    const list = vi.fn(async () => [{
      id: "don-1", donorId: null, amountSatang: "500000", currency: "THB", method: "cash",
      donationDate: "2026-06-02", status: "confirmed", note: null, fundAccountId: null,
      createdAt: "2026-06-02T00:00:00.000Z", updatedAt: "2026-06-02T00:00:00.000Z",
    }]);
    const voidFn = vi.fn(async () => ({}) as never);
    const api = { list, create: vi.fn(), void: voidFn } as unknown as DonationsApi;
    const container = await mount(<DesignDonations api={api} donorsApi={donorsApi} today="2026-06-02" />);

    const voidBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "ยกเลิก");
    await click(voidBtn ?? null);
    // submitting without a reason is blocked
    const confirmBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("ยืนยันยกเลิก"));
    await click(confirmBtn ?? null);
    expect(voidFn).not.toHaveBeenCalled();
    expect(container.textContent).toContain("กรุณาระบุเหตุผลการยกเลิก");

    await setInput(container.querySelector("#void-donation-reason"), "บันทึกซ้ำ");
    await click(confirmBtn ?? null);
    expect(voidFn).toHaveBeenCalledWith("don-1", "บันทึกซ้ำ");
    expect(container.textContent).toContain("ยกเลิกการบริจาคแล้ว");
  });

  it("surfaces an API error without faking success", async () => {
    const api = { list: vi.fn(), create: vi.fn(async () => { throw new Error("เลขที่เอกสารชนกัน"); }), void: vi.fn() } as unknown as DonationsApi;
    const container = await mount(<DesignDonations api={api} donorsApi={donorsApi} today="2026-06-02" />);
    await setInput(container.querySelector('input.tnum[placeholder="0"]'), "1000");
    const submitBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("บันทึกการบริจาค"));
    await click(submitBtn ?? null);
    expect(container.textContent).toContain("เลขที่เอกสารชนกัน");
    expect(container.textContent).not.toContain("บันทึกการบริจาคแล้ว");
  });
});
