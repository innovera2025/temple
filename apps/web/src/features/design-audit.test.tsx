import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignAudit } from "./design-backed-pages";
import type { AuditApi, AuditLogView } from "./audit/audit";

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

afterEach(() => {
  while (mounted.length) {
    const e = mounted.pop();
    if (!e) continue;
    act(() => e.root.unmount());
    e.container.remove();
  }
  vi.restoreAllMocks();
});

const rows: AuditLogView[] = [
  {
    id: "a1", action: "donation:create", entityType: "donation", entityId: "11111111-2222-4333-8444-555555555555",
    actorType: "user", actorName: "ศิริพร อินทรา", actorRole: "finance", reason: null, ip: "10.0.2.51",
    createdAt: "2026-06-10T09:42:11.000Z",
  },
  {
    id: "a2", action: "ledger:cancel", entityType: "ledger_entry", entityId: null,
    actorType: "user", actorName: "ประยูร พงษ์ศักดิ์", actorRole: "admin", reason: "บันทึกซ้ำ", ip: "10.0.2.40",
    createdAt: "2026-06-09T14:02:55.000Z",
  },
];

describe("DesignAudit — wired to GET /audit (no fake data)", () => {
  it("renders real audit rows: actor, verb badge, entity, reason", async () => {
    const list = vi.fn(async () => rows);
    const container = await mount(<DesignAudit api={{ list } as unknown as AuditApi} />);

    expect(list).toHaveBeenCalledWith({ take: 50, skip: 0 });
    expect(container.textContent).toContain("ศิริพร อินทรา");
    expect(container.textContent).toContain("ฝ่ายการเงิน");
    expect(container.textContent).toContain("การบริจาค");
    expect(container.textContent).toContain("เหตุผล: บันทึกซ้ำ");
    expect(container.textContent).toContain("บันทึกนี้ไม่สามารถแก้ไขหรือลบได้");
    // none of the old hardcoded demo rows
    expect(container.textContent).not.toContain("กองทุนบูรณะอุโบสถ");
  });

  it("filters by action family via the chips (server-side prefix filter)", async () => {
    const list = vi.fn(async () => rows);
    const container = await mount(<DesignAudit api={{ list } as unknown as AuditApi} />);

    const ledgerChip = Array.from(container.querySelectorAll(".chip")).find((c) => c.textContent === "บัญชี");
    await click(ledgerChip ?? null);
    expect(list).toHaveBeenLastCalledWith({ actionPrefix: "ledger:", take: 50, skip: 0 });
  });

  it("shows an error state when the API fails (never silent fake data)", async () => {
    const list = vi.fn(async () => { throw new Error("403"); });
    const container = await mount(<DesignAudit api={{ list } as unknown as AuditApi} />);
    expect(container.textContent).toContain("โหลดบันทึกการใช้งานไม่สำเร็จ");
  });
});
