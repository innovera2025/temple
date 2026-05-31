import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Personnel, PersonnelApi } from "./personnel";
import { PersonnelForm, PersonnelPage, PersonnelTable } from "./personnel-view";

const monk: Personnel = {
  id: "11111111-1111-4111-8111-111111111111",
  personnelType: "monk",
  status: "active",
  displayName: "พระสมชาย",
  dharmaName: "ฐิตธมฺโม",
  secularName: null,
  rank: null,
  position: "เจ้าอาวาส",
  ordinationDate: "2010-07-01",
  ordinationTemple: null,
  preceptor: null,
  phansaCount: 15,
  dateOfBirth: null,
  nationalId: null,
  phone: null,
  note: null,
  joinedAt: null,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

describe("personnel view", () => {
  it("table renders rows with type/status labels and the abbot position", () => {
    const html = renderToStaticMarkup(<PersonnelTable rows={[monk]} />);
    expect(html).toContain("พระสมชาย");
    expect(html).toContain("ฐิตธมฺโม");
    expect(html).toContain("พระภิกษุ");
    expect(html).toContain("เจ้าอาวาส");
    expect(html).toContain("ปฏิบัติหน้าที่");
  });

  it("table shows a Thai empty state", () => {
    const html = renderToStaticMarkup(<PersonnelTable rows={[]} />);
    expect(html).toContain("ยังไม่มีข้อมูลพระ/บุคลากร");
  });

  it("form renders the type/status selects and the section fields", () => {
    const html = renderToStaticMarkup(
      <PersonnelForm
        personnelType="monk"
        status="active"
        draft={{ displayName: "พระสมชาย" }}
        submitting={false}
        onTypeChange={() => undefined}
        onStatusChange={() => undefined}
        onChange={() => undefined}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("ประเภท");
    expect(html).toContain("การอุปสมบท");
    expect(html).toContain("จำนวนพรรษา");
    expect(html).toContain("บันทึก");
  });

  it("page shell renders the heading", () => {
    const api: PersonnelApi = {
      list: async () => [monk],
      get: async () => monk,
      create: async () => monk,
      update: async () => monk,
    };
    const html = renderToStaticMarkup(<PersonnelPage api={api} canWrite={true} />);
    expect(html).toContain("พระ / สามเณร / บุคลากร");
    expect(html).toContain("เพิ่มรายชื่อ");
  });
});
