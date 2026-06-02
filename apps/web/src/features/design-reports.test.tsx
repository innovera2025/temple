import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignReports } from "./design-backed-pages";
import type { ReportsApi, ReportView } from "./reports/reports";

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

afterEach(() => {
  while (mounted.length) {
    const e = mounted.pop();
    if (!e) continue;
    act(() => e.root.unmount());
    e.container.remove();
  }
  vi.restoreAllMocks();
});

const REPORT: ReportView = { type: "donations", columns: ["a"], rows: [["1"]], count: 3, csv: "a\n1" };

describe("DesignReports — wired to /reports export", () => {
  it("generates a CSV for the selected report via the real API", async () => {
    const get = vi.fn(async () => REPORT);
    const api = { get } as unknown as ReportsApi;
    // jsdom has no URL.createObjectURL — stub the download side-effect.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:x");
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const container = await mount(<DesignReports api={api} today="2026-06-04" />);

    const genBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("สร้างและดาวน์โหลด"));
    await click(genBtn ?? null);

    expect(get).toHaveBeenCalledWith("donations", { dateFrom: "2026-06-01", dateTo: "2026-06-04" });
    expect(container.textContent).toContain("สร้างรายงานแล้ว 3 รายการ");
  });

  it("does not call the API for a report without an export endpoint", async () => {
    const get = vi.fn(async () => REPORT);
    const api = { get } as unknown as ReportsApi;
    const container = await mount(<DesignReports api={api} today="2026-06-04" />);
    // select the "fund" report (no endpoint), then try to generate
    const fundCard = Array.from(container.querySelectorAll("button.card")).find((b) => b.textContent?.includes("ความคืบหน้ากองทุน"));
    await click(fundCard ?? null);
    const genBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("สร้างและดาวน์โหลด"));
    await click(genBtn ?? null);
    expect(get).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ยังไม่พร้อมส่งออก");
  });
});
