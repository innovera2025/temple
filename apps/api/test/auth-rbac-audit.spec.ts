import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  HttpException,
  INestApplication,
  type CallHandler,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { firstValueFrom, of } from "rxjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuditInterceptor } from "../src/audit/audit.interceptor";
import { AUDIT_METADATA_KEY } from "../src/audit/audit.decorator";
import { AuthService } from "../src/auth/auth.service";
import { AuthGuard } from "../src/common/guards/auth.guard";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { RolesGuard } from "../src/common/guards/roles.guard";

const execFileAsync = promisify(execFile);

const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const staffEmail = "staff@wat-arun.example";
const devPassword = "Password123!";

interface TokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}

interface AuthenticatedRequest {
  headers: Record<string, string | undefined>;
  body?: unknown;
  ip?: string;
  user?: TokenPayload;
  currentTenantId?: string;
}

interface AuditRow {
  tenant_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  after: { marker?: string };
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

function createHttpContext(
  request: AuthenticatedRequest,
  handler: () => void = () => undefined,
): ExecutionContext {
  const context = {
    getArgs: () => [request],
    getArgByIndex: <T = unknown>() => request as T,
    switchToRpc: () => ({}),
    switchToHttp: () => ({
      getRequest: <T = AuthenticatedRequest>() => request as T,
      getResponse: <T = unknown>() => ({}) as T,
      getNext: <T = unknown>() => undefined as T,
    }),
    switchToWs: () => ({}),
    getType: () => "http",
    getClass: () => class TestController {},
    getHandler: () => handler,
  };

  return context as unknown as ExecutionContext;
}

async function expectProjectHttpError(
  promise: Promise<unknown> | boolean,
  statusCode: number,
  code: string,
): Promise<void> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;

    expect(exception.getStatus()).toBe(statusCode);
    expect(exception.getResponse()).toMatchObject({
      error: {
        code,
        statusCode,
      },
    });
    return;
  }

  throw new Error(`Expected ${statusCode} ${code} exception`);
}

async function psqlJson<T>(sql: string): Promise<T[]> {
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
      `WITH q AS (${sql.replace(/;+\s*$/, "")}) SELECT COALESCE(json_agg(q), '[]'::json) FROM q;`,
    ],
    { maxBuffer: 1024 * 1024 },
  );

  return JSON.parse(stdout.trim() || "[]") as T[];
}

describe("auth, RBAC, tenant context, and audit", () => {
  let app: INestApplication;
  let authService: AuthService;
  let authGuard: AuthGuard;
  let rolesGuard: RolesGuard;
  let auditInterceptor: AuditInterceptor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    authGuard = app.get(AuthGuard);
    rolesGuard = new RolesGuard(app.get(Reflector));
    auditInterceptor = app.get(AuditInterceptor);
  });

  afterAll(async () => {
    await app.close();
  });

  it("logs in with email and password and returns JWT payload with tenant and role", async () => {
    const tokens = await authService.login({ email: adminEmail, password: devPassword });
    const payload = decodeJwtPayload(tokens.accessToken);

    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(payload).toMatchObject({
      tenant_id: templeA,
      role: "admin",
      email: adminEmail,
    });
    expect(payload.sub).toEqual(expect.any(String));
  });

  it("returns 401 for a bad password", async () => {
    await expectProjectHttpError(
      authService.login({ email: adminEmail, password: "wrong-password" }),
      401,
      "UNAUTHORIZED",
    );
  });

  it("registers a new temple signup as a pending application without creating a privileged user", async () => {
    const suffix = randomUUID().slice(0, 8);
    const email = `signup-${suffix}@example.test`;
    const result = await authService.register({
      templeNameTh: `วัดทดสอบสมัคร ${suffix}`,
      contactEmail: email,
      password: "Register123!",
      displayName: "ผู้ขอสมัคร",
    });

    expect(result).toMatchObject({ status: "pending", contactEmail: email });
    expect(result.id).toEqual(expect.any(String));

    const applications = await psqlJson<{ contact_email: string; status: string }>(`
      SELECT contact_email, status FROM temple_applications WHERE id = '${result.id}'
    `);
    expect(applications).toEqual([{ contact_email: email, status: "pending" }]);

    const users = await psqlJson<{ email: string }>(`
      SELECT email FROM users WHERE email = '${email}'
    `);
    expect(users).toEqual([]);
  });

  it("rejects duplicate signup emails before creating another application", async () => {
    const suffix = randomUUID().slice(0, 8);
    const email = `duplicate-signup-${suffix}@example.test`;
    await authService.register({
      templeNameTh: `วัดซ้ำ ${suffix}`,
      contactEmail: email,
      password: "Register123!",
      displayName: "ผู้ขอสมัคร",
    });

    await expectProjectHttpError(
      authService.register({
        templeNameTh: `วัดซ้ำอีก ${suffix}`,
        contactEmail: email.toUpperCase(),
        password: "Register123!",
        displayName: "ผู้ขอสมัคร",
      }),
      409,
      "CONFLICT",
    );
  });

  it("does not expose Google/Facebook OAuth start URLs until provider config exists", async () => {
    await expectProjectHttpError(
      Promise.resolve().then(() =>
        authService.startSocialSignup("google", { redirectUri: "http://localhost:5173/oauth/callback" }),
      ),
      503,
      "SERVICE_UNAVAILABLE",
    );
    await expectProjectHttpError(
      Promise.resolve().then(() =>
        authService.startSocialSignup("facebook", { redirectUri: "http://localhost:5173/oauth/callback" }),
      ),
      503,
      "SERVICE_UNAVAILABLE",
    );
  });

  it("blocks a protected mutation without an access token", async () => {
    const request: AuthenticatedRequest = {
      headers: {},
      body: { entityId: randomUUID(), after: { marker: "missing-token" } },
    };

    await expectProjectHttpError(
      Promise.resolve().then(() => authGuard.canActivate(createHttpContext(request))),
      401,
      "UNAUTHORIZED",
    );
  });

  it("blocks a role-protected mutation for an insufficient role", async () => {
    const tokens = await authService.login({ email: staffEmail, password: devPassword });
    const request: AuthenticatedRequest = {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    };
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, ["admin"], handler);

    expect(await authGuard.canActivate(createHttpContext(request))).toBe(true);
    await expectProjectHttpError(
      Promise.resolve().then(() => rolesGuard.canActivate(createHttpContext(request, handler))),
      403,
      "FORBIDDEN",
    );
    expect(request.user?.role).toBe("staff");
  });

  it("rotates refresh tokens and rejects reuse of the old refresh token", async () => {
    const first = await authService.login({ email: adminEmail, password: devPassword });
    const rotated = await authService.refresh({ refreshToken: first.refreshToken });

    expect(rotated.refreshToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    await expectProjectHttpError(
      authService.refresh({ refreshToken: first.refreshToken }),
      401,
      "UNAUTHORIZED",
    );
  });

  it("allows only one concurrent refresh rotation for the same refresh token", async () => {
    const first = await authService.login({ email: adminEmail, password: devPassword });
    const attempts = await Promise.allSettled([
      authService.refresh({ refreshToken: first.refreshToken }),
      authService.refresh({ refreshToken: first.refreshToken }),
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    await expectProjectHttpError(Promise.reject(rejected[0]?.reason), 401, "UNAUTHORIZED");
  });

  it("revokes the provided refresh token on logout", async () => {
    const tokens = await authService.login({ email: adminEmail, password: devPassword });

    await expect(authService.logout({ refreshToken: tokens.refreshToken })).resolves.toEqual({
      revoked: true,
    });
    await expectProjectHttpError(
      authService.refresh({ refreshToken: tokens.refreshToken }),
      401,
      "UNAUTHORIZED",
    );
  });

  it("derives tenant from the JWT, ignores body/header tenant ids, and writes an audit row", async () => {
    const tokens = await authService.login({ email: adminEmail, password: devPassword });
    const actor = decodeJwtPayload(tokens.accessToken);
    const entityId = randomUUID();
    const handler = () => undefined;
    const request: AuthenticatedRequest = {
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "x-tenant-id": templeB,
      },
      body: {
        tenantId: templeB,
        entityId,
        after: { marker: "audit-path" },
        reason: "integration test",
      },
      ip: "127.0.0.1",
    };
    const next: CallHandler = {
      handle: () =>
        of({
          tenantId: request.currentTenantId,
          actorUserId: request.user?.sub,
          entityId,
          after: { marker: "audit-path" },
          reason: "integration test",
        }),
    };

    Reflect.defineMetadata(
      AUDIT_METADATA_KEY,
      { action: "demo:update", entityType: "demo_mutation" },
      handler,
    );

    expect(await authGuard.canActivate(createHttpContext(request))).toBe(true);
    expect(request.currentTenantId).toBe(templeA);

    const response = await firstValueFrom(
      auditInterceptor.intercept(createHttpContext(request, handler), next),
    );

    expect(response).toMatchObject({
      tenantId: templeA,
      actorUserId: actor.sub,
      entityId,
      after: { marker: "audit-path" },
    });

    const rows = await psqlJson<AuditRow>(`
      SELECT tenant_id, actor_user_id, action, entity_type, entity_id, "after", reason, ip
      FROM audit_logs
      WHERE tenant_id = '${templeA}' AND entity_id = '${entityId}'
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: templeA,
      actor_user_id: actor.sub,
      action: "demo:update",
      entity_type: "demo_mutation",
      entity_id: entityId,
      after: { marker: "audit-path" },
      reason: "integration test",
      ip: "127.0.0.1",
    });
  });
});
