import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignDonors } from "./design-backed-pages";
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
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
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

function donor(over: Partial<DonorRecord>): DonorRecord {
  return {
    id: "d", displayName: "คุณวิภา รัตนากร", legalName: null, donorType: "person",
    email: "wipha@example.com", phone: "081-234-5678", lineId: null, address: null,
    taxId: null, tags: ["ผู้อุปถัมภ์"], notes: null, consent: true,
    createdAt: "2569-05-02T00:00:00.000Z", updatedAt: "", ...over,
  };
}

describe("DesignDonors — list wired to /donors", () => {
  it("renders the real donor list with type, contact, tags and counts", async () => {
    const api = {
      list: vi.fn(async () => [donor({}), donor({ id: "o", displayName: "บริษัท ดีดีพัฒนา จำกัด", donorType: "organization", tags: [] })]),
      create: vi.fn(),
    } as unknown as DonorsApi;
    const container = await mount(<DesignDonors api={api} canWrite />);
    expect(api.list).toHaveBeenCalled();
    const text = container.textContent ?? "";
    expect(text).toContain("คุณวิภา รัตนากร");
    expect(text).toContain("081-234-5678");
    expect(text).toContain("ผู้อุปถัมภ์"); // tag
    expect(text).toContain("บริษัท ดีดีพัฒนา จำกัด");
  });

  it("creates a donor via the modal and reloads the list", async () => {
    const created: string[] = [];
    const api = {
      list: vi.fn(async () => created.map((n, i) => donor({ id: `d${i}`, displayName: n }))),
      create: vi.fn(async (input: { displayName: string }) => { created.push(input.displayName); return donor({ displayName: input.displayName }); }),
    } as unknown as DonorsApi;

    const container = await mount(<DesignDonors api={api} canWrite />);
    // open modal
    const addBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("เพิ่มผู้บริจาค"));
    await click(addBtn ?? null);
    expect(container.querySelector(".modal")).not.toBeNull();
    // fill name + save
    await setInput(container.querySelector(".modal .control"), "คุณสมชาย ใจบุญ");
    const saveBtn = Array.from(container.querySelectorAll(".modal button")).find((b) => b.textContent === "บันทึก");
    await click(saveBtn ?? null);

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ displayName: "คุณสมชาย ใจบุญ", donorType: "person" }));
    expect((container.textContent ?? "")).toContain("คุณสมชาย ใจบุญ");
  });

  it("hides the create action when the role cannot write", async () => {
    const api = { list: vi.fn(async () => [] as DonorRecord[]), create: vi.fn() } as unknown as DonorsApi;
    const container = await mount(<DesignDonors api={api} canWrite={false} />);
    expect(container.textContent).toContain("ยังไม่มีผู้บริจาค");
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.includes("เพิ่มผู้บริจาค"))).toBe(false);
  });
});
