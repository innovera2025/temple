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

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const staffEmail = "staff@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const devPassword = "Password123!";

// A month no other test posts into, so the summary rollup is deterministic.
const SUMMARY_MONTH = "2027-03";

interface TokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}

interface AuditRow {
  action: string;
  entity_type: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
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

/** Upsert a fixture account (idempotent across repeated test runs). */
async function upsertAccount(
  tenantId: string,
  code: string,
  type: string,
  isActive: boolean,
): Promise<string> {
  await psql(`
    SET ROLE wat_migrate;
    INSERT INTO ledger_accounts (tenant_id, code, name_th, account_type, is_active)
    VALUES ('${tenantId}', '${code}', 'fixture ${code}', '${type}', ${isActive})
    ON CONFLICT (tenant_id, code)
    DO UPDATE SET account_type = EXCLUDED.account_type, is_active = EXCLUDED.is_active, updated_at = now();
    RESET ROLE;
  `);
  return accountId(tenantId, code);
}

async function auditRowsFor(tenantId: string, entityId: string): Promise<AuditRow[]> {
  return psqlJson<AuditRow>(`
    SELECT action, entity_type, "before", "after", reason
    FROM audit_logs
    WHERE tenant_id = '${tenantId}' AND entity_id = '${entityId}'
    ORDER BY created_at ASC
  `);
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

describe("manual ledger income/expense entries", () => {
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

  afterAll(async () => {
    await app.close();
  });

  it("records a manual expense entry: posted, LEDG number, expense direction, ledger:create audit", async () => {
    const { entry } = await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 30000,
      entryDate: "2026-05-20",
      payee: "ร้านดอกไม้",
      note: "ค่าดอกไม้บูชา",
    });

    expect(entry).toMatchObject({
      status: "posted",
      amountSatang: "30000",
      accountCode: "5000",
      accountType: "expense",
      direction: "expense",
      payee: "ร้านดอกไม้",
      description: "ค่าดอกไม้บูชา",
      donationId: null,
    });
    // At least 6 digits: zero-padded to 6, widening naturally past 1,000,000.
    expect(entry.entryNo).toMatch(/^LEDG-\d{6,}$/);

    const rows = await psqlJson<{ status: string; amount_satang: number; payee: string }>(
      `SELECT status, amount_satang, payee FROM ledger_entries WHERE id = '${entry.id}'`,
    );
    expect(rows).toEqual([{ status: "posted", amount_satang: 30000, payee: "ร้านดอกไม้" }]);

    const audit = await auditRowsFor(templeA, entry.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "ledger:create",
      entity_type: "ledger_entry",
      before: null,
      after: { status: "posted", amountSatang: "30000", entryNo: entry.entryNo },
    });
  });

  it("records a manual income entry to a revenue account (income direction)", async () => {
    const { entry } = await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: revenueAccountA,
      amountSatang: 80000,
      entryDate: "2026-05-21",
    });
    expect(entry).toMatchObject({ direction: "income", accountType: "revenue", status: "posted" });
  });

  it("rejects a non-postable (balance-sheet) account with 422", async () => {
    const assetAccountA = await accountId(templeA, "1000");
    await expectProjectHttpError(
      ledger.create(actorA, templeA, "127.0.0.1", {
        accountId: assetAccountA,
        amountSatang: 100,
        entryDate: "2026-05-20",
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects an inactive account with 422", async () => {
    const inactive = await upsertAccount(templeA, "5990", "expense", false);
    await expectProjectHttpError(
      ledger.create(actorA, templeA, "127.0.0.1", {
        accountId: inactive,
        amountSatang: 100,
        entryDate: "2026-05-20",
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects a cross-tenant account with 422 (invisible under RLS)", async () => {
    const expenseAccountB = await accountId(templeB, "5000");
    await expectProjectHttpError(
      ledger.create(actorA, templeA, "127.0.0.1", {
        accountId: expenseAccountB,
        amountSatang: 100,
        entryDate: "2026-05-20",
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects invalid amounts, dates, and missing account with 422", async () => {
    for (const body of [
      { accountId: expenseAccountA, amountSatang: 0, entryDate: "2026-05-20" },
      { accountId: expenseAccountA, amountSatang: -5, entryDate: "2026-05-20" },
      { accountId: expenseAccountA, amountSatang: 100.5, entryDate: "2026-05-20" },
      { accountId: expenseAccountA, amountSatang: 100, entryDate: "2026-13-40" },
      { accountId: "not-a-uuid", amountSatang: 100, entryDate: "2026-05-20" },
    ]) {
      await expectProjectHttpError(
        ledger.create(actorA, templeA, "127.0.0.1", body),
        422,
        "UNPROCESSABLE_ENTITY",
      );
    }
  });

  it("voids a manual entry (reason required) and keeps it visible as voided with a ledger:cancel audit", async () => {
    const { entry } = await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 12300,
      entryDate: "2026-05-22",
    });

    await expectProjectHttpError(
      ledger.void(actorA, templeA, "127.0.0.1", entry.id, { reason: "  " }),
      422,
      "UNPROCESSABLE_ENTITY",
    );

    const { entry: voided } = await ledger.void(actorA, templeA, "127.0.0.1", entry.id, {
      reason: "บันทึกซ้ำ",
    });
    expect(voided.status).toBe("voided");

    // Still present in the DB (no hard delete), now voided.
    const rows = await psqlJson<{ status: string }>(
      `SELECT status FROM ledger_entries WHERE id = '${entry.id}'`,
    );
    expect(rows).toEqual([{ status: "voided" }]);

    const cancel = (await auditRowsFor(templeA, entry.id)).find((r) => r.action === "ledger:cancel");
    expect(cancel).toMatchObject({ reason: "บันทึกซ้ำ", after: { status: "voided" } });

    // Voiding again -> 409.
    await expectProjectHttpError(
      ledger.void(actorA, templeA, "127.0.0.1", entry.id, { reason: "ซ้ำอีก" }),
      409,
      "CONFLICT",
    );
  });

  it("refuses to void a donation-linked entry via the ledger endpoint (must void the donation) -> 409", async () => {
    const { ledgerEntry } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: "2026-05-23",
    });
    await expectProjectHttpError(
      ledger.void(actorA, templeA, "127.0.0.1", ledgerEntry.id, { reason: "พยายามยกเลิก" }),
      409,
      "CONFLICT",
    );

    // The donation-linked entry is untouched (still posted).
    const rows = await psqlJson<{ status: string }>(
      `SELECT status FROM ledger_entries WHERE id = '${ledgerEntry.id}'`,
    );
    expect(rows).toEqual([{ status: "posted" }]);
  });

  it("summary counts only posted entries (voided excluded) and computes income/expense/balance", async () => {
    // Assert on the DELTA this test contributes, not the month's absolute totals:
    // the dev DB is shared and not truncated between standalone runs, so a fixed
    // month accumulates entries. Deltas stay correct no matter what else is there.
    const before = (await ledger.summary(templeA, { month: SUMMARY_MONTH })).summary;

    await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: revenueAccountA,
      amountSatang: 100000,
      entryDate: `${SUMMARY_MONTH}-10`,
    });
    await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 30000,
      entryDate: `${SUMMARY_MONTH}-12`,
    });
    const { entry: toVoid } = await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 20000,
      entryDate: `${SUMMARY_MONTH}-15`,
    });
    await ledger.void(actorA, templeA, "127.0.0.1", toVoid.id, { reason: "ยกเลิกออกจากยอดสรุป" });

    const after = (await ledger.summary(templeA, { month: SUMMARY_MONTH })).summary;

    // Range is derived from the month and is independent of the data.
    expect(after.dateFrom).toBe(`${SUMMARY_MONTH}-01`);
    expect(after.dateTo).toBe(`${SUMMARY_MONTH}-31`);
    // +1 income (100000) and +1 expense (30000); the 20000 voided entry must NOT
    // count — if voided entries were summed, the expense delta would be 50000.
    expect(after.incomeCount - before.incomeCount).toBe(1);
    expect(Number(after.incomeSatang) - Number(before.incomeSatang)).toBe(100000);
    expect(after.expenseCount - before.expenseCount).toBe(1);
    expect(Number(after.expenseSatang) - Number(before.expenseSatang)).toBe(30000);
    expect(Number(after.balanceSatang) - Number(before.balanceSatang)).toBe(70000);
  });

  it("keeps entries and summaries isolated per tenant", async () => {
    const marker = randomUUID();
    const { entry } = await ledger.create(actorA, templeA, "127.0.0.1", {
      accountId: expenseAccountA,
      amountSatang: 4444,
      entryDate: "2026-05-24",
      note: marker,
    });

    const fromB = await ledger.list(templeB, {});
    expect(fromB.entries.some((e) => e.id === entry.id)).toBe(false);
    await expectProjectHttpError(ledger.getOne(templeB, entry.id), 404, "NOT_FOUND");
    await expectProjectHttpError(
      ledger.void(actorB, templeB, "127.0.0.1", entry.id, { reason: "ข้ามวัด" }),
      404,
      "NOT_FOUND",
    );

    // Tenant B's summary for the dedicated month sees none of tenant A's postings.
    const { summary } = await ledger.summary(templeB, { month: SUMMARY_MONTH });
    expect(summary).toMatchObject({ incomeSatang: "0", expenseSatang: "0", balanceSatang: "0" });
  });

  it("lists the chart of accounts with direction", async () => {
    const { accounts } = await ledger.accounts(templeA, {});
    const revenue = accounts.find((a) => a.code === "4000");
    const expense = accounts.find((a) => a.code === "5000");
    const asset = accounts.find((a) => a.code === "1000");
    expect(revenue).toMatchObject({ accountType: "revenue", direction: "income", isActive: true });
    expect(expense).toMatchObject({ accountType: "expense", direction: "expense" });
    expect(asset).toMatchObject({ accountType: "asset", direction: null });
  });

  it("never allocates a duplicate entryNo under concurrent manual creation", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        ledger.create(actorA, templeA, "127.0.0.1", {
          accountId: expenseAccountA,
          amountSatang: 100,
          entryDate: "2026-05-25",
        }),
      ),
    );
    const entryNos = results.map((r) => r.entry.entryNo);
    expect(new Set(entryNos).size).toBe(entryNos.length);
  });

  it("rejects a malformed :id path param with 422 (not a 500)", async () => {
    await expectProjectHttpError(ledger.getOne(templeA, "not-a-uuid"), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(
      ledger.void(actorA, templeA, "127.0.0.1", "not-a-uuid", { reason: "x" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("caps an out-of-range skip so the list cannot 500 on a huge OFFSET", async () => {
    // skip=1e21 would overflow Postgres OFFSET and throw a non-HttpException 500;
    // parseLedgerEntrySearchQuery clamps it, so the list resolves cleanly.
    await expect(ledger.list(templeA, { skip: "1e21" })).resolves.toHaveProperty("entries");
  });

  it("restricts roles: write/summary admin+finance, reads also allow staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.create)).toEqual([
      "admin",
      "finance",
    ]);
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.void)).toEqual([
      "admin",
      "finance",
    ]);
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.summary)).toEqual([
      "admin",
      "finance",
    ]);
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.list)).toEqual([
      "admin",
      "finance",
      "staff",
    ]);
    expect(reflector.get<string[]>(ROLES_KEY, LedgerController.prototype.accounts)).toEqual([
      "admin",
      "finance",
      "staff",
    ]);

    // A staff token is rejected by RolesGuard on the write/summary handlers.
    const rolesGuard = new RolesGuard(reflector);
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
      rolesGuard.canActivate(context);
      throw new Error("Expected RolesGuard to reject staff on a finance-only handler");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
    }
  });
});
