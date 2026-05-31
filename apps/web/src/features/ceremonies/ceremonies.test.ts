import { describe, expect, it, vi } from "vitest";
import {
  buildCeremonyQuery,
  ceremonyStatusLabel,
  ceremonyTypeLabel,
  createCeremoniesApiClient,
  createDraftFromCeremony,
  type Ceremony,
} from "./ceremonies";

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

describe("ceremonies helpers", () => {
  it("builds query strings and Thai labels", () => {
    expect(buildCeremonyQuery({})).toBe("");
    const params = new URLSearchParams(buildCeremonyQuery({ ceremonyType: "funeral", status: "planned", dateFrom: "2026-06-01" }));
    expect(params.get("ceremonyType")).toBe("funeral");
    expect(params.get("status")).toBe("planned");
    expect(params.get("dateFrom")).toBe("2026-06-01");
    expect(ceremonyTypeLabel("ordination")).toBe("งานอุปสมบท/บรรพชา");
    expect(ceremonyStatusLabel("cancelled")).toBe("ยกเลิก");
  });

  it("builds an edit draft from a record (nulls -> empty, numbers -> string)", () => {
    const draft = createDraftFromCeremony(merit);
    expect(draft.title).toBe("ทำบุญขึ้นบ้านใหม่");
    expect(draft.ceremonyDate).toBe("2026-06-15");
    expect(draft.monkCount).toBe("9");
    expect(draft.note).toBe("");
  });
});

describe("ceremonies API client", () => {
  it("lists with filters + token and parses the array", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ceremonies: [merit] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createCeremoniesApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const rows = await api.list({ status: "planned" });
    expect(rows).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://api.test/ceremonies?status=planned");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("creates via POST and parses the record", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ceremony: merit }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createCeremoniesApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const created = await api.create({ ceremonyType: "merit", title: "ทำบุญ", ceremonyDate: "2026-06-15" });
    expect(created.id).toBe(merit.id);
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("surfaces the API's Thai error message on failure", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "ไม่ได้รับอนุญาต" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createCeremoniesApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.create({ ceremonyType: "merit", title: "x", ceremonyDate: "2026-06-15" })).rejects.toThrow(
      "ไม่ได้รับอนุญาต",
    );
  });
});
