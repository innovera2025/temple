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
import { PersonnelController } from "../src/personnel/personnel.controller";

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

async function personnelAuditCount(tenantId: string, action: string, entityId: string): Promise<number> {
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

describe("personnel (monk / novice / staff)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let personnel: PersonnelController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let financeToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    personnel = app.get(PersonnelController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    financeToken = (await authService.login({ email: financeEmail, password: devPassword })).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a monk (audited), lists/filters it, and reads it back", async () => {
    const marker = `พระทดสอบ-${randomUUID().slice(0, 8)}`;
    const { personnel: created } = await personnel.create(actorA, templeA, ip, {
      personnelType: "monk",
      displayName: marker,
      dharmaName: "ฐิตธมฺโม",
      position: "เจ้าอาวาส",
      ordinationDate: "2010-07-01",
      phansaCount: 15,
    });
    expect(created.personnelType).toBe("monk");
    expect(created.status).toBe("active");
    expect(created.ordinationDate).toBe("2010-07-01");
    expect(created.phansaCount).toBe(15);
    expect(await personnelAuditCount(templeA, "personnel:create", created.id)).toBe(1);

    const { personnel: monks } = await personnel.list(templeA, { personnelType: "monk", q: marker });
    expect(monks.some((p) => p.id === created.id)).toBe(true);

    const { personnel: fetched } = await personnel.get(templeA, created.id);
    expect(fetched.displayName).toBe(marker);
  });

  it("updates and archives a record (audited)", async () => {
    const { personnel: created } = await personnel.create(actorA, templeA, ip, {
      personnelType: "staff",
      displayName: `บุคลากร-${randomUUID().slice(0, 8)}`,
    });

    const { personnel: updated } = await personnel.update(actorA, templeA, ip, created.id, {
      position: "ไวยาวัจกร",
      status: "inactive",
    });
    expect(updated.position).toBe("ไวยาวัจกร");
    expect(updated.status).toBe("inactive");
    expect(await personnelAuditCount(templeA, "personnel:update", created.id)).toBe(1);
  });

  it("rejects invalid input with 422", async () => {
    await expectProjectHttpError(personnel.create(actorA, templeA, ip, {}), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "bishop", displayName: "x" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "monk", displayName: "x", ordinationDate: "2020-13-40" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "monk", displayName: "x", phansaCount: -1 }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "monk", displayName: "x", nationalId: "123" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "monk", displayName: "x", foo: "bar" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // mass-assignment: tenant_id / id in the body are rejected (not silently applied)
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "monk", displayName: "x", tenantId: templeB }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "monk", displayName: "x", id: randomUUID() }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // phansaCount must be a real integer, not a coercible non-number
    await expectProjectHttpError(
      personnel.create(actorA, templeA, ip, { personnelType: "monk", displayName: "x", phansaCount: true }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // empty patch / cleared required name
    await expectProjectHttpError(personnel.update(actorA, templeA, ip, randomUUID(), {}), 422, "UNPROCESSABLE_ENTITY");
  });

  it("returns 404 for a malformed or cross-tenant id (never a raw 500)", async () => {
    await expectProjectHttpError(personnel.get(templeA, "not-a-uuid"), 404, "NOT_FOUND");
    await expectProjectHttpError(personnel.get(templeA, randomUUID()), 404, "NOT_FOUND");
  });

  it("never exposes another tenant's personnel (RLS isolation)", async () => {
    const { personnel: created } = await personnel.create(actorA, templeA, ip, {
      personnelType: "monk",
      displayName: `iso-${randomUUID().slice(0, 8)}`,
    });
    // tenant B cannot read tenant A's record, and it does not show in B's list
    await expectProjectHttpError(personnel.get(templeB, created.id), 404, "NOT_FOUND");
    const { personnel: bRows } = await personnel.list(templeB, {});
    expect(bRows.some((p) => p.id === created.id)).toBe(false);
    expect(actorB.tenant_id).toBe(templeB);
  });

  it("restricts writes to admin/staff (finance rejected); reads allow admin/finance/staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, PersonnelController.prototype.create)).toEqual(["admin", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, PersonnelController.prototype.update)).toEqual(["admin", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, PersonnelController.prototype.list)).toEqual([
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
      getClass: () => PersonnelController,
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
