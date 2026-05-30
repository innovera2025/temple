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
import { DonorsController } from "../src/donors/donors.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const staffEmail = "staff@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const devPassword = "Password123!";
const today = "2026-05-30";

interface TokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}

interface AuditRow {
  action: string;
  entity_type: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  ip: string | null;
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

async function auditRowsFor(tenantId: string, entityId: string): Promise<AuditRow[]> {
  return psqlJson<AuditRow>(`
    SELECT action, entity_type, entity_id, "before", "after", reason, ip
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

describe("donations + auto-posted income ledger", () => {
  let app: INestApplication;
  let authService: AuthService;
  let donations: DonationsController;
  let donors: DonorsController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let staffToken: string;
  let revenueAccountA: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    donations = app.get(DonationsController);
    donors = app.get(DonorsController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    staffToken = (await authService.login({ email: staffEmail, password: devPassword })).accessToken;
    revenueAccountA = await accountId(templeA, "4000");
  });

  afterAll(async () => {
    await app.close();
  });

  it("records a donation and atomically posts one linked, posted income ledger entry", async () => {
    const { donation, ledgerEntry } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });

    expect(donation).toMatchObject({ status: "confirmed", amountSatang: "50000", method: "cash" });
    expect(ledgerEntry).toMatchObject({
      status: "posted",
      amountSatang: "50000",
      donationId: donation.id,
      accountId: revenueAccountA, // default revenue account 4000 (D2)
    });
    expect(ledgerEntry.entryNo).toMatch(/^LEDG-\d{6}$/);

    // The entry truly exists in the DB, posted and linked.
    const entryRows = await psqlJson<{ status: string; amount_satang: number; donation_id: string }>(`
      SELECT status, amount_satang, donation_id FROM ledger_entries WHERE id = '${ledgerEntry.id}'
    `);
    expect(entryRows).toEqual([
      { status: "posted", amount_satang: 50000, donation_id: donation.id },
    ]);

    const donationAudit = await auditRowsFor(templeA, donation.id);
    expect(donationAudit).toHaveLength(1);
    expect(donationAudit[0]).toMatchObject({
      action: "donation:create",
      entity_type: "donation",
      before: null,
      after: { status: "confirmed", amountSatang: "50000", method: "cash" },
    });

    const ledgerAudit = await auditRowsFor(templeA, ledgerEntry.id);
    expect(ledgerAudit).toHaveLength(1);
    expect(ledgerAudit[0]).toMatchObject({
      action: "ledger:post",
      entity_type: "ledger_entry",
      after: { status: "posted", amountSatang: "50000", entryNo: ledgerEntry.entryNo, donationId: donation.id },
    });
  });

  it("links a donation to its donor and shows it in the donor's history", async () => {
    const donor = await donors.create(actorA, templeA, "127.0.0.1", { displayName: `ผู้บริจาค ${randomUUID()}` });
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 120000,
      method: "bank_transfer",
      donationDate: today,
      donorId: donor.donor.id,
    });

    const history = await donations.list(templeA, { donorId: donor.donor.id });
    expect(history.donations).toEqual([expect.objectContaining({ id: donation.id, donorId: donor.donor.id })]);
  });

  it("allows anonymous donations (no donor)", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 9900,
      method: "qr",
      donationDate: today,
    });
    expect(donation.donorId).toBeNull();
  });

  it("rejects invalid amounts and fields with 422", async () => {
    for (const body of [
      { amountSatang: 0, method: "cash", donationDate: today },
      { amountSatang: -100, method: "cash", donationDate: today },
      { amountSatang: 100.5, method: "cash", donationDate: today },
      { amountSatang: 100, method: "cheque", donationDate: today },
      { amountSatang: 100, method: "cash", donationDate: "2026-13-40" },
    ]) {
      await expectProjectHttpError(
        donations.create(actorA, templeA, "127.0.0.1", body),
        422,
        "UNPROCESSABLE_ENTITY",
      );
    }
  });

  it("rejects a non-revenue or cross-tenant fund account with 422", async () => {
    const assetAccountA = await accountId(templeA, "1000");
    const revenueAccountB = await accountId(templeB, "4000");

    await expectProjectHttpError(
      donations.create(actorA, templeA, "127.0.0.1", {
        amountSatang: 100,
        method: "cash",
        donationDate: today,
        fundAccountId: assetAccountA,
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );

    // Tenant B's revenue account is invisible under tenant A's RLS scope -> 422.
    await expectProjectHttpError(
      donations.create(actorA, templeA, "127.0.0.1", {
        amountSatang: 100,
        method: "cash",
        donationDate: today,
        fundAccountId: revenueAccountB,
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects a donor that belongs to another tenant with 404", async () => {
    const donorB = await donors.create(actorB, templeB, "127.0.0.1", { displayName: `ข้ามวัด ${randomUUID()}` });
    await expectProjectHttpError(
      donations.create(actorA, templeA, "127.0.0.1", {
        amountSatang: 100,
        method: "cash",
        donationDate: today,
        donorId: donorB.donor.id,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("recalculates the linked posted entry on edit and audits donation:update + ledger:update", async () => {
    const { donation, ledgerEntry } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });

    const edited = await donations.update(actorA, templeA, "127.0.0.1", donation.id, { amountSatang: 70000 });
    expect(edited.donation.amountSatang).toBe("70000");

    const entryRows = await psqlJson<{ amount_satang: number; status: string }>(`
      SELECT amount_satang, status FROM ledger_entries WHERE id = '${ledgerEntry.id}'
    `);
    expect(entryRows).toEqual([{ amount_satang: 70000, status: "posted" }]);

    const donationActions = (await auditRowsFor(templeA, donation.id)).map((row) => row.action);
    expect(donationActions).toContain("donation:update");
    const ledgerActions = (await auditRowsFor(templeA, ledgerEntry.id)).map((row) => row.action);
    expect(ledgerActions).toContain("ledger:update");
  });

  it("requires a reason to void (422 when missing)", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });

    await expectProjectHttpError(
      donations.void(actorA, templeA, "127.0.0.1", donation.id, {}),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "   " }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("void reverses receipt -> ledger -> donation in one transaction, each audited", async () => {
    const { donation, ledgerEntry } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });

    // Simulate a Task-6 issued receipt so the void guard has something to reverse.
    const receiptNo = `RCPT-T-${randomUUID().slice(0, 8)}`;
    const receiptRows = await psqlJson<{ id: string }>(`
      INSERT INTO receipts (tenant_id, donation_id, receipt_no, status)
      VALUES ('${templeA}', '${donation.id}', '${receiptNo}', 'issued')
      RETURNING id
    `);
    const receiptId = receiptRows[0]!.id;

    const voided = await donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "บันทึกผิดพลาด" });
    expect(voided.donation.status).toBe("cancelled");

    const state = await psqlJson<{ kind: string; status: string }>(`
      SELECT 'donation' AS kind, status::text FROM donations WHERE id = '${donation.id}'
      UNION ALL SELECT 'ledger', status::text FROM ledger_entries WHERE id = '${ledgerEntry.id}'
      UNION ALL SELECT 'receipt', status::text FROM receipts WHERE id = '${receiptId}'
    `);
    const byKind = Object.fromEntries(state.map((row) => [row.kind, row.status]));
    expect(byKind).toEqual({ donation: "cancelled", ledger: "voided", receipt: "voided" });

    const donationAudit = await auditRowsFor(templeA, donation.id);
    const voidRow = donationAudit.find((row) => row.action === "donation:void");
    expect(voidRow).toMatchObject({ reason: "บันทึกผิดพลาด", after: { status: "cancelled" } });

    const ledgerVoid = (await auditRowsFor(templeA, ledgerEntry.id)).find((r) => r.action === "ledger:cancel");
    expect(ledgerVoid).toMatchObject({ reason: "บันทึกผิดพลาด", after: { status: "voided" } });

    const receiptVoid = (await auditRowsFor(templeA, receiptId)).find((r) => r.action === "receipt:void");
    expect(receiptVoid).toMatchObject({ reason: "บันทึกผิดพลาด", after: { status: "voided" } });
  });

  it("rejects voiding an already-cancelled donation with 409", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });
    await donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "ยกเลิกรอบแรก" });
    await expectProjectHttpError(
      donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "ยกเลิกซ้ำ" }),
      409,
      "CONFLICT",
    );
  });

  it("rejects editing a cancelled donation with 409", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });
    await donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "ยกเลิก" });
    await expectProjectHttpError(
      donations.update(actorA, templeA, "127.0.0.1", donation.id, { amountSatang: 80000 }),
      409,
      "CONFLICT",
    );
  });

  it("rejects editing a donation that still has an active (issued) receipt with 409", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });
    const receiptNo = `RCPT-T-${randomUUID().slice(0, 8)}`;
    await psql(`
      INSERT INTO receipts (tenant_id, donation_id, receipt_no, status)
      VALUES ('${templeA}', '${donation.id}', '${receiptNo}', 'issued')
    `);
    await expectProjectHttpError(
      donations.update(actorA, templeA, "127.0.0.1", donation.id, { amountSatang: 80000 }),
      409,
      "CONFLICT",
    );
  });

  it("keeps donations and ledger entries isolated per tenant", async () => {
    const marker = randomUUID();
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 33300,
      method: "cash",
      donationDate: today,
      note: marker,
    });

    // Tenant B cannot see, fetch, or void tenant A's donation.
    const fromB = await donations.list(templeB, {});
    expect(fromB.donations.some((d) => d.id === donation.id)).toBe(false);
    await expectProjectHttpError(donations.getOne(templeB, donation.id), 404, "NOT_FOUND");
    await expectProjectHttpError(
      donations.void(actorB, templeB, "127.0.0.1", donation.id, { reason: "ข้ามวัด" }),
      404,
      "NOT_FOUND",
    );
  });

  it("never allocates a duplicate entryNo under concurrent creation", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        donations.create(actorA, templeA, "127.0.0.1", {
          amountSatang: 100,
          method: "cash",
          donationDate: today,
        }),
      ),
    );
    const entryNos = results.map((r) => r.ledgerEntry.entryNo);
    expect(new Set(entryNos).size).toBe(entryNos.length);
    for (const entryNo of entryNos) {
      expect(entryNo).toMatch(/^LEDG-\d{6}$/);
    }
  });

  it("serializes concurrent voids: one succeeds, the other gets 409, single void audit row", async () => {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });

    const results = await Promise.allSettled([
      donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "ยกเลิกพร้อมกัน 1" }),
      donations.void(actorA, templeA, "127.0.0.1", donation.id, { reason: "ยกเลิกพร้อมกัน 2" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(HttpException);
    expect((reason as HttpException).getStatus()).toBe(409);

    // Exactly one real confirmed->cancelled transition was recorded (no phantom void audit).
    const voidAudits = (await auditRowsFor(templeA, donation.id)).filter((r) => r.action === "donation:void");
    expect(voidAudits).toHaveLength(1);
  });

  it("tolerates calendar-invalid list date filters instead of crashing with a 500", async () => {
    // 2026-13-40 is out of range; 2026-02-31 would silently roll over — both must be dropped.
    await expect(
      donations.list(templeA, { dateFrom: "2026-13-40", dateTo: "2026-02-31" }),
    ).resolves.toHaveProperty("donations");
  });

  it("revalidates the fund account on edit: non-revenue or cross-tenant -> 422", async () => {
    const assetAccountA = await accountId(templeA, "1000");
    const revenueAccountB = await accountId(templeB, "4000");
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
    });

    await expectProjectHttpError(
      donations.update(actorA, templeA, "127.0.0.1", donation.id, { fundAccountId: assetAccountA }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      donations.update(actorA, templeA, "127.0.0.1", donation.id, { fundAccountId: revenueAccountB }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("re-resolves to the default revenue account and audits ledger:update when fundAccountId is cleared", async () => {
    const { donation, ledgerEntry } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang: 50000,
      method: "cash",
      donationDate: today,
      fundAccountId: revenueAccountA,
    });

    const edited = await donations.update(actorA, templeA, "127.0.0.1", donation.id, { fundAccountId: null });
    expect(edited.donation.fundAccountId).toBeNull();

    const entryRows = await psqlJson<{ account_id: string }>(
      `SELECT account_id FROM ledger_entries WHERE id = '${ledgerEntry.id}'`,
    );
    expect(entryRows[0]?.account_id).toBe(revenueAccountA);

    const ledgerActions = (await auditRowsFor(templeA, ledgerEntry.id)).map((r) => r.action);
    expect(ledgerActions).toContain("ledger:update");
  });

  it("rejects a malformed :id path param with 422 (not a 500)", async () => {
    await expectProjectHttpError(donations.getOne(templeA, "not-a-uuid"), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(
      donations.update(actorA, templeA, "127.0.0.1", "not-a-uuid", { amountSatang: 100 }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      donations.void(actorA, templeA, "127.0.0.1", "not-a-uuid", { reason: "x" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("restricts roles: create allows staff, void is admin/finance only", () => {
    expect(reflector.get<string[]>(ROLES_KEY, DonationsController.prototype.create)).toEqual([
      "admin",
      "finance",
      "staff",
    ]);
    expect(reflector.get<string[]>(ROLES_KEY, DonationsController.prototype.void)).toEqual([
      "admin",
      "finance",
    ]);

    // A staff token is rejected by RolesGuard on the void handler.
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
      getClass: () => DonationsController,
    } as never;

    try {
      rolesGuard.canActivate(context);
      throw new Error("Expected RolesGuard to reject staff on void");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
    }
  });
});
