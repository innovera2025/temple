import { describe, expect, it, vi } from "vitest";
import {
  buildPersonnelQuery,
  createDraftFromPersonnel,
  createPersonnelApiClient,
  personnelStatusLabel,
  personnelTypeLabel,
  type Personnel,
} from "./personnel";

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

describe("personnel helpers", () => {
  it("builds query strings and Thai labels", () => {
    expect(buildPersonnelQuery({})).toBe("");
    const params = new URLSearchParams(buildPersonnelQuery({ personnelType: "monk", status: "active", q: "สมชาย" }));
    expect(params.get("q")).toBe("สมชาย");
    expect(params.get("personnelType")).toBe("monk");
    expect(params.get("status")).toBe("active");
    expect(personnelTypeLabel("novice")).toBe("สามเณร");
    expect(personnelStatusLabel("inactive")).toBe("พ้นสภาพ/ไม่ได้ใช้งาน");
  });

  it("builds an edit draft from a record (nulls -> empty, numbers -> string)", () => {
    const draft = createDraftFromPersonnel(monk);
    expect(draft.displayName).toBe("พระสมชาย");
    expect(draft.dharmaName).toBe("ฐิตธมฺโม");
    expect(draft.phansaCount).toBe("15");
    expect(draft.ordinationDate).toBe("2010-07-01");
    expect(draft.secularName).toBe("");
  });
});

describe("personnel API client", () => {
  it("lists with filters + token and parses the array", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ personnel: [monk] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createPersonnelApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const rows = await api.list({ personnelType: "monk" });
    expect(rows).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://api.test/personnel?personnelType=monk");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("creates via POST and parses the record", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ personnel: monk }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createPersonnelApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const created = await api.create({ personnelType: "monk", displayName: "พระสมชาย" });
    expect(created.id).toBe(monk.id);
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
    const api = createPersonnelApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.create({ personnelType: "monk", displayName: "x" })).rejects.toThrow("ไม่ได้รับอนุญาต");
  });
});
