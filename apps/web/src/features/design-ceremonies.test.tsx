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
  id: "c1", ceremonyType: "merit", status: "confirmed", title: "ทอดผ้าป่าสามัคคี",
  ceremonyDate: "2569-06-12", timeNote: "09:00–14:00", location: "ศาลาการเปรียญ",
  requesterName: "ครอบครัวสุขใจ", requesterPhone: null, assignedMonks: null, monkCount: 9,
  note: null, createdAt: "", updatedAt: "",
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
});
