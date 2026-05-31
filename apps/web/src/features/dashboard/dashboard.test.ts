import { describe, expect, it, vi } from "vitest";
import { createDashboardApiClient, displayBaht, methodLabel, statusLabel } from "./dashboard";

describe("dashboard helpers", () => {
  it("formats baht and maps method/status to Thai", () => {
    expect(displayBaht("123450")).toBe("฿1,234.50");
    expect(methodLabel("bank_transfer")).toBe("โอนเงิน");
    expect(statusLabel("confirmed")).toBe("ยืนยันแล้ว");
  });
});

describe("dashboard API client", () => {
  it("GETs /dashboard with the bearer token and parses the view", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            dashboard: {
              month: "2026-05",
              financial: null,
              newDonorsThisMonth: 3,
              awaitingReceiptCount: 1,
              awaitingReconciliationCount: 2,
              recentDonations: [],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const api = createDashboardApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const view = await api.get();
    expect(view.newDonorsThisMonth).toBe(3);
    expect(fetchFn.mock.calls[0]?.[0]).toContain("/dashboard");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("surfaces the API's Thai error message on failure", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "ไม่ได้รับอนุญาต" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createDashboardApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(api.get()).rejects.toThrow("ไม่ได้รับอนุญาต");
  });
});
