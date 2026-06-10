import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignEvents } from "./design-backed-pages";
import type { CeremoniesApi, Ceremony } from "./ceremonies/ceremonies";

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
function byText(root: HTMLElement, sel: string, text: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).find((e) => e.textContent?.includes(text)) ?? null;
}
function byExactText(root: HTMLElement, sel: string, text: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).find((e) => e.textContent?.trim() === text) ?? null;
}
async function setValue(el: Element | null, value: string): Promise<void> {
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el?.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
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

const CEREMONY = {
  id: "c1", ceremonyType: "merit", status: "planned", title: "ทอดผ้าป่าสามัคคี",
  ceremonyDate: "2569-06-12", timeNote: "09:00–14:00", location: "ศาลาการเปรียญ",
  requesterName: "ครอบครัวสุขใจ", requesterPhone: null, assignedMonks: null, monkCount: 9,
  note: null, createdAt: "", updatedAt: "",
} as unknown as Ceremony;

const REQUESTED_BOOKING = {
  ...CEREMONY, id: "c2", status: "requested", title: "ขอจองทำบุญขึ้นบ้านใหม่", requesterName: "คุณญาติโยม",
} as unknown as Ceremony;

describe("DesignEvents — wired to /ceremonies", () => {
  it("renders real ceremony rows (title, host, monk count, status)", async () => {
    const api = { list: vi.fn(async () => [CEREMONY]) } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} />);
    expect(api.list).toHaveBeenCalled();
    const text = container.textContent ?? "";
    expect(text).toContain("ทอดผ้าป่าสามัคคี");
    expect(text).toContain("ครอบครัวสุขใจ");
    expect(text).toContain("ศาลาการเปรียญ");
    expect(text).toContain("9"); // monk count
    // the month calendar is demo and tagged honestly
    expect(text).toContain("ตัวอย่าง");
  });

  it("shows an empty state when there are no ceremonies", async () => {
    const api = { list: vi.fn(async () => [] as Ceremony[]) } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} />);
    expect(container.textContent).toContain("ยังไม่มีกิจกรรม");
  });

  it("surfaces a load error", async () => {
    const api = { list: vi.fn(async () => { throw new Error("x"); }) } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} />);
    expect(container.textContent).toContain("โหลดข้อมูลกิจกรรมไม่สำเร็จ");
  });

  it("hides the booking button without write access", async () => {
    const api = { list: vi.fn(async () => [] as Ceremony[]) } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} />);
    expect(byText(container, "button", "จองกิจกรรม")).toBeNull();
  });

  it("surfaces the devotee 'requested' queue and confirms a booking via the audited update", async () => {
    const api = {
      list: vi.fn(async () => [REQUESTED_BOOKING]),
      update: vi.fn(async () => ({ ...REQUESTED_BOOKING, status: "planned" })),
    } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} canWrite />);
    // Queue banner + the row's pending status.
    expect(container.textContent).toContain("มีคำขอจองจากญาติโยมรอยืนยัน");
    expect(container.textContent).toContain("รอยืนยัน");
    // Confirm (-> planned) via the exact row-action button (not the banner link).
    await click(byExactText(container, "button", "ยืนยัน"));
    expect(api.update).toHaveBeenCalled();
    const call = (api.update as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(call[0]).toBe("c2");
    expect((call[1] as { status: string }).status).toBe("planned");
  });

  it("rejects a requested booking (-> cancelled)", async () => {
    const api = {
      list: vi.fn(async () => [REQUESTED_BOOKING]),
      update: vi.fn(async () => ({ ...REQUESTED_BOOKING, status: "cancelled" })),
    } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} canWrite />);
    await click(byExactText(container, "button", "ปฏิเสธ"));
    const call = (api.update as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect((call[1] as { status: string }).status).toBe("cancelled");
  });

  it("shows no status actions for read-only staff", async () => {
    const api = { list: vi.fn(async () => [REQUESTED_BOOKING]) } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} />);
    expect(byExactText(container, "button", "ยืนยัน")).toBeNull();
  });

  it("books a ceremony via the modal when canWrite", async () => {
    const api = { list: vi.fn(async () => [] as Ceremony[]), create: vi.fn(async () => CEREMONY) } as unknown as CeremoniesApi;
    const container = await mount(<DesignEvents api={api} canWrite />);
    await click(byText(container, "button", "จองกิจกรรม"));
    expect(container.querySelector(".modal")).not.toBeNull();
    const inputs = container.querySelectorAll(".modal input");
    await setValue(inputs[0] ?? null, "งานทดสอบ"); // title
    await setValue(inputs[1] ?? null, "2569-06-20"); // ceremonyDate
    await click(byText(container, ".modal button", "บันทึก"));
    expect(api.create).toHaveBeenCalled();
    const arg = ((api.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? {}) as { title: string; ceremonyType: string; status: string };
    expect(arg.title).toBe("งานทดสอบ");
    expect(arg.ceremonyType).toBe("merit");
    expect(arg.status).toBe("planned");
  });

  it("books a hall and invites monks from the registry (จองศาลา + นิมนต์พระ)", async () => {
    const api = {
      list: vi.fn(async () => [] as Ceremony[]),
      create: vi.fn(async () => CEREMONY),
      listHalls: vi.fn(async () => [
        { id: "44444444-4444-4444-8444-444444444444", name: "ศาลาการเปรียญ", capacity: 80, note: null, isActive: true },
      ]),
    } as unknown as CeremoniesApi;
    const personnelApi = {
      list: vi.fn(async () => [
        { id: "55555555-5555-4555-8555-555555555555", displayName: "พระมหาทดสอบ", personnelType: "monk", status: "active", rank: null },
        { id: "66666666-6666-4666-8666-666666666666", displayName: "เจ้าหน้าที่วัด", personnelType: "staff", status: "active", rank: null },
      ]),
    } as unknown as import("./personnel/personnel").PersonnelApi;

    const container = await mount(<DesignEvents api={api} personnelApi={personnelApi} canWrite canManageHalls />);
    await click(byText(container, "button", "จองกิจกรรม"));

    // hall options come from the registry; non-monk personnel are filtered out
    expect(container.textContent).toContain("ศาลาการเปรียญ");
    expect(container.textContent).toContain("พระมหาทดสอบ");
    expect(container.textContent).not.toContain("เจ้าหน้าที่วัด");

    const hallSelects = Array.from(container.querySelectorAll(".modal select"));
    await setValue(hallSelects[1] ?? null, "44444444-4444-4444-8444-444444444444"); // [0]=type, [1]=hall
    const monkCheckbox = Array.from(container.querySelectorAll<HTMLInputElement>(".modal input[type=checkbox]"))
      .find((c) => c.parentElement?.textContent?.includes("พระมหาทดสอบ"));
    await click(monkCheckbox ?? null);

    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>(".modal input")).filter((i) => i.type !== "checkbox");
    await setValue(inputs[0] ?? null, "งานนิมนต์");
    await setValue(inputs[1] ?? null, "2569-07-01");
    await click(byText(container, ".modal button", "บันทึก"));

    const arg = ((api.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? {}) as {
      hallId?: string;
      monkPersonnelIds?: string[];
    };
    expect(arg.hallId).toBe("44444444-4444-4444-8444-444444444444");
    expect(arg.monkPersonnelIds).toEqual(["55555555-5555-4555-8555-555555555555"]);
  });
});
