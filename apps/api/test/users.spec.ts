import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { ExecutionContext, HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { AuthGuard } from "../src/common/guards/auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { AuthenticatedRequest } from "../src/common/types/authenticated-request";
import { UsersController } from "../src/users/users.controller";

function authCtx(token: string): { ctx: ExecutionContext; request: AuthenticatedRequest } {
  const request: AuthenticatedRequest = { headers: { authorization: `Bearer ${token}` } };
  const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { ctx, request };
}

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
  if (!payload) throw new Error("JWT payload segment is missing");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
}

async function userAuditCount(tenantId: string, action: string, entityId: string): Promise<number> {
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

describe("tenant user management", () => {
  let app: INestApplication;
  let authService: AuthService;
  let users: UsersController;
  let authGuard: AuthGuard;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let staffToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    users = app.get(UsersController);
    authGuard = app.get(AuthGuard);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    staffToken = (await authService.login({ email: staffEmail, password: devPassword })).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a user (audited, no password hash leaked) who can then log in", async () => {
    const email = `new-${randomUUID().slice(0, 8)}@wat-arun.example`;
    const { user } = await users.create(actorA, templeA, ip, {
      email,
      displayName: "เจ้าหน้าที่ใหม่",
      role: "staff",
      password: "NewPass123!",
    });
    expect(user.role).toBe("staff");
    expect(user.isActive).toBe(true);
    expect("passwordHash" in (user as unknown as Record<string, unknown>)).toBe(false);
    expect(await userAuditCount(templeA, "user:create", user.id)).toBe(1);

    // the new user can authenticate with the assigned password
    const tokens = await authService.login({ email, password: "NewPass123!" });
    const claims = decodeJwtPayload(tokens.accessToken);
    expect(claims.tenant_id).toBe(templeA);
    expect(claims.role).toBe("staff");
  });

  it("disables a user, blocking login and token refresh (audited)", async () => {
    const email = `dis-${randomUUID().slice(0, 8)}@wat-arun.example`;
    const { user } = await users.create(actorA, templeA, ip, {
      email,
      displayName: "จะถูกปิด",
      role: "finance",
      password: "DisPass123!",
    });
    const session = await authService.login({ email, password: "DisPass123!" });

    const { user: disabled } = await users.update(actorA, templeA, ip, user.id, { isActive: false });
    expect(disabled.isActive).toBe(false);
    expect(await userAuditCount(templeA, "user:update", user.id)).toBe(1);

    await expectProjectHttpError(authService.login({ email, password: "DisPass123!" }), 401, "UNAUTHORIZED");
    // the refresh token issued before disabling was revoked
    await expectProjectHttpError(authService.refresh({ refreshToken: session.refreshToken }), 401, "UNAUTHORIZED");
  });

  it("protects the last active admin and forbids self-disable", async () => {
    // actorA is the only active admin in templeA -> demoting itself would leave none
    await expectProjectHttpError(
      users.update(actorA, templeA, ip, actorA.sub, { role: "staff" }),
      409,
      "CONFLICT",
    );
    // self-disable is forbidden outright
    await expectProjectHttpError(
      users.update(actorA, templeA, ip, actorA.sub, { isActive: false }),
      403,
      "FORBIDDEN",
    );
    // and the seed admin is untouched
    expect((await users.get(templeA, actorA.sub)).user.role).toBe("admin");
    expect((await users.get(templeA, actorA.sub)).user.isActive).toBe(true);
  });

  it("rejects a duplicate email with 409", async () => {
    await expectProjectHttpError(
      users.create(actorA, templeA, ip, {
        email: adminEmail,
        displayName: "ซ้ำ",
        role: "staff",
        password: "DupPass123!",
      }),
      409,
      "CONFLICT",
    );
  });

  it("rejects invalid input with 422 (missing fields, weak password, email change, empty patch)", async () => {
    await expectProjectHttpError(users.create(actorA, templeA, ip, {}), 422, "UNPROCESSABLE_ENTITY");
    await expectProjectHttpError(
      users.create(actorA, templeA, ip, { email: "a@b.co", displayName: "x", role: "staff", password: "short" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      users.create(actorA, templeA, ip, { email: "bad", displayName: "x", role: "staff", password: "GoodPass123!" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    const { user } = await users.create(actorA, templeA, ip, {
      email: `patch-${randomUUID().slice(0, 8)}@wat-arun.example`,
      displayName: "patch",
      role: "staff",
      password: "PatchPass123!",
    });
    await expectProjectHttpError(users.update(actorA, templeA, ip, user.id, {}), 422, "UNPROCESSABLE_ENTITY");
    // email is immutable on update
    await expectProjectHttpError(
      users.update(actorA, templeA, ip, user.id, { email: "new@wat-arun.example" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("returns 404 for a malformed or cross-tenant id", async () => {
    await expectProjectHttpError(users.get(templeA, "not-a-uuid"), 404, "NOT_FOUND");
    await expectProjectHttpError(users.get(templeA, randomUUID()), 404, "NOT_FOUND");
  });

  it("never exposes another tenant's users (RLS isolation)", async () => {
    const { user } = await users.create(actorA, templeA, ip, {
      email: `iso-${randomUUID().slice(0, 8)}@wat-arun.example`,
      displayName: "iso",
      role: "staff",
      password: "IsoPass123!",
    });
    await expectProjectHttpError(users.get(templeB, user.id), 404, "NOT_FOUND");
    const { users: bUsers } = await users.list(templeB, {});
    expect(bUsers.some((u) => u.id === user.id)).toBe(false);
    expect(bUsers.every((u) => u.email.endsWith("@wat-pho.example"))).toBe(true);
    expect(actorB.tenant_id).toBe(templeB);
  });

  it("AuthGuard re-validates against the DB so disable/demote take effect immediately", async () => {
    // disable -> the existing access token is rejected by the guard at once
    const e1 = `kill-${randomUUID().slice(0, 8)}@wat-arun.example`;
    const { user: u1 } = await users.create(actorA, templeA, ip, {
      email: e1,
      displayName: "kill",
      role: "staff",
      password: "KillPass123!",
    });
    const s1 = await authService.login({ email: e1, password: "KillPass123!" });
    expect(await authGuard.canActivate(authCtx(s1.accessToken).ctx)).toBe(true); // active -> ok
    await users.update(actorA, templeA, ip, u1.id, { isActive: false });
    await expectProjectHttpError(
      Promise.resolve().then(() => authGuard.canActivate(authCtx(s1.accessToken).ctx)),
      401,
      "UNAUTHORIZED",
    );

    // demote -> the guard reflects the new (lower) role from the DB, not the stale token claim
    const e2 = `demote-${randomUUID().slice(0, 8)}@wat-arun.example`;
    const { user: u2 } = await users.create(actorA, templeA, ip, {
      email: e2,
      displayName: "demote",
      role: "admin",
      password: "DemotePass123!",
    });
    const s2 = await authService.login({ email: e2, password: "DemotePass123!" });
    await users.update(actorA, templeA, ip, u2.id, { role: "staff" });
    const { ctx, request } = authCtx(s2.accessToken);
    expect(await authGuard.canActivate(ctx)).toBe(true);
    expect(request.user?.role).toBe("staff"); // DB role wins over the token's "admin"
  });

  it("restricts the whole module to admin (finance/staff rejected)", () => {
    expect(reflector.get<string[]>(ROLES_KEY, UsersController)).toEqual(["admin"]);

    const guard = new RolesGuard(reflector);
    const request = {
      headers: { authorization: `Bearer ${staffToken}` },
      user: { sub: actorA.sub, tenant_id: templeA, role: "staff", email: staffEmail },
      currentTenantId: templeA,
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => UsersController.prototype.list,
      getClass: () => UsersController,
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
