import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InventoryApi, InventoryItem, InventoryMovement } from "./inventory";
import { InventoryPage, ItemForm, ItemsTable, MovementForm, MovementsTable } from "./inventory-view";

const item: InventoryItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ชุดสังฆทาน",
  category: "sangha_offering",
  unit: "ชุด",
  quantity: 10,
  status: "active",
  note: null,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

const movement: InventoryMovement = {
  id: "22222222-2222-4222-8222-222222222222",
  itemId: item.id,
  movementType: "receive",
  quantity: 5,
  balanceAfter: 10,
  movementDate: "2026-05-30",
  reason: "รับบริจาค",
  reference: null,
  note: null,
  createdAt: "2026-05-30T00:00:00.000Z",
};

describe("inventory view", () => {
  it("items table renders name/category/quantity+unit and a Thai empty state", () => {
    expect(renderToStaticMarkup(<ItemsTable rows={[]} />)).toContain("ยังไม่มีรายการพัสดุ/ของบริจาค");
    const html = renderToStaticMarkup(<ItemsTable rows={[item]} />);
    expect(html).toContain("ชุดสังฆทาน");
    expect(html).toContain("ของบริจาค/สังฆทาน");
    expect(html).toContain("ชุด");
  });

  it("movements table renders the running balance + a Thai empty state", () => {
    expect(renderToStaticMarkup(<MovementsTable rows={[]} />)).toContain("ยังไม่มีประวัติการเคลื่อนไหว");
    const html = renderToStaticMarkup(<MovementsTable rows={[movement]} />);
    expect(html).toContain("รับเข้า");
    expect(html).toContain("รับบริจาค");
  });

  it("item form + movement form render their fields", () => {
    const itemHtml = renderToStaticMarkup(
      <ItemForm
        draft={{ name: "x" }}
        category="sangha_offering"
        status="active"
        submitting={false}
        onChange={() => undefined}
        onCategoryChange={() => undefined}
        onStatusChange={() => undefined}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(itemHtml).toContain("ชื่อรายการ");
    expect(itemHtml).toContain("หน่วยนับ");

    const moveHtml = renderToStaticMarkup(
      <MovementForm
        movementType="receive"
        draft={{}}
        submitting={false}
        onTypeChange={() => undefined}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(moveHtml).toContain("บันทึกการเคลื่อนไหว");
    expect(moveHtml).toContain("จำนวน");
  });

  it("page shell renders the heading", () => {
    const api: InventoryApi = {
      listItems: async () => [item],
      getItem: async () => item,
      createItem: async () => item,
      updateItem: async () => item,
      listMovements: async () => [movement],
      recordMovement: async () => ({ movement, item }),
    };
    const html = renderToStaticMarkup(<InventoryPage api={api} canWrite={true} />);
    expect(html).toContain("คลังของบริจาค / พัสดุ");
    expect(html).toContain("เพิ่มรายการ");
  });
});
