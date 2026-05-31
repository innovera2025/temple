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
import { TempleController } from "../src/temple/temple.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const staffEmail = "staff@wat-arun.example";
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
  if (!payload) {
    throw new Error("JWT payload segment is missing");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
}

async function templeUpdateAuditCount(tenantId: string): Promise<number> {
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
      `SELECT count(*) FROM audit_logs WHERE tenant_id = '${tenantId}' AND action = 'temple:update'`,
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

describe("temple profile / master data", () => {
  let app: INestApplication;
  let authService: AuthService;
  let temple: TempleController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let staffToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    temple = app.get(TempleController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    staffToken = (await authService.login({ email: staffEmail, password: devPassword })).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the caller's own temple profile", async () => {
    const { temple: profile } = await temple.get(templeA);
    expect(profile.id).toBe(templeA);
    expect(profile.slug).toBe("wat-arun-demo");
    expect(profile.nameTh).toBe("วัดอรุณเดโม");
  });

  it("updates master data (admin), writes a temple:update audit row, and scopes to the caller's temple", async () => {
    const marker = `จังหวัดทดสอบ-${randomUUID().slice(0, 8)}`;
    const before = await templeUpdateAuditCount(templeA);

    const { temple: updated } = await temple.update(actorA, templeA, ip, {
      province: marker,
      phone: "021112222",
      receiptHeaderTh: "ในนามคณะสงฆ์",
    });
    expect(updated.province).toBe(marker);
    expect(updated.phone).toBe("021112222");

    // audited
    expect(await templeUpdateAuditCount(templeA)).toBe(before + 1);

    // re-read reflects the change; the other tenant is untouched
    expect((await temple.get(templeA)).temple.province).toBe(marker);
    expect((await temple.get(templeB)).temple.province).not.toBe(marker);
  });

  it("clears an optional field with an empty string but never the required nameTh", async () => {
    await temple.update(actorA, templeA, ip, { lineId: "@watarun" });
    expect((await temple.get(templeA)).temple.lineId).toBe("@watarun");
    await temple.update(actorA, templeA, ip, { lineId: "" });
    expect((await temple.get(templeA)).temple.lineId).toBeNull();

    // clearing nameTh is rejected
    await expectProjectHttpError(temple.update(actorA, templeA, ip, { nameTh: "" }), 422, "UNPROCESSABLE_ENTITY");
  });

  it("rejects invalid input and an empty patch with 422", async () => {
    await expectProjectHttpError(temple.update(actorA, templeA, ip, {}), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(
      temple.update(actorA, templeA, ip, { email: "not-an-email" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      temple.update(actorA, templeA, ip, { postalCode: "12" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      temple.update(actorA, templeA, ip, { websiteUrl: "ftp://nope" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects mass-assignment of platform-controlled / unknown fields without mutating them", async () => {
    const slugBefore = (await temple.get(templeA)).temple.slug;

    // status is the platform's suspend/resume control — not editable here
    await expectProjectHttpError(
      temple.update(actorA, templeA, ip, { status: "suspended", nameEn: "X" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      temple.update(actorA, templeA, ip, { slug: "wat-pho-demo" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      temple.update(actorA, templeA, ip, { id: templeB }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // a non-string value is rejected, not forwarded to Prisma
    await expectProjectHttpError(
      temple.update(actorA, templeA, ip, { province: 123 }),
      422,
      "UNPROCESSABLE_ENTITY",
    );

    // none of the above changed status or slug
    const reread = (await temple.get(templeA)).temple;
    expect(reread.status).toBe("active");
    expect(reread.slug).toBe(slugBefore);
  });

  it("restricts edits to admin (staff/finance rejected); reads allow admin/finance/staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, TempleController.prototype.update)).toEqual(["admin"]);
    expect(reflector.get<string[]>(ROLES_KEY, TempleController.prototype.get)).toEqual([
      "admin",
      "finance",
      "staff",
    ]);

    const guard = new RolesGuard(reflector);
    const handler = (): void => undefined;
    Reflect.defineMetadata(ROLES_KEY, ["admin"], handler);
    const request = {
      headers: { authorization: `Bearer ${staffToken}` },
      user: { sub: actorB.sub, tenant_id: templeA, role: "staff", email: staffEmail },
      currentTenantId: templeA,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => TempleController,
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
