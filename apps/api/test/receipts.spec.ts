import { execFile } from "node:child_process";
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
import { ReceiptsController } from "../src/receipts/receipts.controller";

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

async function auditRowsFor(tenantId: string, entityId: string): Promise<AuditRow[]> {
  return psqlJson<AuditRow>(`
    SELECT action, entity_type, entity_id, "before", "after", reason
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

describe("receipts / ใบอนุโมทนา (issue/void/reissue/preview)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let receipts: ReceiptsController;
  let donations: DonationsController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let staffToken: string;

  async function newDonation(amountSatang = 50000, donorId?: string): Promise<string> {
    const { donation } = await donations.create(actorA, templeA, "127.0.0.1", {
      amountSatang,
      method: "cash",
      donationDate: today,
      donorId,
    });
    return donation.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    receipts = app.get(ReceiptsController);
    donations = app.get(DonationsController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    staffToken = (await authService.login({ email: staffEmail, password: devPassword })).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("issues a receipt with a unique number, linked to the donation, and audits receipt:issue", async () => {
    const donationId = await newDonation();
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });

    expect(receipt).toMatchObject({ status: "issued", donationId, supersededByReceiptId: null });
    expect(receipt.receiptNo).toMatch(/^RCPT-\d{6}$/);

    const rows = await psqlJson<{ status: string; donation_id: string }>(
      `SELECT status, donation_id FROM receipts WHERE id = '${receipt.id}'`,
    );
    expect(rows).toEqual([{ status: "issued", donation_id: donationId }]);

    const audit = await auditRowsFor(templeA, receipt.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "receipt:issue", after: { status: "issued", receiptNo: receipt.receiptNo } });
  });

  it("allows only one active receipt per donation (409 on second issue)", async () => {
    const donationId = await newDonation();
    await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });
    await expectProjectHttpError(
      receipts.issue(actorA, templeA, "127.0.0.1", { donationId }),
      409,
      "CONFLICT",
    );
  });

  it("refuses to issue for a cancelled donation (409) or a missing/cross-tenant donation (404/422)", async () => {
    const donationId = await newDonation();
    await donations.void(actorA, templeA, "127.0.0.1", donationId, { reason: "ยกเลิก" });
    await expectProjectHttpError(
      receipts.issue(actorA, templeA, "127.0.0.1", { donationId }),
      409,
      "CONFLICT",
    );

    // cross-tenant donation id -> 404 (RLS hides it)
    const otherDonation = (
      await donations.create(actorB, templeB, "127.0.0.1", { amountSatang: 100, method: "cash", donationDate: today })
    ).donation.id;
    await expectProjectHttpError(
      receipts.issue(actorA, templeA, "127.0.0.1", { donationId: otherDonation }),
      404,
      "NOT_FOUND",
    );

    // malformed donationId -> 422 validation
    await expectProjectHttpError(
      receipts.issue(actorA, templeA, "127.0.0.1", { donationId: "not-a-uuid" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("voids an issued receipt (reason required), keeps it visible, and rejects double-void", async () => {
    const donationId = await newDonation();
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });

    await expectProjectHttpError(
      receipts.void(actorA, templeA, "127.0.0.1", receipt.id, {}),
      422,
      "UNPROCESSABLE_ENTITY",
    );

    const voided = await receipts.void(actorA, templeA, "127.0.0.1", receipt.id, { reason: "พิมพ์ชื่อผิด" });
    expect(voided.receipt.status).toBe("voided");

    const audit = (await auditRowsFor(templeA, receipt.id)).find((r) => r.action === "receipt:void");
    expect(audit).toMatchObject({ reason: "พิมพ์ชื่อผิด", after: { status: "voided" } });

    await expectProjectHttpError(
      receipts.void(actorA, templeA, "127.0.0.1", receipt.id, { reason: "ซ้ำ" }),
      409,
      "CONFLICT",
    );
  });

  it("reissues: old -> superseded (linked), new issued with a new number, both audited", async () => {
    const donationId = await newDonation();
    const { receipt: original } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });

    const { superseded, receipt: fresh } = await receipts.reissue(
      actorA,
      templeA,
      "127.0.0.1",
      original.id,
      { reason: "แก้ไขข้อมูลผู้บริจาค" },
    );

    expect(superseded).toMatchObject({ id: original.id, status: "superseded", supersededByReceiptId: fresh.id });
    expect(fresh).toMatchObject({ status: "issued", donationId });
    expect(fresh.receiptNo).not.toBe(original.receiptNo);
    expect(fresh.receiptNo).toMatch(/^RCPT-\d{6}$/);

    const oldActions = (await auditRowsFor(templeA, original.id)).map((r) => r.action);
    expect(oldActions).toContain("receipt:reissue");
    const newActions = (await auditRowsFor(templeA, fresh.id)).map((r) => r.action);
    expect(newActions).toContain("receipt:issue");

    // a superseded receipt can no longer be reissued or voided
    await expectProjectHttpError(
      receipts.reissue(actorA, templeA, "127.0.0.1", original.id, { reason: "อีกครั้ง" }),
      409,
      "CONFLICT",
    );
    await expectProjectHttpError(
      receipts.void(actorA, templeA, "127.0.0.1", original.id, { reason: "ยกเลิกใบเก่า" }),
      409,
      "CONFLICT",
    );

    // and the donation can be issued only once active at a time still holds
    await expectProjectHttpError(
      receipts.issue(actorA, templeA, "127.0.0.1", { donationId }),
      409,
      "CONFLICT",
    );
  });

  it("renders a printable preview with temple header, donor, amount and Thai baht text", async () => {
    const donationId = await newDonation(50000);
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });

    const { preview } = await receipts.preview(templeA, receipt.id);
    expect(preview).toMatchObject({
      receiptNo: receipt.receiptNo,
      status: "issued",
      templeNameTh: "วัดอรุณเดโม",
      donorName: "ผู้บริจาคไม่ประสงค์ออกนาม",
      amountSatang: "50000",
      amountText: "ห้าร้อยบาทถ้วน",
      donationDate: today,
      donationMethod: "cash",
    });
  });

  it("voids the active receipt when its donation is voided (Task 5 integration)", async () => {
    const donationId = await newDonation();
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });

    await donations.void(actorA, templeA, "127.0.0.1", donationId, { reason: "บันทึกผิด" });

    const rows = await psqlJson<{ status: string }>(`SELECT status FROM receipts WHERE id = '${receipt.id}'`);
    expect(rows).toEqual([{ status: "voided" }]);
    const audit = (await auditRowsFor(templeA, receipt.id)).find((r) => r.action === "receipt:void");
    expect(audit).toMatchObject({ reason: "บันทึกผิด", after: { status: "voided" } });
  });

  it("keeps receipts isolated per tenant (cross-tenant get/void/reissue/preview -> 404)", async () => {
    const donationId = await newDonation();
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });

    const fromB = await receipts.list(templeB, {});
    expect(fromB.receipts.some((r) => r.id === receipt.id)).toBe(false);
    await expectProjectHttpError(receipts.getOne(templeB, receipt.id), 404, "NOT_FOUND");
    await expectProjectHttpError(receipts.preview(templeB, receipt.id), 404, "NOT_FOUND");
    await expectProjectHttpError(
      receipts.void(actorB, templeB, "127.0.0.1", receipt.id, { reason: "ข้ามวัด" }),
      404,
      "NOT_FOUND",
    );
    await expectProjectHttpError(
      receipts.reissue(actorB, templeB, "127.0.0.1", receipt.id, { reason: "ข้ามวัด" }),
      404,
      "NOT_FOUND",
    );
  });

  it("never allocates a duplicate receipt number under concurrent issue (different donations)", async () => {
    const donationIds = await Promise.all(Array.from({ length: 6 }, () => newDonation(100)));
    const results = await Promise.all(
      donationIds.map((donationId) => receipts.issue(actorA, templeA, "127.0.0.1", { donationId })),
    );
    const numbers = results.map((r) => r.receipt.receiptNo);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const no of numbers) {
      expect(no).toMatch(/^RCPT-\d{6}$/);
    }
  });

  it("serializes concurrent issue on the same donation: one wins, the other gets 409", async () => {
    const donationId = await newDonation();
    const settled = await Promise.allSettled([
      receipts.issue(actorA, templeA, "127.0.0.1", { donationId }),
      receipts.issue(actorA, templeA, "127.0.0.1", { donationId }),
    ]);
    const fulfilled = settled.filter((s) => s.status === "fulfilled");
    const rejected = settled.filter((s) => s.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(((rejected[0] as PromiseRejectedResult).reason as HttpException).getStatus()).toBe(409);
  });

  it("a reissue racing a donation void never leaves an issued receipt on a cancelled donation", async () => {
    const donationId = await newDonation();
    const { receipt } = await receipts.issue(actorA, templeA, "127.0.0.1", { donationId });

    // Both mutate the same donation's receipts; they must serialize on the donation row.
    await Promise.allSettled([
      receipts.reissue(actorA, templeA, "127.0.0.1", receipt.id, { reason: "ออกใหม่แทน" }),
      donations.void(actorA, templeA, "127.0.0.1", donationId, { reason: "ยกเลิกบริจาค" }),
    ]);

    const issued = await psqlJson<{ n: number }>(
      `SELECT count(*)::int AS n FROM receipts WHERE donation_id = '${donationId}' AND status = 'issued'`,
    );
    expect(issued[0]?.n).toBe(0);
    const donationRow = await psqlJson<{ status: string }>(
      `SELECT status::text FROM donations WHERE id = '${donationId}'`,
    );
    expect(donationRow[0]?.status).toBe("cancelled");
  });

  it("rejects a malformed :id path param with 422 (not a 500)", async () => {
    await expectProjectHttpError(receipts.getOne(templeA, "not-a-uuid"), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(receipts.preview(templeA, "not-a-uuid"), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(
      receipts.void(actorA, templeA, "127.0.0.1", "not-a-uuid", { reason: "x" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      receipts.reissue(actorA, templeA, "127.0.0.1", "not-a-uuid", { reason: "x" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("restricts roles: issue/void/reissue are admin/finance, reads include staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, ReceiptsController.prototype.issue)).toEqual(["admin", "finance"]);
    expect(reflector.get<string[]>(ROLES_KEY, ReceiptsController.prototype.void)).toEqual(["admin", "finance"]);
    expect(reflector.get<string[]>(ROLES_KEY, ReceiptsController.prototype.reissue)).toEqual(["admin", "finance"]);
    expect(reflector.get<string[]>(ROLES_KEY, ReceiptsController.prototype.list)).toEqual(["admin", "finance", "staff"]);

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
      getClass: () => ReceiptsController,
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
