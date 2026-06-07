import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemLoansPage } from "./item-loans-view";
import type { BorrowableItemView, ItemLoanView, ItemLoansApi } from "./item-loans";
import type { AttachmentsApi } from "../attachments/attachments";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; container: HTMLElement }[] = [];

async function mount(ui: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
async function click(el: Element | null): Promise<void> {
  await act(async () => { (el as HTMLElement).click(); });
}
async function setValue(el: Element | null, value: string): Promise<void> {
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el?.dispatchEvent(new Event("input", { bubbles: true }));
    el?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const byText = (root: HTMLElement, sel: string, text: string): HTMLElement | undefined =>
  Array.from(root.querySelectorAll<HTMLElement>(sel)).find((e) => e.textContent?.includes(text));

afterEach(() => {
  while (mounted.length) {
    const e = mounted.pop();
    if (!e) continue;
    act(() => e.root.unmount());
    e.container.remove();
  }
  vi.restoreAllMocks();
});

const ITEM: BorrowableItemView = { id: "i1", name: "เต็นท์", category: "equipment", unit: "หลัง", totalQty: 5, availableQty: 3, status: "active", note: null, createdAt: "", updatedAt: "" };
const LOAN: ItemLoanView = { id: "l1", loanNo: "LOAN-000001", itemId: "i1", itemName: "เต็นท์", borrowerName: "คุณสมชาย", borrowerPhone: null, quantity: 2, borrowedAt: "2026-06-02", dueAt: null, borrowPhotoId: "p1", borrowPhotoIds: ["p1"], status: "borrowed", returnedAt: null, returnedQty: null, returnNote: null, shortageQty: 0, settlement: null, createdAt: "", updatedAt: "" };
// A devotee borrow request awaiting staff approval (no photo, no stock committed yet).
const REQUEST: ItemLoanView = { id: "r1", loanNo: "LOAN-000002", itemId: "i1", itemName: "เต็นท์", borrowerName: "คุณญาติโยม", borrowerPhone: "0801112222", quantity: 1, borrowedAt: "2026-06-10", dueAt: null, borrowPhotoId: null, borrowPhotoIds: [], status: "requested", returnedAt: null, returnedQty: null, returnNote: null, shortageQty: 0, settlement: null, createdAt: "", updatedAt: "" };

function makeApi(over: Partial<ItemLoansApi> = {}): ItemLoansApi {
  return {
    listItems: vi.fn(async () => [ITEM]),
    listLoans: vi.fn(async () => [LOAN]),
    createItem: vi.fn(async () => ITEM),
    createLoan: vi.fn(async () => LOAN),
    returnLoan: vi.fn(async () => LOAN),
    approveLoan: vi.fn(async () => ({ ...REQUEST, status: "borrowed" as const, borrowPhotoIds: ["att1"] })),
    rejectLoan: vi.fn(async () => ({ ...REQUEST, status: "cancelled" as const })),
    ...over,
  };
}
const attachmentsApi = { list: vi.fn(), upload: vi.fn(async () => ({ id: "att1", ownerType: "item_loan", ownerId: "i1", fileName: "p.jpg", mimeType: "image/jpeg", byteSize: "3", createdAt: "" })) } as unknown as AttachmentsApi;

describe("ItemLoansPage — wired to /item-loans", () => {
  it("lists items (available/total) and loans (who borrowed)", async () => {
    const c = await mount(<ItemLoansPage api={makeApi()} attachmentsApi={attachmentsApi} today="2026-06-02" canWrite />);
    const text = c.textContent ?? "";
    expect(text).toContain("เต็นท์");
    expect(text).toContain("คุณสมชาย");
    expect(text).toContain("LOAN-000001");
    expect(text).toContain("3"); // availableQty
  });

  it("borrowing blocks without a photo (ถ่ายรูปก่อนยืม)", async () => {
    const api = makeApi();
    const c = await mount(<ItemLoansPage api={api} attachmentsApi={attachmentsApi} today="2026-06-02" canWrite />);
    await click(byText(c, "button", "ยืมของ") ?? null);
    await setValue(c.querySelector(".modal .form-grid .control"), "คุณเอ"); // borrower name (first field in grid)
    await click(byText(c, ".modal button", "บันทึกการยืม") ?? null);
    expect(c.textContent).toContain("ต้องแนบรูปถ่ายตอนยืมก่อนบันทึก");
    expect(api.createLoan).not.toHaveBeenCalled();
  });

  it("a short return requires a cash settlement and calls returnLoan with it", async () => {
    const api = makeApi();
    const c = await mount(<ItemLoansPage api={api} attachmentsApi={attachmentsApi} today="2026-06-02" canWrite />);
    await click(byText(c, "button", "คืน") ?? null);
    // return 0 of 2 -> shortage 2 -> settlement section appears
    await setValue(c.querySelector(".modal .form-grid .control"), "0");
    expect(c.textContent).toContain("คืนไม่ครบ");
    await click(byText(c, ".modal .seg button", "จ่ายเป็นเงิน") ?? null);
    await setValue(c.querySelector('.modal .input-prefix .control'), "150");
    await click(byText(c, ".modal button", "บันทึกการคืน") ?? null);
    expect(api.returnLoan).toHaveBeenCalledWith("l1", expect.objectContaining({ returnedQty: 0, settlement: { settlementType: "cash", cashAmountSatang: 15000 } }));
  });

  it("adds a new borrowable item", async () => {
    const api = makeApi();
    const c = await mount(<ItemLoansPage api={api} attachmentsApi={attachmentsApi} today="2026-06-02" canWrite />);
    await click(byText(c, "button", "เพิ่มสิ่งของ") ?? null);
    await setValue(c.querySelector(".modal .control"), "โต๊ะพับ");
    await click(byText(c, ".modal button", "บันทึก") ?? null);
    expect(api.createItem).toHaveBeenCalledWith(expect.objectContaining({ name: "โต๊ะพับ" }));
  });

  it("hides write actions when the role cannot write", async () => {
    const c = await mount(<ItemLoansPage api={makeApi()} attachmentsApi={attachmentsApi} today="2026-06-02" canWrite={false} />);
    expect(byText(c, "button", "เพิ่มสิ่งของ")).toBeUndefined();
    expect(byText(c, "button", "ยืมของ")).toBeUndefined();
  });

  it("lets a borrower-only role (e.g. finance) borrow but not add items", async () => {
    const c = await mount(
      <ItemLoansPage api={makeApi()} attachmentsApi={attachmentsApi} today="2026-06-02" canWrite canManageItems={false} />,
    );
    expect(byText(c, "button", "เพิ่มสิ่งของ")).toBeUndefined(); // add restricted to the temple owner (admin)
    expect(byText(c, "button", "ยืมของ")).not.toBeUndefined(); // borrowing still allowed
  });

  it("shows the devotee request queue and approving requires a photo, then calls approveLoan", async () => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
    globalThis.URL.revokeObjectURL = vi.fn();
    (attachmentsApi.upload as ReturnType<typeof vi.fn>).mockClear();
    const api = makeApi({ listLoans: vi.fn(async () => [LOAN, REQUEST]) });
    const c = await mount(<ItemLoansPage api={api} attachmentsApi={attachmentsApi} today="2026-06-10" canWrite />);
    // The queue surfaces the requested loan with the requester name.
    const queue = c.querySelector('[data-testid="loan-request-queue"]');
    expect(queue).toBeTruthy();
    expect(queue?.textContent).toContain("คำขอยืมรอยืนยัน");
    expect(queue?.textContent).toContain("คุณญาติโยม");
    expect(queue?.textContent).toContain("LOAN-000002");

    await click(byText(queue as HTMLElement, "button", "อนุมัติ") ?? null);
    // Approve blocks without a handover photo.
    await click(byText(c, ".modal button", "อนุมัติและส่งมอบ") ?? null);
    expect(c.textContent).toContain("ต้องแนบรูปถ่ายตอนส่งมอบก่อนอนุมัติ");
    expect(api.approveLoan).not.toHaveBeenCalled();

    const fileInput = c.querySelector('.modal input[type="file"]') as HTMLInputElement;
    const f1 = new File(["a"], "1.jpg", { type: "image/jpeg" });
    await act(async () => {
      Object.defineProperty(fileInput, "files", { value: [f1], configurable: true });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(byText(c, ".modal button", "อนุมัติและส่งมอบ") ?? null);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(attachmentsApi.upload).toHaveBeenCalledTimes(1);
    expect(api.approveLoan).toHaveBeenCalledWith("r1", expect.objectContaining({ borrowPhotoIds: ["att1"], borrowedAt: "2026-06-10" }));
  });

  it("rejecting a request calls rejectLoan with the reason", async () => {
    const api = makeApi({ listLoans: vi.fn(async () => [REQUEST]) });
    const c = await mount(<ItemLoansPage api={api} attachmentsApi={attachmentsApi} today="2026-06-10" canWrite />);
    const queue = c.querySelector('[data-testid="loan-request-queue"]') as HTMLElement;
    await click(byText(queue, "button", "ปฏิเสธ") ?? null);
    await setValue(c.querySelector(".modal .control"), "สิ่งของไม่ว่าง");
    await click(byText(c, ".modal button", "ยืนยันปฏิเสธ") ?? null);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(api.rejectLoan).toHaveBeenCalledWith("r1", { reason: "สิ่งของไม่ว่าง" });
  });

  it("does not show the request queue when the role cannot write", async () => {
    const c = await mount(<ItemLoansPage api={makeApi({ listLoans: vi.fn(async () => [REQUEST]) })} attachmentsApi={attachmentsApi} today="2026-06-10" canWrite={false} />);
    expect(c.querySelector('[data-testid="loan-request-queue"]')).toBeNull();
  });

  it("attaches multiple borrow photos and submits them all", async () => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
    globalThis.URL.revokeObjectURL = vi.fn();
    const api = makeApi();
    (attachmentsApi.upload as ReturnType<typeof vi.fn>).mockClear();
    const c = await mount(<ItemLoansPage api={api} attachmentsApi={attachmentsApi} today="2026-06-02" canWrite />);
    await click(byText(c, "button", "ยืมของ") ?? null);
    await setValue(c.querySelector(".modal .form-grid .control"), "คุณบี"); // borrower name
    const fileInput = c.querySelector('.modal input[type="file"]') as HTMLInputElement;
    const f1 = new File(["a"], "1.jpg", { type: "image/jpeg" });
    const f2 = new File(["b"], "2.jpg", { type: "image/jpeg" });
    await act(async () => {
      Object.defineProperty(fileInput, "files", { value: [f1, f2], configurable: true });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(c.textContent).toContain("2/10"); // both photos registered
    await click(byText(c, ".modal button", "บันทึกการยืม") ?? null);
    // save() is fire-and-forget and awaits FileReader + uploads — let those resolve.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(attachmentsApi.upload).toHaveBeenCalledTimes(2);
    const arg = ((api.createLoan as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? {}) as { borrowPhotoIds?: string[] };
    expect(arg.borrowPhotoIds).toHaveLength(2);
  });
});
