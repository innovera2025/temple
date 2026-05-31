import { describe, expect, it, vi } from "vitest";
import {
  buildItemQuery,
  categoryLabel,
  createInventoryApiClient,
  movementTypeLabel,
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
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

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
});
