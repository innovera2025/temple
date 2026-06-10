import { randomUUID } from "node:crypto";
import { HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuditController } from "../src/audit/audit.controller";
import { AuthService } from "../src/auth/auth.service";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { DonationsController } from "../src/donations/donations.controller";

const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const devPassword = "Password123!";
const ip = "127.0.0.1";

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

describe("audit read API (ประวัติการแก้ไข)", () => {
  let app: INestApplication;
  let audit: AuditController;
  let donations: DonationsController;
  let reflector: Reflector;
  let actorA: { sub: string; tenant_id: string; role: string; email: string };
  let donationId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    audit = app.get(AuditController);
    donations = app.get(DonationsController);
    reflector = app.get(Reflector);
    const authService = app.get(AuthService);

    const token = (await authService.login({ email: adminEmail, password: devPassword })).accessToken;
    const payload = token.split(".")[1] ?? "";
    actorA = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    // Produce known audit rows: a donation create + void.
    const created = await donations.create(actorA, templeA, ip, {
      amountSatang: 12345,
      method: "cash",
      donationDate: "2026-06-10",
    });
    donationId = created.donation.id;
    await donations.void(actorA, templeA, ip, donationId, { reason: "ทดสอบอ่าน audit" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists the tenant's audit rows newest-first with actor name/role, no before/after blobs", async () => {
    const { logs } = await audit.list(templeA);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    const voidRow = logs.find((l) => l.action === "donation:void" && l.entityId === donationId);
    expect(voidRow).toBeDefined();
    expect(voidRow?.actorName).toBeTruthy();
    expect(voidRow?.actorRole).toBe("admin");
    expect(voidRow?.reason).toBe("ทดสอบอ่าน audit");
    expect(voidRow).not.toHaveProperty("before");
    expect(voidRow).not.toHaveProperty("after");
    // newest-first ordering
    const times = logs.map((l) => l.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("filters by actionPrefix and entityId", async () => {
    const { logs: donationLogs } = await audit.list(templeA, "donation:");
    expect(donationLogs.length).toBeGreaterThanOrEqual(2);
    expect(donationLogs.every((l) => l.action.startsWith("donation:"))).toBe(true);

    const { logs: entityLogs } = await audit.list(templeA, undefined, donationId);
    expect(entityLogs.length).toBeGreaterThanOrEqual(2);
    expect(entityLogs.every((l) => l.entityId === donationId)).toBe(true);
  });

  it("is tenant-scoped under RLS: temple B never sees temple A's rows", async () => {
    const { logs } = await audit.list(templeB, undefined, donationId);
    expect(logs).toEqual([]);
  });

  it("rejects malformed filters (422) and caps take at 100", async () => {
    await expectProjectHttpError(audit.list(templeA, "1; DROP TABLE"), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(audit.list(templeA, undefined, "not-a-uuid"), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(audit.list(templeA, undefined, undefined, "0"), 422, "UNPROCESSABLE_ENTITY");
    const { logs } = await audit.list(templeA, undefined, undefined, "5000");
    expect(logs.length).toBeLessThanOrEqual(100);
  });

  it("is admin/finance-only (staff cannot read the money trail)", () => {
    expect(reflector.get<string[]>(ROLES_KEY, AuditController.prototype.list)).toEqual([
      "admin",
      "finance",
    ]);
  });

  it("never matches a random entity id (and never 500s on a valid uuid)", async () => {
    const { logs } = await audit.list(templeA, undefined, randomUUID());
    expect(logs).toEqual([]);
  });
});
