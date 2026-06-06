import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignPeople } from "./design-backed-pages";
import type { Personnel, PersonnelApi } from "./personnel/personnel";

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

function person(over: Partial<Personnel>): Personnel {
  return {
    id: "p", personnelType: "monk", status: "active", displayName: "สมหวัง รุ่งเรือง",
    dharmaName: "พระอธิการสมหวัง สุจิตฺโต", secularName: "สมหวัง รุ่งเรือง", rank: null,
    position: "เจ้าอาวาส", ordinationDate: null, ordinationTemple: null, preceptor: null,
    phansaCount: 34, dateOfBirth: null, nationalId: null, phone: "081-234-5678", note: null,
    joinedAt: null, createdAt: "", updatedAt: "", ...over,
  } as unknown as Personnel;
}

describe("DesignPeople — wired to /personnel", () => {
  it("renders real personnel rows with type, position, phansa and tab counts", async () => {
    const api = {
      list: vi.fn(async () => [
        person({}),
        person({ id: "s1", personnelType: "staff", displayName: "ศิริพร อินทรา", dharmaName: null, position: "เจ้าหน้าที่การเงิน", phansaCount: null }),
      ]),
    } as unknown as PersonnelApi;
    const container = await mount(<DesignPeople api={api} />);
    expect(api.list).toHaveBeenCalled();
    const text = container.textContent ?? "";
    expect(text).toContain("พระอธิการสมหวัง สุจิตฺโต");
    expect(text).toContain("เจ้าอาวาส");
    expect(text).toContain("34 พรรษา");
    expect(text).toContain("ศิริพร อินทรา");
    // tab counts reflect real data: 1 monk-ish, 1 staff
    expect(text).toContain("พระ-เณร (1)");
    expect(text).toContain("เจ้าหน้าที่ (1)");
  });

  it("shows an empty state when there is no personnel", async () => {
    const api = { list: vi.fn(async () => [] as Personnel[]) } as unknown as PersonnelApi;
    const container = await mount(<DesignPeople api={api} />);
    expect(container.textContent).toContain("ยังไม่มีบุคลากร");
  });

  it("surfaces a load error", async () => {
    const api = { list: vi.fn(async () => { throw new Error("x"); }) } as unknown as PersonnelApi;
    const container = await mount(<DesignPeople api={api} />);
    expect(container.textContent).toContain("โหลดข้อมูลบุคลากรไม่สำเร็จ");
  });

  it("hides the add button without write access", async () => {
    const api = { list: vi.fn(async () => [] as Personnel[]) } as unknown as PersonnelApi;
    const container = await mount(<DesignPeople api={api} />);
    expect(byText(container, "button", "เพิ่มบุคลากร")).toBeNull();
  });

  it("adds personnel via the modal when canWrite", async () => {
    const api = { list: vi.fn(async () => [] as Personnel[]), create: vi.fn(async () => person({})) } as unknown as PersonnelApi;
    const container = await mount(<DesignPeople api={api} canWrite />);
    await click(byText(container, "button", "เพิ่มบุคลากร"));
    expect(container.querySelector(".modal")).not.toBeNull();
    await setValue(container.querySelectorAll(".modal input")[0] ?? null, "พระทดสอบ"); // displayName (first field)
    await click(byText(container, ".modal button", "บันทึก"));
    expect(api.create).toHaveBeenCalled();
    const arg = ((api.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? {}) as { displayName: string; personnelType: string; status: string };
    expect(arg.displayName).toBe("พระทดสอบ");
    expect(arg.personnelType).toBe("monk");
    expect(arg.status).toBe("active");
  });
});
