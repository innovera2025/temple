import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import {
  buildItemQuery,
  categoryLabel,
  createInventoryApiClient,
  movementTypeLabel,
  parseInventoryXlsx,
  type InventoryItem,
} from "./inventory";

const item: InventoryItem = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "ชุดสังฆทาน",
  category: "sangha_offering",
  unit: "ชุด",
  quantity: 10,
  status: "active",
  note: null,
  roomId: null,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

/** Build an in-memory .xlsx and wrap it as a File-like object for parseInventoryXlsx. */
function xlsxFile(aoa: unknown[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer | Uint8Array;
  const ab = out instanceof Uint8Array ? out.buffer : out;
  return { arrayBuffer: async () => ab } as unknown as File;
}

describe("inventory helpers", () => {
  it("builds query strings and Thai labels", () => {
    expect(buildItemQuery({})).toBe("");
    const params = new URLSearchParams(buildItemQuery({ category: "supplies", status: "active" }));
    expect(params.get("category")).toBe("supplies");
    expect(params.get("status")).toBe("active");
    expect(categoryLabel("equipment")).toBe("อุปกรณ์/ครุภัณฑ์");
    expect(movementTypeLabel("issue")).toBe("เบิกออก");
  });
});

describe("inventory API client", () => {
  it("lists items with filters + token", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [item] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = createInventoryApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const rows = await api.listItems({ category: "sangha_offering" });
    expect(rows).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://api.test/inventory/items?category=sangha_offering");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("records a movement (POST) and returns the updated item", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            movement: { id: "m1", itemId: item.id, movementType: "issue", quantity: 3, balanceAfter: 7, movementDate: "2026-06-01", reason: null, reference: null, note: null, createdAt: "2026-06-01T00:00:00.000Z" },
            item: { ...item, quantity: 7 },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    const api = createInventoryApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const { item: updated, movement } = await api.recordMovement(item.id, {
      movementType: "issue",
      quantity: 3,
      movementDate: "2026-06-01",
    });
    expect(updated.quantity).toBe(7);
    expect(movement.balanceAfter).toBe(7);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(`http://api.test/inventory/items/${item.id}/movements`);
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("surfaces the API's Thai error message (e.g. insufficient stock)", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "ยอดคงเหลือไม่พอสำหรับการเบิกออก" } }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createInventoryApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.recordMovement(item.id, { movementType: "issue", quantity: 99, movementDate: "2026-06-01" })).rejects.toThrow(
      "ยอดคงเหลือไม่พอ",
    );
  });

  it("createRoom POSTs and listRooms GETs /inventory/rooms", async () => {
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ room: { id: "r1", name: "โรงเก็บ A", note: null, itemCount: 0 } }), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
      )
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ rooms: [{ id: "r1", name: "โรงเก็บ A", note: null, itemCount: 3 }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );
    const api = createInventoryApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const room = await api.createRoom({ name: "โรงเก็บ A" });
    expect(room.id).toBe("r1");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://api.test/inventory/rooms");
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");

    const rooms = await api.listRooms();
    expect(rooms[0]?.itemCount).toBe(3);
    expect(fetchFn.mock.calls[1]?.[0]).toBe("http://api.test/inventory/rooms");
  });

  it("importItems POSTs a {rows} body and returns the created counts", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ itemsCreated: 2, roomsCreated: 1 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createInventoryApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const result = await api.importItems([{ name: "โต๊ะหมู่", roomName: "โรงเก็บ A" }]);
    expect(result).toEqual({ itemsCreated: 2, roomsCreated: 1 });
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://api.test/inventory/import");
    expect(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body))).toEqual({ rows: [{ name: "โต๊ะหมู่", roomName: "โรงเก็บ A" }] });
  });
});

describe("parseInventoryXlsx", () => {
  it("maps Thai headers, coerces quantity, and skips empty rows", async () => {
    const file = xlsxFile([
      ["ชื่อ", "ประเภท", "จำนวน", "หน่วย", "ห้อง", "หมายเหตุ"],
      ["โต๊ะหมู่บูชา", "อุปกรณ์/ครุภัณฑ์", "2", "ชุด", "โรงเก็บ A", "สภาพดี"],
      ["", "", "", "", "", ""],
      ["จีวร", "เครื่องอัฐบริขาร", " 12 ชุด ", "ผืน", "", ""],
    ]);
    const rows = await parseInventoryXlsx(file);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "โต๊ะหมู่บูชา",
      category: "อุปกรณ์/ครุภัณฑ์",
      quantity: 2,
      unit: "ชุด",
      roomName: "โรงเก็บ A",
      note: "สภาพดี",
    });
    expect(rows[1]?.quantity).toBe(12);
    expect(rows[1]?.name).toBe("จีวร");
  });

  it("maps English headers too", async () => {
    const file = xlsxFile([
      ["name", "category", "qty", "unit", "room"],
      ["Bowl", "supplies", "5", "ชิ้น", "Store 1"],
    ]);
    const rows = await parseInventoryXlsx(file);
    expect(rows[0]).toEqual({ name: "Bowl", category: "supplies", quantity: 5, unit: "ชิ้น", roomName: "Store 1" });
  });
});
