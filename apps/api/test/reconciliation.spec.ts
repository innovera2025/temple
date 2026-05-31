import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { DonationsController } from "../src/donations/donations.controller";
import { LedgerController } from "../src/ledger/ledger.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const staffEmail = "staff@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const devPassword = "Password123!";

// An isolated future range no other spec touches, so closing it never locks
// another spec's entries (other specs use 2026-05 / 2027-03).
const P_START = "2028-03-01";
const P_END = "2028-03-31";
const IN_PERIOD = "2028-03-15";

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

async function psql(sql: string): Promise<string> {
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
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-At",
      "-c",
      sql,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return stdout.trim();
}

async function psqlJson<T>(sql: string): Promise<T[]> {
  const stdout = await psql(
    `WITH q AS (${sql.replace(/;+\s*$/, "")}) SELECT COALESCE(json_agg(q), '[]'::json) FROM q;`,
  );
  return JSON.parse(stdout || "[]") as T[];
}

async function accountId(tenantId: string, code: string): Promise<string> {
  const rows = await psqlJson<{ id: string }>(
    `SELECT id FROM ledger_accounts WHERE tenant_id = '${tenantId}' AND code = '${code}'`,
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`No ledger account ${code} for tenant ${tenantId}`);
  }
  return id;
}

async function auditActions(tenantId: string, entityId: string): Promise<string[]> {
  const rows = await psqlJson<{ action: string }>(
    `SELECT action FROM audit_logs WHERE tenant_id = '${tenantId}' AND entity_id = '${entityId}' ORDER BY created_at ASC`,
  );
  return rows.map((r) => r.action);
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
    const exception = error as HttpException;
    expect(exception.getStatus()).toBe(statusCode);
    expect(exception.getResponse()).toMatchObject({ error: { code, statusCode } });
    return;
  }
  throw new Error(`Expected ${statusCode} ${code} exception`);
}

describe("reconciliation / close period", () => {
  let app: INestApplication;
  let authService: AuthService;
  let ledger: LedgerController;
  let donations: DonationsController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let staffToken: string;
  let expenseAccountA: string;
  let revenueAccountA: string;

  async function manualEntry(entryDate: string, code = "5000", amountSatang = 12345): Promise<string> {
    const { entry } = await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: code === "5000" ? expenseAccountA : revenueAccountA,
      amountSatang,
      entryDate,
    });
    return entry.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    ledger = app.get(LedgerController);
    donations = app.get(DonationsController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    staffToken = (await authService.login({ email: staffEmail, password: devPassword })).accessToken;
    expenseAccountA = await accountId(templeA, "5000");
    revenueAccountA = await accountId(templeA, "4000");
  });

  // Start each test with no closed periods so the lock state is deterministic
  // and the suite is idempotent on the shared dev DB.
  beforeEach(async () => {
    await psql(`DELETE FROM reconciliation_periods WHERE tenant_id IN ('${templeA}', '${templeB}')`);
  });

  afterAll(async () => {
    await app.close();
  });

  it("closes a period (status closed, recorded closedBy) and audits period:close", async () => {
    const { period } = await ledger.closePeriod(actorA, templeA, "127.0.0.1", {
      periodStart: P_START,
      periodEnd: P_END,
    });
    expect(period).toMatchObject({ periodStart: P_START, periodEnd: P_END, status: "closed", closedByUserId: actorA.sub });
    expect(period.closedAt).not.toBeNull();

    expect(await auditActions(templeA, period.id)).toContain("period:close");
  });

  it("rejects an invalid range (end before start) with 422", async () => {
    await expectProjectHttpError(
      ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_END, periodEnd: P_START }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects an overlapping closed period with 409", async () => {
    await ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END });
    await expectProjectHttpError(
      ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: "2028-03-15", periodEnd: "2028-04-15" }),
      409,
      "CONFLICT",
    );
  });

  it("reconciles a posted entry (sets reconciledAt + ledger:reconcile audit); voided/repeat rules", async () => {
    const entryId = await manualEntry(IN_PERIOD);
    const { entry } = await ledger.reconcile(actorA, templeA, "127.0.0.1", entryId);
    expect(entry.reconciledAt).not.toBeNull();
    expect(await auditActions(templeA, entryId)).toContain("ledger:reconcile");

    // a voided entry cannot be reconciled
    const voidId = await manualEntry("2028-03-16");
    await ledger.void(actorA, templeA, "127.0.0.1", voidId, { reason: "ยกเลิก" });
    await expectProjectHttpError(
      ledger.reconcile(actorA, templeA, "127.0.0.1", voidId),
      409,
      "CONFLICT",
    );
  });

  it("locks manual create and void inside a closed period (409)", async () => {
    // entry created BEFORE closing, then the period closes around its date
    const entryId = await manualEntry(IN_PERIOD);
    await ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END });

    await expectProjectHttpError(
      ledger.void(actorA, templeA, "127.0.0.1", entryId, { reason: "ยกเลิกหลังปิดงวด" }),
      409,
      "CONFLICT",
    );
    await expectProjectHttpError(
      ledger.create(actorA, templeA, "127.0.0.1", { accountId: expenseAccountA, amountSatang: 100, entryDate: IN_PERIOD }),
      409,
      "CONFLICT",
    );
    // and reconcile is locked too
    await expectProjectHttpError(
      ledger.reconcile(actorA, templeA, "127.0.0.1", entryId),
      409,
      "CONFLICT",
    );
  });

  it("blocks recording a donation dated in a closed period (409)", async () => {
    await ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END });
    await expectProjectHttpError(
      donations.create(actorA, templeA, "127.0.0.1", { amountSatang: 50000, method: "cash", donationDate: IN_PERIOD }),
      409,
      "CONFLICT",
    );
  });

  it("blocks voiding a donation whose ledger entry is in a closed period (409), donation stays confirmed", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: IN_PERIOD,
    });
    await ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END });

    await expectProjectHttpError(
      donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "ยกเลิกหลังปิดงวด" }),
      409,
      "CONFLICT",
    );
    const rows = await psqlJson<{ status: string }>(
      `SELECT status::text FROM donations WHERE id = '${donation.id}'`,
    );
    expect(rows).toEqual([{ status: "confirmed" }]);
  });

  it("blocks editing a donation whose ledger entry is in a closed period (409)", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: IN_PERIOD,
    });
    await ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END });

    await expectProjectHttpError(
      donations.update(actorA, templeA, "127.0.0.1", donation.id, { amountSatang: 70000 }),
      409,
      "CONFLICT",
    );
  });

  it("keeps a closed period scoped to its tenant (does not lock another tenant)", async () => {
    await ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END });
    // tenant B can still record a donation dated in the same range
    const result = await donations.create(actorB, templeB, "127.0.0.1", {
      amountSatang: 1000,
      method: "cash",
      donationDate: IN_PERIOD,
    });
    expect(result.donation.status).toBe("confirmed");
  });

  it("rejects a malformed :id on reconcile with 422", async () => {
    await expectProjectHttpError(
      ledger.reconcile(actorA, templeA, "127.0.0.1", "not-a-uuid"),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects re-reconciling an already-reconciled entry (409) with no duplicate audit row", async () => {
    const entryId = await manualEntry(IN_PERIOD);
    await ledger.reconcile(actorA, templeA, "127.0.0.1", entryId);
    await expectProjectHttpError(
      ledger.reconcile(actorA, templeA, "127.0.0.1", entryId),
      409,
      "CONFLICT",
    );
    const rows = await psqlJson<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = '${templeA}' AND entity_id = '${entryId}' AND action = 'ledger:reconcile'`,
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("serializes concurrent identical closes: exactly one succeeds, the other 409 (never a 500)", async () => {
    const settled = await Promise.allSettled([
      ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END }),
      ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END }),
    ]);
    const fulfilled = settled.filter((s) => s.status === "fulfilled");
    const rejected = settled.filter((s) => s.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(((rejected[0] as PromiseRejectedResult).reason as HttpException).getStatus()).toBe(409);
  });

  it("serializes a close against a concurrent in-range create (no entry slips past the lock)", async () => {
    const settled = await Promise.allSettled([
      ledger.closePeriod(actorA, templeA, "127.0.0.1", { periodStart: P_START, periodEnd: P_END }),
      ledger.create(actorA, templeA, "127.0.0.1", { accountId: expenseAccountA, amountSatang: 7777, entryDate: IN_PERIOD }),
    ]);
    expect(settled[0]?.status).toBe("fulfilled"); // the close always commits
    const createResult = settled[1];
    if (createResult?.status === "rejected") {
      expect((createResult.reason as HttpException).getStatus()).toBe(409); // blocked, never a 500
    }
    // Once closed, any further in-range create is rejected.
    await expectProjectHttpError(
      ledger.create(actorA, templeA, "127.0.0.1", { accountId: expenseAccountA, amountSatang: 100, entryDate: IN_PERIOD }),
      409,
      "CONFLICT",
    );
  });

  it("restricts roles: close/reconcile = admin/finance; period list also allows staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.closePeriod)).toEqual(["admin", "finance"]);
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.reconcile)).toEqual(["admin", "finance"]);
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.listPeriods)).toEqual([
      "admin",
      "finance",
      "staff",
    ]);

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
      getClass: () => LedgerController,
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
