import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { DonationsController } from "../src/donations/donations.controller";
import { LedgerController } from "../src/ledger/ledger.controller";
import { ReceiptsController } from "../src/receipts/receipts.controller";
import { ReportsController } from "../src/reports/reports.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const staffEmail = "staff@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const devPassword = "Password123!";

// An isolated future window no other spec touches.
const RPT_DATE = "2029-01-15";
const RANGE = { dateFrom: "2029-01-01", dateTo: "2029-01-31" };

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

async function reportExportAuditCount(tenantId: string): Promise<number> {
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
      `SELECT count(*) FROM audit_logs WHERE tenant_id = '${tenantId}' AND action = 'report:export'`,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return Number(stdout.trim());
}

async function setReceiptIssuedAt(receiptId: string, isoUtc: string): Promise<void> {
  await execFileAsync(
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
      "-c",
      `UPDATE receipts SET issued_at = '${isoUtc}' WHERE id = '${receiptId}'`,
    ],
    { maxBuffer: 1024 * 1024 },
  );
}

async function expectProjectHttpError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
): Promise<void> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(statusCode);
    expect((error as HttpException).getResponse()).toMatchObject({ error: { code, statusCode } });
    return;
  }
  throw new Error(`Expected ${statusCode} ${code} exception`);
}

describe("reports / export", () => {
  let app: INestApplication;
  let authService: AuthService;
  let reports: ReportsController;
  let donations: DonationsController;
  let receipts: ReceiptsController;
  let ledger: LedgerController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let staffToken: string;
  let expenseAccountA: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    reports = app.get(ReportsController);
    donations = app.get(DonationsController);
    receipts = app.get(ReceiptsController);
    ledger = app.get(LedgerController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    staffToken = (await authService.login({ email: staffEmail, password: devPassword })).accessToken;
    expenseAccountA = await accountId(templeA, "5000");
  });

  afterAll(async () => {
    await app.close();
  });

  it("builds a donation report (rows + baht + CSV) and writes a report:export audit row", async () => {
    const marker = `rptdonor-${randomUUID()}`;
    await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 12345,
      method: "cash",
      donationDate: RPT_DATE,
      note: marker,
    });

    const before = await reportExportAuditCount(templeA);
    const { report } = await reports.get(actorA, templeA, "127.0.0.1", "donations", RANGE);

    expect(report.type).toBe("donations");
    expect(report.columns).toContain("จำนวนเงิน (บาท)");
    const row = report.rows.find((cells) => cells.includes(marker));
    expect(row).toBeDefined();
    expect(row).toContain("123.45"); // 12345 satang -> 123.45 baht
    expect(report.csv).toContain(marker);
    expect(report.csv).toContain("123.45");

    // the export was audited
    const after = await reportExportAuditCount(templeA);
    expect(after).toBe(before + 1);
  });

  it("builds a ledger report containing a manual entry in range", async () => {
    const marker = `rptpayee-${randomUUID()}`;
    await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 6789,
      entryDate: RPT_DATE,
      payee: marker,
    });
    const { report } = await reports.get(actorA, templeA, "127.0.0.1", "ledger", RANGE);
    const row = report.rows.find((cells) => cells.includes(marker));
    expect(row).toBeDefined();
    expect(row).toContain("67.89");
  });

  it("builds a receipt report containing a freshly issued receipt", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: RPT_DATE,
    });
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId: donation.id });
    const { report } = await reports.get(actorA, templeA, "127.0.0.1", "receipts", {});
    expect(report.type).toBe("receipts");
    expect(report.csv).toContain(receipt.receiptNo);
  });

  it("respects the date filter (a marker outside the window does not appear)", async () => {
    const marker = `rptrange-${randomUUID()}`;
    await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 100,
      method: "cash",
      donationDate: RPT_DATE,
      note: marker,
    });
    const { report } = await reports.get(actorA, templeA, "127.0.0.1", "donations", {
      dateFrom: "2030-01-01",
      dateTo: "2030-01-31",
    });
    expect(report.csv).not.toContain(marker);
  });

  it("neutralises CSV formula injection in user-controlled text (note / payee)", async () => {
    const tag = randomUUID();
    const notePayload = `=rptinj-${tag}`;
    await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 100,
      method: "cash",
      donationDate: RPT_DATE,
      note: notePayload,
    });
    const payeePayload = `@rptpay-${tag}`;
    await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 100,
      entryDate: RPT_DATE,
      payee: payeePayload,
    });

    const { report: donationReport } = await reports.get(actorA, templeA, "127.0.0.1", "donations", RANGE);
    const donationRow = donationReport.rows.find((cells) => cells.some((cell) => cell.includes(tag)));
    expect(donationRow).toBeDefined();
    // the note cell is guarded with a leading apostrophe; the raw "=..." is never a cell on its own
    expect(donationRow).toContain(`'${notePayload}`);
    expect(donationReport.rows.some((cells) => cells.includes(notePayload))).toBe(false);
    expect(donationReport.csv).toContain(`'=rptinj-${tag}`);

    const { report: ledgerReport } = await reports.get(actorA, templeA, "127.0.0.1", "ledger", RANGE);
    const ledgerRow = ledgerReport.rows.find((cells) => cells.some((cell) => cell.includes(tag)));
    expect(ledgerRow).toContain(`'${payeePayload}`);
  });

  it("drops an unknown status filter (no 500) while a valid status still filters", async () => {
    const marker = `rptstat-${randomUUID()}`;
    await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 100,
      method: "cash",
      donationDate: RPT_DATE,
      note: marker,
    });

    // an unknown status must not reach the Prisma enum filter (that would throw a 500)
    const { report: ignored } = await reports.get(actorA, templeA, "127.0.0.1", "donations", {
      ...RANGE,
      status: "totally-bogus",
    });
    expect(ignored.csv).toContain(marker);

    // a valid status still filters: the donation defaults to "confirmed", so "cancelled" excludes it
    const { report: cancelled } = await reports.get(actorA, templeA, "127.0.0.1", "donations", {
      ...RANGE,
      status: "cancelled",
    });
    expect(cancelled.csv).not.toContain(marker);
  });

  it("buckets receipts by the ICT civil day, not the UTC day", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 4242,
      method: "cash",
      donationDate: "2031-03-10",
    });
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId: donation.id });
    // 2031-03-10 06:30 ICT == 2031-03-09 23:30 UTC: a UTC-day filter would mis-bucket it to 03-09
    await setReceiptIssuedAt(receipt.id, "2031-03-09T23:30:00Z");

    const inIctDay = await reports.get(actorA, templeA, "127.0.0.1", "receipts", {
      dateFrom: "2031-03-10",
      dateTo: "2031-03-10",
    });
    expect(inIctDay.report.csv).toContain(receipt.receiptNo);

    const prevIctDay = await reports.get(actorA, templeA, "127.0.0.1", "receipts", {
      dateFrom: "2031-03-09",
      dateTo: "2031-03-09",
    });
    expect(prevIctDay.report.csv).not.toContain(receipt.receiptNo);
  });

  it("never leaks another tenant's records into a report", async () => {
    const marker = `rptiso-${randomUUID()}`;
    await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 100,
      method: "cash",
      donationDate: RPT_DATE,
      note: marker,
    });
    const { report } = await reports.get(actorB, templeB, "127.0.0.1", "donations", RANGE);
    expect(report.csv).not.toContain(marker);
  });

  it("rejects an unknown report type with 422", async () => {
    await expectProjectHttpError(
      reports.get(actorA, templeA, "127.0.0.1", "nope", {}),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("restricts reports to admin/finance (staff rejected)", () => {
    expect(reflector.get<string[]>(ROLES_KEY, ReportsController.prototype.get)).toEqual(["admin", "finance"]);

    const guard = new RolesGuard(reflector);
    const handler = (): void => undefined;
    Reflect.defineMetadata(ROLES_KEY, ["admin", "finance"], handler);
    const request = {
      headers: { authorization: `Bearer ${staffToken}` },
      user: { sub: actorA.sub, tenant_id: templeA, role: "staff", email: staffEmail },
      currentTenantId: templeA,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => ReportsController,
    } as never;

    try {
      guard.canActivate(context);
      throw new Error("Expected RolesGuard to reject staff");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
    }
  });
});
