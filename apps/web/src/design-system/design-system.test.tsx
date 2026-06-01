import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card, Drawer, Modal, SearchBox, Toast, Toolbar } from "./index";

const noop = (): void => undefined;

describe("Button (design Btn)", () => {
  it("defaults to the secondary variant and a non-submitting button", () => {
    const html = renderToStaticMarkup(<Button>บันทึก</Button>);
    expect(html).toContain('class="btn btn-secondary"');
    expect(html).toContain('type="button"');
    expect(html).toContain("บันทึก");
  });

  it("composes variant + size class names like the design", () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" size="lg">บันทึกการบริจาค</Button>,
    );
    expect(html).toContain("btn btn-primary btn-lg");
  });

  it("supports the danger variant and forwarding type=submit + disabled", () => {
    const html = renderToStaticMarkup(
      <Button variant="danger" type="submit" disabled>ยกเลิก</Button>,
    );
    expect(html).toContain("btn btn-danger");
    expect(html).toContain('type="submit"');
    expect(html).toContain("disabled");
  });

  it("renders a leading icon node inside .ico", () => {
    const html = renderToStaticMarkup(<Button icon={<svg data-testid="i" />}>เพิ่ม</Button>);
    expect(html).toContain('class="ico"');
  });
});

describe("Badge (design Badge)", () => {
  it("defaults to neutral and renders the label", () => {
    const html = renderToStaticMarkup(<Badge>ทั่วไป</Badge>);
    expect(html).toContain('class="badge neutral"');
    expect(html).toContain("ทั่วไป");
  });

  it("maps status kinds and the square + dot modifiers", () => {
    expect(renderToStaticMarkup(<Badge kind="credit">รายรับ</Badge>)).toContain("badge credit");
    expect(renderToStaticMarkup(<Badge kind="reconciled" sq>กระทบยอดแล้ว</Badge>)).toContain("badge reconciled sq");
    expect(renderToStaticMarkup(<Badge kind="void" dot>ยกเลิก</Badge>)).toContain('class="dot"');
  });
});

describe("Card (design Card)", () => {
  it("renders the base card and adds card-pad + extra className", () => {
    expect(renderToStaticMarkup(<Card>เนื้อหา</Card>)).toContain('class="card"');
    const padded = renderToStaticMarkup(<Card pad className="dash-kpi">ตัวเลข</Card>);
    expect(padded).toContain("card card-pad dash-kpi");
  });
});

describe("Modal (design Modal)", () => {
  it("renders the scrim, title, body and a dialog role; sub/footer/wide are opt-in", () => {
    const plain = renderToStaticMarkup(
      <Modal title="ยืนยันการยกเลิก" onClose={noop}>เนื้อหา</Modal>,
    );
    expect(plain).toContain('class="scrim"');
    expect(plain).toContain('role="dialog"');
    expect(plain).toContain("ยืนยันการยกเลิก");
    expect(plain).toContain("เนื้อหา");
    expect(plain).not.toContain("modal-foot");

    const full = renderToStaticMarkup(
      <Modal title="หัวข้อ" sub="คำอธิบาย" wide footer={<button>ตกลง</button>} onClose={noop}>x</Modal>,
    );
    expect(full).toContain("คำอธิบาย");
    expect(full).toContain("modal-foot");
    expect(full).toContain("min(720px, calc(100vw - 32px))");
  });
});

describe("Drawer (design Drawer)", () => {
  it("renders a side panel with a monospace sub, title and optional badge", () => {
    const html = renderToStaticMarkup(
      <Drawer title="รายละเอียดผู้บริจาค" sub="DON-000123" badge={<Badge>ใช้งาน</Badge>} onClose={noop}>
        เนื้อหา
      </Drawer>,
    );
    expect(html).toContain('class="drawer"');
    expect(html).toContain("DON-000123");
    expect(html).toContain("รายละเอียดผู้บริจาค");
    expect(html).toContain("badge");
  });
});

describe("Toast (design Toast)", () => {
  it("renders nothing without a message and a status toast with one", () => {
    expect(renderToStaticMarkup(<Toast />)).toBe("");
    const html = renderToStaticMarkup(<Toast msg="บันทึกแล้ว" />);
    expect(html).toContain('class="toast"');
    expect(html).toContain('role="status"');
    expect(html).toContain("บันทึกแล้ว");
  });
});

describe("Toolbar (design Toolbar)", () => {
  it("wraps children in .t-toolbar and appends an extra className", () => {
    expect(renderToStaticMarkup(<Toolbar>x</Toolbar>)).toContain('class="t-toolbar"');
    expect(renderToStaticMarkup(<Toolbar className="mb-0">x</Toolbar>)).toContain("t-toolbar mb-0");
  });
});

describe("SearchBox (design SearchBox)", () => {
  it("reuses the .tb-search chrome with a default Thai placeholder", () => {
    const html = renderToStaticMarkup(<SearchBox value="" onChange={noop} />);
    expect(html).toContain('class="tb-search"');
    expect(html).toContain('placeholder="ค้นหา"');
    expect(html).toContain('aria-label="ค้นหา"');
  });

  it("reflects the controlled value and a custom placeholder", () => {
    const html = renderToStaticMarkup(
      <SearchBox value="สมชาย" onChange={noop} placeholder="ค้นหาผู้บริจาค" />,
    );
    expect(html).toContain('value="สมชาย"');
    expect(html).toContain('placeholder="ค้นหาผู้บริจาค"');
  });
});
