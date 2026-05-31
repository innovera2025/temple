import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Ceremony, CeremoniesApi } from "./ceremonies";
import { CeremoniesPage, CeremoniesTable, CeremonyForm } from "./ceremonies-view";

const merit: Ceremony = {
  id: "11111111-1111-4111-8111-111111111111",
  ceremonyType: "merit",
  status: "planned",
  title: "ทำบุญขึ้นบ้านใหม่",
  ceremonyDate: "2026-06-15",
  timeNote: "09:00 น.",
  location: "ศาลาการเปรียญ",
  requesterName: "คุณสมชาย",
  requesterPhone: null,
  assignedMonks: null,
  monkCount: 9,
  note: null,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

describe("ceremonies view", () => {
  it("table renders rows with type/status labels and location", () => {
    const html = renderToStaticMarkup(<CeremoniesTable rows={[merit]} />);
    expect(html).toContain("ทำบุญขึ้นบ้านใหม่");
    expect(html).toContain("2026-06-15");
    expect(html).toContain("ทำบุญ");
    expect(html).toContain("ศาลาการเปรียญ");
    expect(html).toContain("กำหนดการ");
  });

  it("table shows a Thai empty state", () => {
    const html = renderToStaticMarkup(<CeremoniesTable rows={[]} />);
    expect(html).toContain("ยังไม่มีงานบุญ/พิธี");
  });

  it("form renders the type/status selects and the section fields", () => {
    const html = renderToStaticMarkup(
      <CeremonyForm
        ceremonyType="merit"
        status="planned"
        draft={{ title: "ทำบุญ" }}
        submitting={false}
        onTypeChange={() => undefined}
        onStatusChange={() => undefined}
        onChange={() => undefined}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("ประเภทงาน");
    expect(html).toContain("วันที่จัดงาน");
    expect(html).toContain("พระที่นิมนต์");
    expect(html).toContain("บันทึก");
  });

  it("page shell renders the heading", () => {
    const api: CeremoniesApi = {
      list: async () => [merit],
      get: async () => merit,
      create: async () => merit,
      update: async () => merit,
    };
    const html = renderToStaticMarkup(<CeremoniesPage api={api} canWrite={true} />);
    expect(html).toContain("งานบุญ / พิธี");
    expect(html).toContain("เพิ่มงาน");
  });
});
