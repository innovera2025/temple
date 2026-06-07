import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PublicDirectory } from "./public-directory";
import type { PublicApi, PublicEventSummary, PublicTempleSummary } from "./public-api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const temple: PublicTempleSummary = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  nameTh: "วัดอรุณเดโม",
  nameEn: "Wat Arun Demo",
  province: "กรุงเทพมหานคร",
  district: "บางกอกใหญ่",
  logoUrl: null,
};

const event: PublicEventSummary = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  templeId: temple.id,
  templeNameTh: "วัดอรุณเดโม",
  ceremonyType: "robe_offering",
  title: "ทอดกฐินสามัคคี",
  ceremonyDate: "2026-11-01",
  timeNote: "09:00 น.",
  location: "ศาลาการเปรียญ",
};

function makeApi(overrides: Partial<PublicApi> = {}): PublicApi {
  return {
    listTemples: async () => [temple],
    listEvents: async () => [event],
    ...overrides,
  };
}

function flush(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("PublicDirectory (unauthenticated)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the temple directory + upcoming public events with a login CTA", async () => {
    await act(async () => {
      root.render(<PublicDirectory baseUrl="http://x" api={makeApi()} />);
    });
    await flush();
    expect(container.textContent).toContain("วัดและกิจกรรมงานบุญ");
    expect(container.textContent).toContain("วัดอรุณเดโม");
    expect(container.textContent).toContain("ทอดกฐินสามัคคี"); // public event
    expect(container.textContent).toContain("เข้าสู่ระบบ / ร่วมบุญ"); // CTA into devotee portal
    // never renders the staff back-office shell
    expect(container.querySelector(".sidebar")).toBeNull();
  });

  it("filters temples by the search box", async () => {
    await act(async () => {
      root.render(<PublicDirectory baseUrl="http://x" api={makeApi({ listTemples: async () => [temple] })} />);
    });
    await flush();
    const search = container.querySelector<HTMLInputElement>('input[aria-label="ค้นหาวัด"]');
    await act(async () => {
      if (search) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(search, "ไม่มีวัดนี้");
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(container.textContent).toContain("ไม่พบวัดที่ตรงกับคำค้นหา");
  });

  it("shows empty states when there are no temples or events", async () => {
    await act(async () => {
      root.render(
        <PublicDirectory baseUrl="http://x" api={makeApi({ listTemples: async () => [], listEvents: async () => [] })} />,
      );
    });
    await flush();
    expect(container.textContent).toContain("ยังไม่มีกิจกรรมสาธารณะที่ประกาศไว้");
    expect(container.textContent).toContain("ยังไม่มีวัดในระบบ");
  });
});
