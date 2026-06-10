import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { DashboardController } from "../src/dashboard/dashboard.controller";
import { ictMonth, ictMonthStart } from "../src/dashboard/dashboard.service";
import { DonationsController } from "../src/donations/donations.controller";
import { DonorsController } from "../src/donors/donors.controller";
import { LedgerController } from "../src/ledger/ledger.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const financeEmail = "finance@wat-arun.example";
const staffEmail = "staff@wat-arun.example";
const devPassword = "Password123!";

// Use the actual current ICT month — the service derives "this month" from the
// system clock in ICT (UTC+7), matching the reports module. Computing it the
// same way here removes the 7-hour window where a UTC-derived month disagrees.
const NOW_ICT = new Date(Date.now() + 7 * 60 * 60 * 1000);
const THIS_MONTH = `${NOW_ICT.getUTCFullYear()}-${String(NOW_ICT.getUTCMonth() + 1).padStart(2, "0")}`;
const IN_MONTH = `${THIS_MONTH}-15`;

interface TokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}

function decodeJwtPayload(token: string): TokenPayload {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new Error("JWT payload segment is missing");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
}

async function accountId(tenantId: string, code: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec",
      "-i",
      process.env.POSTGRES_CONTAINER ?? "wat-dev-db",
      "psql",
      "-U",
      process.env.POSTGRES_USER ?? "wat_dev",
      "-d",
      process.env.POSTGRES_DB ?? "wat_dev",
      "-At",
      "-c",
      `SELECT id FROM ledger_accounts WHERE tenant_id = '${tenantId}' AND code = '${code}'`,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return stdout.trim();
}

describe("finance dashboard", () => {
  let app: INestApplication;
  let authService: AuthService;
  let dashboard: DashboardController;
  let donations: DonationsController;
  let donors: DonorsController;
  let ledger: LedgerController;
  let reflector: Reflector;
  let financeActor: TokenPayload;
  let staffActor: TokenPayload;
  let expenseAccountA: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    dashboard = app.get(DashboardController);
    donations = app.get(DonationsController);
    donors = app.get(DonorsController);
    ledger = app.get(LedgerController);
    reflector = app.get(Reflector);

    financeActor = decodeJwtPayload((await authService.login({ email: financeEmail, password: devPassword })).accessToken);
    staffActor = decodeJwtPayload((await authService.login({ email: staffEmail, password: devPassword })).accessToken);
    expenseAccountA = await accountId(templeA, "5000");
  });

  afterAll(async () => {
    await app.close();
  });

  it("hides financial metrics + recent donations from a non-finance (staff) role", async () => {
    const { dashboard: view } = await dashboard.get(staffActor, templeA);
    expect(view.financial).toBeNull();
    expect(view.recentDonations).toEqual([]);
    // operational counts are still present for staff
    expect(typeof view.awaitingReceiptCount).toBe("number");
    expect(view.awaitingReceiptCount).toBeGreaterThanOrEqual(0);
  });

  it("shows internally-consistent financial metrics to a finance role", async () => {
    const { dashboard: view } = await dashboard.get(financeActor, templeA);
    expect(view.financial).not.toBeNull();
    const fin = view.financial!;
    expect(fin.month).toBe(THIS_MONTH);
    // balance = income − expense, computed in BigInt (no precision loss)
    expect(BigInt(fin.balanceSatang)).toBe(BigInt(fin.incomeSatang) - BigInt(fin.expenseSatang));
    expect(Array.isArray(view.recentDonations)).toBe(true);
  });

  it("counts a freshly recorded donation toward income and the awaiting-receipt queue", async () => {
    const amount = 50000;
    await donations.create(financeActor, templeA, "127.0.0.1", {
      amountSatang: amount,
      method: "cash",
      donationDate: IN_MONTH,
    });

    const { dashboard: view } = await dashboard.get(financeActor, templeA);
    // income is the sum of all posted revenue this month, so it includes ≥ our donation
    expect(Number(view.financial!.incomeSatang)).toBeGreaterThanOrEqual(amount);
    // our confirmed donation has no receipt yet -> at least one item awaits a receipt
    expect(view.awaitingReceiptCount).toBeGreaterThanOrEqual(1);
    // it shows up in the recent list for finance
    expect(view.recentDonations.length).toBeGreaterThan(0);
    expect(view.recentDonations[0]).toMatchObject({ amountSatang: expect.any(String), status: expect.any(String) });
  });

  it("counts a posted manual entry toward the awaiting-reconciliation queue", async () => {
    await ledger.create(financeActor, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 4321,
      entryDate: IN_MONTH,
    });
    const { dashboard: view } = await dashboard.get(financeActor, templeA);
    expect(view.awaitingReconciliationCount).toBeGreaterThanOrEqual(1);
  });

  it("counts a new donor toward this month's new-donor metric", async () => {
    await donors.create(financeActor, templeA, "127.0.0.1", { displayName: `ผู้บริจาคใหม่ ${randomUUID()}` });
    const { dashboard: view } = await dashboard.get(financeActor, templeA);
    expect(view.newDonorsThisMonth).toBeGreaterThanOrEqual(1);
  });

  it("withholds money from staff even when the tenant already has recent donations", async () => {
    // Ensure the tenant HAS confirmed donations this month, so an empty staff
    // result proves gating (not just absence of data).
    await donations.create(financeActor, templeA, "127.0.0.1", {
      amountSatang: 12345,
      method: "cash",
      donationDate: IN_MONTH,
    });

    const finance = (await dashboard.get(financeActor, templeA)).dashboard;
    expect(finance.recentDonations.length).toBeGreaterThan(0); // data exists

    const staff = (await dashboard.get(staffActor, templeA)).dashboard;
    expect(staff.financial).toBeNull();
    expect(staff.recentDonations).toEqual([]); // still withheld despite data
  });

  it("restricts the dashboard to authenticated tenant roles", () => {
    expect(reflector.get<string[]>(ROLES_KEY, DashboardController.prototype.get)).toEqual([
      "admin",
      "finance",
      "staff",
    ]);
  });

  it("derives 'this month' from the ICT calendar, not UTC (fixed-clock boundaries)", () => {
    // 2026-05-31 18:30 UTC == 2026-06-01 01:30 ICT -> June in Thailand
    expect(ictMonth(new Date("2026-05-31T18:30:00.000Z"))).toBe("2026-06");
    // 2026-06-30 16:59 UTC == 2026-06-30 23:59 ICT -> still June
    expect(ictMonth(new Date("2026-06-30T16:59:00.000Z"))).toBe("2026-06");
    // 2026-06-30 17:00 UTC == 2026-07-01 00:00 ICT -> July begins
    expect(ictMonth(new Date("2026-06-30T17:00:00.000Z"))).toBe("2026-07");
    // and the month-start instant is ICT midnight (17:00 UTC the previous day)
    expect(ictMonthStart("2026-06").toISOString()).toBe("2026-05-31T17:00:00.000Z");
  });
});
