import { describe, expect, it, vi } from "vitest";
import { createDonorsApiClient, donorTypeLabel } from "./donors";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

const donor = {
  id: "d1",
  displayName: "คุณสมหญิง ใจบุญ",
  legalName: null,
  donorType: "person",
  email: null,
  phone: "0812345678",
  lineId: null,
  address: null,
  taxId: null,
  tags: [],
  notes: null,
  consent: false,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

describe("donors api client", () => {
  it("lists donors and unwraps the {donors} envelope, with query + auth header", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ donors: [donor] }));
    const api = createDonorsApiClient({ baseUrl: "http://api", getToken: () => "tok", fetchFn });

    const rows = await api.list({ q: "สมหญิง", donorType: "person" });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayName).toBe("คุณสมหญิง ใจบุญ");
    const call = fetchFn.mock.calls.at(0);
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(String(url)).toContain("/donors?");
    expect(String(url)).toContain("donorType=person");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("creates a donor (POST) and unwraps {donor}", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ donor }));
    const api = createDonorsApiClient({ baseUrl: "http://api", getToken: () => null, fetchFn });

    const created = await api.create({ displayName: "คุณสมหญิง ใจบุญ", donorType: "person" });

    expect(created.id).toBe("d1");
    const call = fetchFn.mock.calls.at(0);
    if (!call) throw new Error("fetch was not called");
    const [, init] = call;
    expect((init as RequestInit).method).toBe("POST");
  });

  it("throws the API error message on a non-ok response", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ error: { message: "ไม่มีสิทธิ์" } }, false, 403));
    const api = createDonorsApiClient({ baseUrl: "http://api", getToken: () => "t", fetchFn });

    await expect(api.list()).rejects.toThrow("ไม่มีสิทธิ์");
  });

  it("maps donor type labels to Thai", () => {
    expect(donorTypeLabel("person")).toBe("บุคคล");
    expect(donorTypeLabel("organization")).toBe("นิติบุคคล");
  });
});
