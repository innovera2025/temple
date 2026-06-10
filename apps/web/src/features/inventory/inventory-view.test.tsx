import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryApi, InventoryItem, InventoryMovement, RoomView } from "./inventory";
import { InventoryPage, ItemForm, ItemsTable, MovementForm, MovementsTable } from "./inventory-view";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rooms: RoomView[] = [
  { id: "99999999-9999-4999-8999-999999999999", name: "โรงเก็บหลัง", note: null, itemCount: 1, createdAt: "2026-05-31T00:00:00.000Z", updatedAt: "2026-05-31T00:00:00.000Z" },
];

const item: InventoryItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ชุดสังฆทาน",
  category: "sangha_offering",
  unit: "ชุด",
  quantity: 10,
  status: "active",
  note: null,
  roomId: rooms[0]!.id,
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

const api: InventoryApi = {
  listItems: async () => [item],
  getItem: async () => item,
  createItem: async () => item,
  updateItem: async () => item,
  listMovements: async () => [movement],
  recordMovement: async () => ({ movement, item }),
  listRooms: async () => rooms,
  createRoom: async () => rooms[0]!,
  importItems: async () => ({ itemsCreated: 1, roomsCreated: 0 }),
};

describe("inventory view", () => {
  it("items table renders the room column + a Thai empty state", () => {
    expect(renderToStaticMarkup(<ItemsTable rows={[]} />)).toContain("ยังไม่มีรายการพัสดุ/ของบริจาค");
    const html = renderToStaticMarkup(<ItemsTable rows={[item]} rooms={rooms} />);
    expect(html).toContain("ชุดสังฆทาน");
    expect(html).toContain("ห้อง/โรงเก็บ");
    expect(html).toContain("โรงเก็บหลัง");
  });

  it("movements table renders the running balance + a Thai empty state", () => {
    expect(renderToStaticMarkup(<MovementsTable rows={[]} />)).toContain("ยังไม่มีประวัติการเคลื่อนไหว");
    const html = renderToStaticMarkup(<MovementsTable rows={[movement]} />);
    expect(html).toContain("รับเข้า");
    expect(html).toContain("รับบริจาค");
  });

  it("item form renders the room select with options + new-room button", () => {
    const itemHtml = renderToStaticMarkup(
      <ItemForm
        draft={{ name: "x" }}
        category="sangha_offering"
        status="active"
        rooms={rooms}
        submitting={false}
        onChange={() => undefined}
        onCategoryChange={() => undefined}
        onStatusChange={() => undefined}
        onAddRoom={() => undefined}
        onSubmit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(itemHtml).toContain("ชื่อรายการ");
    expect(itemHtml).toContain("ห้อง/โรงเก็บ");
    expect(itemHtml).toContain("โรงเก็บหลัง");
    expect(itemHtml).toContain("ห้องใหม่");

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
  });

  it("page shell renders the heading + Excel import action", () => {
    const html = renderToStaticMarkup(<InventoryPage api={api} canWrite={true} />);
    expect(html).toContain("คลังของบริจาค / พัสดุ");
    expect(html).toContain("เพิ่มรายการ");
    expect(html).toContain("นำเข้า Excel");
  });

  it("hides the Excel import action for read-only users", () => {
    const html = renderToStaticMarkup(<InventoryPage api={api} canWrite={false} />);
    expect(html).not.toContain("นำเข้า Excel");
  });
});

describe("inventory page (mounted)", () => {
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

  it("loads rooms and shows them in the items table room column", async () => {
    await act(async () => {
      root.render(<InventoryPage api={api} canWrite={true} />);
    });
    // rooms + items resolve on mount
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("โรงเก็บหลัง");
  });

  it("imports rows from a parsed Excel file and shows a success notice", async () => {
    let importedRows: unknown = null;
    const importApi: InventoryApi = {
      ...api,
      importItems: async (rows) => {
        importedRows = rows;
        return { itemsCreated: 2, roomsCreated: 1 };
      },
    };
    await act(async () => {
      root.render(<InventoryPage api={importApi} canWrite={true} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    // Build a real .xlsx and drive the change handler (parseInventoryXlsx runs for real).
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["ชื่อ", "จำนวน", "ห้อง"]);
    ws.addRow(["เทียน", "10", "โรงเก็บใหม่"]);
    const ab = await wb.xlsx.writeBuffer();
    const file = { name: "in.xlsx", arrayBuffer: async () => ab as ArrayBuffer } as unknown as File;
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });

    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // exceljs parses asynchronously (zip inflate) — wait for the handler to
    // finish instead of counting microtask flushes.
    await vi.waitFor(() => {
      if (importedRows === null) throw new Error("import not finished yet");
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(importedRows).toEqual([{ name: "เทียน", quantity: 10, roomName: "โรงเก็บใหม่" }]);
    expect(container.textContent).toContain("นำเข้าสำเร็จ");
  });
});
