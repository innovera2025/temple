import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card } from "./index";

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
