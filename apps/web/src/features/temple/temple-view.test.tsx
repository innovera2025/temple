import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TempleApi, TempleProfile } from "./temple";
import { TempleProfileForm, TempleProfilePage, TempleProfileView } from "./temple-view";

const profile: TempleProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "wat-arun-demo",
  status: "active",
  nameTh: "วัดอรุณเดโม",
  nameEn: "Wat Arun Demo",
  addressTh: "123 ถนนอรุณอมรินทร์",
  subdistrict: null,
  district: null,
  province: "กรุงเทพมหานคร",
  postalCode: null,
  phone: null,
  email: null,
  lineId: null,
  websiteUrl: null,
  abbotName: "พระเดโม",
  registrationNo: null,
  taxId: null,
  denomination: null,
  logoUrl: null,
  receiptHeaderTh: null,
  receiptFooterTh: null,
};

describe("temple profile view", () => {
  it("renders grouped fields, filled values, and a Thai empty state for unset fields", () => {
    const html = renderToStaticMarkup(<TempleProfileView profile={profile} />);
    expect(html).toContain("ข้อมูลทั่วไป");
    expect(html).toContain("ที่อยู่");
    expect(html).toContain("เจ้าอาวาส");
    expect(html).toContain("พระเดโม");
    expect(html).toContain("กรุงเทพมหานคร");
    expect(html).toContain("— ยังไม่ระบุ"); // e.g. phone/email unset
  });

  it("form renders inputs with the field labels and a save button", () => {
    const html = renderToStaticMarkup(
      <TempleProfileForm
        draft={{ nameTh: "วัดอรุณเดโม", province: "กรุงเทพมหานคร" }}
        submitting={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(html).toContain("ชื่อวัด (ไทย)");
    expect(html).toContain("หัวกระดาษใบอนุโมทนา");
    expect(html).toContain("บันทึก");
  });

  it("page shell renders the heading", () => {
    const api: TempleApi = { get: async () => profile, update: async () => profile };
    const html = renderToStaticMarkup(<TempleProfilePage api={api} canEdit={true} />);
    expect(html).toContain("ข้อมูลวัด");
    expect(html).toContain("ข้อมูลหลักของวัด");
  });
});
