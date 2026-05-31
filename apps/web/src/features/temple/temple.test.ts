import { describe, expect, it, vi } from "vitest";
import { createTempleApiClient, diffProfile, type TempleProfile } from "./temple";

const profile: TempleProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "wat-arun-demo",
  status: "active",
  nameTh: "วัดอรุณเดโม",
  nameEn: "Wat Arun Demo",
  addressTh: null,
  subdistrict: null,
  district: null,
  province: null,
  postalCode: null,
  phone: null,
  email: null,
  lineId: null,
  websiteUrl: null,
  abbotName: null,
  registrationNo: null,
  taxId: null,
  denomination: null,
  logoUrl: null,
  receiptHeaderTh: null,
  receiptFooterTh: null,
};

describe("diffProfile", () => {
  it("returns only the changed fields against the loaded profile", () => {
    const draft: Record<string, string> = {
      nameTh: "วัดอรุณเดโม", // unchanged
      province: "กรุงเทพมหานคร", // new
      phone: " 021112222 ", // new (trimmed)
    };
    const patch = diffProfile(profile, draft);
    expect(patch).toEqual({ province: "กรุงเทพมหานคร", phone: "021112222" });
    expect("nameTh" in patch).toBe(false);
  });

  it("is empty when nothing changed", () => {
    expect(diffProfile(profile, { nameTh: "วัดอรุณเดโม", nameEn: "Wat Arun Demo" })).toEqual({});
  });
});

describe("temple API client", () => {
  it("GETs /temple with the token and parses the profile", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ temple: profile }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createTempleApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await api.get();
    expect(result.nameTh).toBe("วัดอรุณเดโม");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://api.test/temple");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("PATCHes /temple with the patch body and parses the updated profile", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ temple: { ...profile, province: "เชียงใหม่" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createTempleApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const result = await api.update({ province: "เชียงใหม่" });
    expect(result.province).toBe("เชียงใหม่");
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(fetchFn.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ province: "เชียงใหม่" }));
  });

  it("surfaces the API's Thai error message on failure", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "ไม่ได้รับอนุญาต" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createTempleApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.update({ nameTh: "x" })).rejects.toThrow("ไม่ได้รับอนุญาต");
  });
});
