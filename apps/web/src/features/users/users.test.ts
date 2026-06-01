import { describe, expect, it, vi } from "vitest";
import { buildUserQuery, createUsersApiClient, roleLabel, type TenantUser } from "./users";

const user: TenantUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "staff@wat-arun.example",
  displayName: "เจ้าหน้าที่",
  role: "staff",
  isActive: true,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

describe("users helpers", () => {
  it("builds query strings and Thai role labels", () => {
    expect(buildUserQuery({})).toBe("");
    const params = new URLSearchParams(buildUserQuery({ role: "admin", isActive: false }));
    expect(params.get("role")).toBe("admin");
    expect(params.get("isActive")).toBe("false");
    expect(roleLabel("finance")).toBe("คนใช้งานวัด · การเงิน");
  });
});

describe("users API client", () => {
  it("lists with filters + token", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ users: [user] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = createUsersApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const rows = await api.list({ role: "staff" });
    expect(rows).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("http://api.test/users?role=staff");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("creates via POST and parses the user", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ user }), { status: 201, headers: { "content-type": "application/json" } }),
    );
    const api = createUsersApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const created = await api.create({ email: user.email, displayName: user.displayName, role: "staff", password: "Password123!" });
    expect(created.id).toBe(user.id);
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("surfaces the API's Thai error (e.g. last-admin / duplicate)", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "อีเมลนี้ถูกใช้แล้ว" } }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createUsersApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.create({ email: "x@y.co", displayName: "x", role: "staff", password: "Password123!" })).rejects.toThrow(
      "อีเมลนี้ถูกใช้แล้ว",
    );
  });
});
