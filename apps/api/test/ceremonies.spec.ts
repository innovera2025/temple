import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { CeremoniesController } from "../src/ceremonies/ceremonies.controller";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { RolesGuard } from "../src/common/guards/roles.guard";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const financeEmail = "finance@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const devPassword = "Password123!";

interface TokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}

function decodeJwtPayload(token: string): TokenPayload {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("JWT payload segment is missing");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
}

async function ceremonyAuditCount(tenantId: string, action: string, entityId: string): Promise<number> {
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
      `SELECT count(*) FROM audit_logs WHERE tenant_id = '${tenantId}' AND action = '${action}' AND entity_id = '${entityId}'`,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return Number(stdout.trim());
}

interface AuditSnapshotCheck {
  beforeStatus: string;
  afterStatus: string;
  afterCeremonyDate: string;
  afterHasUpdatedAt: string;
}

async function latestCeremonyUpdateAudit(tenantId: string, entityId: string): Promise<AuditSnapshotCheck> {
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
      `SELECT before->>'status', after->>'status', after->>'ceremonyDate', (after ? 'updatedAt')::text
       FROM audit_logs
       WHERE tenant_id = '${tenantId}' AND action = 'ceremony:update' AND entity_id = '${entityId}'
       ORDER BY created_at DESC LIMIT 1`,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const [beforeStatus = "", afterStatus = "", afterCeremonyDate = "", afterHasUpdatedAt = ""] = stdout
    .trim()
    .split("|");
  return { beforeStatus, afterStatus, afterCeremonyDate, afterHasUpdatedAt };
}

async function expectProjectHttpError(promise: Promise<unknown>, statusCode: number, code: string): Promise<void> {
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

const ip = "127.0.0.1";

describe("ceremonies (งานบุญ/พิธี)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let ceremonies: CeremoniesController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let financeToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    ceremonies = app.get(CeremoniesController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    financeToken = (await authService.login({ email: financeEmail, password: devPassword })).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a ceremony (audited), lists/filters it by date, and reads it back", async () => {
    const marker = `ทำบุญทดสอบ-${randomUUID().slice(0, 8)}`;
    const { ceremony: created } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit",
      title: marker,
      ceremonyDate: "2031-08-10",
      location: "ศาลาการเปรียญ",
      monkCount: 9,
    });
    expect(created.ceremonyType).toBe("merit");
    expect(created.status).toBe("planned");
    expect(created.ceremonyDate).toBe("2031-08-10");
    expect(created.monkCount).toBe(9);
    expect(await ceremonyAuditCount(templeA, "ceremony:create", created.id)).toBe(1);

    const { ceremonies: inRange } = await ceremonies.list(templeA, {
      ceremonyType: "merit",
      dateFrom: "2031-08-01",
      dateTo: "2031-08-31",
    });
    expect(inRange.some((c) => c.id === created.id)).toBe(true);

    // a date filter outside the window excludes it
    const { ceremonies: outRange } = await ceremonies.list(templeA, { dateFrom: "2031-09-01", dateTo: "2031-09-30" });
    expect(outRange.some((c) => c.id === created.id)).toBe(false);

    const { ceremony: fetched } = await ceremonies.get(templeA, created.id);
    expect(fetched.title).toBe(marker);
  });

  it("updates status through the workflow (audited)", async () => {
    const { ceremony: created } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "funeral",
      title: `งานศพ-${randomUUID().slice(0, 8)}`,
      ceremonyDate: "2031-08-12",
    });
    const { ceremony: done } = await ceremonies.update(actorA, templeA, ip, created.id, { status: "completed" });
    expect(done.status).toBe("completed");
    expect(await ceremonyAuditCount(templeA, "ceremony:update", created.id)).toBe(1);

    // the audit snapshot captures the real before/after and serializes the date
    // as YYYY-MM-DD (no raw Date/timestamp leaking into the jsonb column)
    const snap = await latestCeremonyUpdateAudit(templeA, created.id);
    expect(snap.beforeStatus).toBe("planned");
    expect(snap.afterStatus).toBe("completed");
    expect(snap.afterCeremonyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snap.afterHasUpdatedAt).toBe("false"); // snapshot omits createdAt/updatedAt
  });

  it("rejects invalid input with 422 (missing/bad fields, mass-assignment, non-number monkCount)", async () => {
    await expectProjectHttpError(ceremonies.create(actorA, templeA, ip, {}), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "party", title: "x", ceremonyDate: "2031-08-10" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "merit", title: "x", ceremonyDate: "2031-13-40" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "merit", title: "x", ceremonyDate: "2031-08-10", monkCount: true }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // mass-assignment: tenant_id / id in the body are rejected
    await expectProjectHttpError(
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "merit", title: "x", ceremonyDate: "2031-08-10", tenantId: templeB }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // empty patch
    await expectProjectHttpError(ceremonies.update(actorA, templeA, ip, randomUUID(), {}), 422, "UNPROCESSABLE_ENTITY");
  });

  it("returns 404 for a malformed or cross-tenant id (never a raw 500)", async () => {
    await expectProjectHttpError(ceremonies.get(templeA, "not-a-uuid"), 404, "NOT_FOUND");
    await expectProjectHttpError(ceremonies.get(templeA, randomUUID()), 404, "NOT_FOUND");
  });

  it("never exposes another tenant's ceremonies (RLS isolation)", async () => {
    const { ceremony: created } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit",
      title: `iso-${randomUUID().slice(0, 8)}`,
      ceremonyDate: "2031-08-15",
    });
    await expectProjectHttpError(ceremonies.get(templeB, created.id), 404, "NOT_FOUND");
    const { ceremonies: bRows } = await ceremonies.list(templeB, {});
    expect(bRows.some((c) => c.id === created.id)).toBe(false);
    expect(actorB.tenant_id).toBe(templeB);
  });

  it("restricts writes to admin/staff (finance rejected); reads allow admin/finance/staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, CeremoniesController.prototype.create)).toEqual(["admin", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, CeremoniesController.prototype.update)).toEqual(["admin", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, CeremoniesController.prototype.list)).toEqual([
      "admin",
      "finance",
      "staff",
    ]);

    const guard = new RolesGuard(reflector);
    const handler = (): void => undefined;
    Reflect.defineMetadata(ROLES_KEY, ["admin", "staff"], handler);
    const request = {
      headers: { authorization: `Bearer ${financeToken}` },
      user: { sub: actorA.sub, tenant_id: templeA, role: "finance", email: financeEmail },
      currentTenantId: templeA,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => CeremoniesController,
    } as never;

    try {
      guard.canActivate(context);
      throw new Error("Expected RolesGuard to reject finance");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
    }
  });
});
