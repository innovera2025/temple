import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { AuthGuard } from "../src/common/guards/auth.guard";
import { PasswordService } from "../src/auth/password.service";
import { ApplicationsController } from "../src/platform/applications.controller";
import { BreakGlassController } from "../src/platform/break-glass.controller";
import { PLATFORM_ROLES_KEY } from "../src/platform/decorators/platform-roles.decorator";
import { PlatformAuthGuard } from "../src/platform/guards/platform-auth.guard";
import { PlatformRolesGuard } from "../src/platform/guards/platform-roles.guard";
import { PlatformAuthService } from "../src/platform/platform-auth.service";
import { PlatformAuditController } from "../src/platform/platform-audit.controller";
import { PlatformDevoteesController } from "../src/platform/platform-devotees.controller";
import { PlatformUsersController } from "../src/platform/platform-users.controller";
import { TemplesController } from "../src/platform/temples.controller";
import { TenantUsersController } from "../src/platform/tenant-users.controller";
import { PlatformPrincipal } from "../src/platform/types/platform-request";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const superEmail = "super@innovera.example";
const supportEmail = "support@innovera.example";
const devPassword = "Password123!";

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
      "-At",
      "-c",
      sql,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout.trim();
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** `INSERT ... RETURNING id` prints the id then the "INSERT 0 1" tag — take line 1. */
async function returningId(sql: string): Promise<string> {
  const out = await psql(sql);
  return out.split("\n")[0]?.trim() ?? "";
}

async function insertPendingApplication(nameTh: string, email: string): Promise<string> {
  return returningId(
    `INSERT INTO temple_applications (temple_name_th, contact_email, status) VALUES (${lit(nameTh)}, ${lit(email)}, 'pending') RETURNING id`,
  );
}

async function insertTemple(slug: string, nameTh: string, status: string): Promise<string> {
  return returningId(
    `INSERT INTO temples (slug, name_th, status) VALUES (${lit(slug)}, ${lit(nameTh)}, ${lit(status)}) RETURNING id`,
  );
}

async function insertPlatformUser(
  email: string,
  role: string,
  passwordHash: string,
  isActive: boolean,
): Promise<string> {
  return returningId(
    `INSERT INTO platform_users (email, display_name, platform_role, password_hash, is_active) VALUES (${lit(email)}, ${lit(email)}, ${lit(role)}, ${lit(passwordHash)}, ${isActive}) RETURNING id`,
  );
}

async function platformAuditCount(action: string, entityId: string): Promise<number> {
  return Number(
    await psql(
      `SELECT count(*) FROM platform_audit_logs WHERE action = ${lit(action)} AND entity_id = ${lit(entityId)}`,
    ),
  );
}

interface PlatformJwtClaims {
  typ: string;
  sub: string;
  platform_role?: string;
  tenant_id?: string;
  role?: string;
  email: string;
}

function decodeJwt(token: string): PlatformJwtClaims {
  const segment = token.split(".")[1];
  if (!segment) {
    throw new Error("JWT payload segment is missing");
  }
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as PlatformJwtClaims;
}

async function expectHttpError(promise: Promise<unknown>, statusCode: number, code?: string): Promise<void> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(statusCode);
    if (code) {
      expect((error as HttpException).getResponse()).toMatchObject({ error: { code, statusCode } });
    }
    return;
  }
  throw new Error(`Expected ${statusCode} ${code ?? ""} exception`);
}

const ip = "127.0.0.1";

describe("platform admin", () => {
  let app: INestApplication;
  let platformAuth: PlatformAuthService;
  let tenantAuth: AuthService;
  let passwordService: PasswordService;
  let applications: ApplicationsController;
  let temples: TemplesController;
  let platformUsers: PlatformUsersController;
  let tenantUsers: TenantUsersController;
  let breakGlass: BreakGlassController;
  let audit: PlatformAuditController;
  let devotees: PlatformDevoteesController;
  let reflector: Reflector;
  let platformAuthGuard: PlatformAuthGuard;
  let tenantAuthGuard: AuthGuard;
  let actorSuper: PlatformPrincipal;
  let actorSupport: PlatformPrincipal;
  let superAccessToken: string;
  let tenantAccessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    platformAuth = app.get(PlatformAuthService);
    tenantAuth = app.get(AuthService);
    passwordService = app.get(PasswordService);
    applications = app.get(ApplicationsController);
    temples = app.get(TemplesController);
    platformUsers = app.get(PlatformUsersController);
    tenantUsers = app.get(TenantUsersController);
    breakGlass = app.get(BreakGlassController);
    audit = app.get(PlatformAuditController);
    devotees = app.get(PlatformDevoteesController);
    reflector = app.get(Reflector);
    platformAuthGuard = app.get(PlatformAuthGuard);
    tenantAuthGuard = app.get(AuthGuard);

    const superTokens = await platformAuth.login({ email: superEmail, password: devPassword });
    superAccessToken = superTokens.accessToken;
    const superClaims = decodeJwt(superAccessToken);
    actorSuper = { sub: superClaims.sub, platform_role: "super_admin", email: superEmail };

    const supportTokens = await platformAuth.login({ email: supportEmail, password: devPassword });
    const supportClaims = decodeJwt(supportTokens.accessToken);
    actorSupport = { sub: supportClaims.sub, platform_role: "support", email: supportEmail };

    tenantAccessToken = (await tenantAuth.login({ email: "admin@wat-arun.example", password: devPassword }))
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("issues a platform access token with platform_role and NO tenant_id", () => {
    const claims = decodeJwt(superAccessToken);
    expect(claims.typ).toBe("platform_access");
    expect(claims.platform_role).toBe("super_admin");
    expect(claims.tenant_id).toBeUndefined();
  });

  it("replaying a consumed platform refresh token revokes the whole family", async () => {
    const t0 = await platformAuth.login({ email: supportEmail, password: devPassword });
    const t1 = await platformAuth.refresh(t0.refreshToken);
    expect(t1.refreshToken).not.toBe(t0.refreshToken);

    // Replay of the consumed t0 is rejected AND (reuse containment) the family
    // revocation persists past the 401 — so the rotated t1 is dead too.
    await expectHttpError(platformAuth.refresh(t0.refreshToken), 401);
    await expectHttpError(platformAuth.refresh(t1.refreshToken), 401);
  });

  it("rejects a disabled platform user and a wrong password at login", async () => {
    const hash = await passwordService.hash(devPassword);
    const email = `disabled-${randomUUID()}@innovera.example`;
    await insertPlatformUser(email, "support", hash, false);

    await expectHttpError(platformAuth.login({ email, password: devPassword }), 401);
    await expectHttpError(platformAuth.login({ email: superEmail, password: "wrong-password" }), 401);
  });

  it("isolates the two token planes (platform token != tenant token)", async () => {
    const platformCtx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${tenantAccessToken}` } }) }),
    } as never;
    // a tenant token must NOT authenticate on the platform plane (typ mismatch)
    await expect(platformAuthGuard.canActivate(platformCtx)).rejects.toThrow();

    const tenantCtx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${superAccessToken}` } }) }),
    } as never;
    // a platform token must NOT authenticate on the tenant plane (typ mismatch)
    await expect(tenantAuthGuard.canActivate(tenantCtx)).rejects.toThrow();
  });

  it("enforces the platform role matrix (support cannot approve)", () => {
    expect(reflector.get<string[]>(PLATFORM_ROLES_KEY, ApplicationsController.prototype.approve)).toEqual([
      "super_admin",
    ]);
    expect(reflector.get<string[]>(PLATFORM_ROLES_KEY, ApplicationsController.prototype.list)).toEqual([
      "super_admin",
      "support",
    ]);

    const guard = new PlatformRolesGuard(reflector);
    const handler = (): void => undefined;
    Reflect.defineMetadata(PLATFORM_ROLES_KEY, ["super_admin"], handler);
    const makeCtx = (principal: PlatformPrincipal): never =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ platformUser: principal }) }),
        getHandler: () => handler,
        getClass: () => ApplicationsController,
      }) as never;

    expect(() => guard.canActivate(makeCtx(actorSupport))).toThrow();
    expect(guard.canActivate(makeCtx(actorSuper))).toBe(true);
  });

  it("lists applications (support can read) including a freshly inserted pending one", async () => {
    const id = await insertPendingApplication(`วัดรายการ-${randomUUID()}`, `list-${randomUUID()}@example.com`);
    const { applications: rows } = await applications.list({ status: "pending" });
    expect(rows.some((a) => a.id === id)).toBe(true);
    expect(rows.every((a) => a.status === "pending")).toBe(true);
  });

  it("approves an application: creates an active temple + bootstrap admin, links + audits, idempotent", async () => {
    const tag = randomUUID();
    const appId = await insertPendingApplication(`วัดอนุมัติ-${tag}`, `contact-${tag}@example.com`);
    const slug = `wat-${tag}`;
    const adminEmail = `admin-${tag}@example.com`;

    const result = await applications.approve(actorSuper, ip, appId, {
      slug,
      adminEmail,
      adminPassword: devPassword,
      adminDisplayName: "ผู้ดูแลวัดใหม่",
    });

    expect(result.temple.status).toBe("active");
    expect(result.temple.slug).toBe(slug);
    expect(result.application.status).toBe("approved");
    expect(result.application.createdTempleId).toBe(result.temple.id);
    expect(result.adminUserId).toBeTruthy();

    // audit captured the linkage
    expect(await platformAuditCount("application.approved", appId)).toBe(1);

    // the bootstrap admin can actually log in to the new temple
    const adminTokens = await tenantAuth.login({ email: adminEmail, password: devPassword });
    const adminClaims = decodeJwt(adminTokens.accessToken);
    expect(adminClaims.tenant_id).toBe(result.temple.id);
    expect(adminClaims.role).toBe("admin");

    // a default chart of accounts is seeded so the temple can post donations
    // from day one (donation income auto-posts to revenue code "4000").
    const revenueAccount = await psql(
      `SELECT account_type FROM ledger_accounts WHERE tenant_id = ${lit(result.temple.id)} AND code = '4000'`,
    );
    expect(revenueAccount).toBe("revenue");
    const accountCount = await psql(
      `SELECT count(*) FROM ledger_accounts WHERE tenant_id = ${lit(result.temple.id)}`,
    );
    expect(accountCount).toBe("4");

    // approving again is rejected (already reviewed)
    await expectHttpError(
      applications.approve(actorSuper, ip, appId, { slug: `wat-${randomUUID()}`, adminPassword: devPassword }),
      409,
      "CONFLICT",
    );
  });

  it("rejects an application with a mandatory reason (missing reason -> 422)", async () => {
    const appId = await insertPendingApplication(`วัดปฏิเสธ-${randomUUID()}`, `rej-${randomUUID()}@example.com`);

    await expectHttpError(applications.reject(actorSuper, ip, appId, {}), 422, "UNPROCESSABLE_ENTITY");

    const { application } = await applications.reject(actorSuper, ip, appId, { reason: "ข้อมูลไม่ครบถ้วน" });
    expect(application.status).toBe("rejected");
    expect(application.rejectionReason).toBe("ข้อมูลไม่ครบถ้วน");
    expect(await platformAuditCount("application.rejected", appId)).toBe(1);
  });

  it("does not partially mutate when approve hits a duplicate slug (atomic, app stays pending)", async () => {
    const appId = await insertPendingApplication(`วัดชนslug-${randomUUID()}`, `dup-${randomUUID()}@example.com`);
    // 'wat-arun-demo' is a seeded temple slug
    await expectHttpError(
      applications.approve(actorSuper, ip, appId, { slug: "wat-arun-demo", adminPassword: devPassword }),
      409,
      "CONFLICT",
    );
    const status = await psql(`SELECT status FROM temple_applications WHERE id = ${lit(appId)}`);
    expect(status).toBe("pending");
  });

  it("suspends then resumes a temple with audit, and guards the status transitions", async () => {
    const templeId = await insertTemple(`wat-sus-${randomUUID()}`, "วัดทดสอบระงับ", "active");

    const suspended = await temples.suspend(actorSuper, ip, templeId, { reason: "ค้างชำระค่าบริการ" });
    expect(suspended.temple.status).toBe("suspended");
    expect(await platformAuditCount("temple.suspended", templeId)).toBe(1);

    // suspend again -> 409 (not active)
    await expectHttpError(temples.suspend(actorSuper, ip, templeId, { reason: "ซ้ำ" }), 409, "CONFLICT");

    const resumed = await temples.resume(actorSuper, ip, templeId, { reason: "ชำระแล้ว" });
    expect(resumed.temple.status).toBe("active");
    expect(await platformAuditCount("temple.resumed", templeId)).toBe(1);
  });

  it("disables/enables a platform user (immediate kill-switch) and forbids self-disable", async () => {
    const hash = await passwordService.hash(devPassword);
    const email = `toggle-${randomUUID()}@innovera.example`;
    const id = await insertPlatformUser(email, "support", hash, true);

    // active -> can log in, capture a live session
    const session = await platformAuth.login({ email, password: devPassword });

    await platformUsers.disable(actorSuper, ip, id);
    expect(await platformAuditCount("platform_user.disabled", id)).toBe(1);

    // future logins blocked
    await expectHttpError(platformAuth.login({ email, password: devPassword }), 401);
    // the ALREADY-issued access token is rejected by the guard (immediate kill-switch)
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${session.accessToken}` } }) }),
    } as never;
    await expect(platformAuthGuard.canActivate(ctx)).rejects.toThrow();
    // and the refresh token was revoked on disable
    await expectHttpError(platformAuth.refresh(session.refreshToken), 401);

    await platformUsers.enable(actorSuper, ip, id);
    await platformAuth.login({ email, password: devPassword });

    // cannot disable yourself
    await expectHttpError(platformUsers.disable(actorSuper, ip, actorSuper.sub), 403, "FORBIDDEN");
  });

  it("cross-tenant user directory scopes by tenant, never leaks the other tenant, omits password_hash, audits", async () => {
    const { users: aUsers } = await tenantUsers.list(actorSuper, ip, { tenantId: templeA });
    expect(aUsers.length).toBeGreaterThan(0);
    expect(aUsers.every((u) => u.tenantId === templeA)).toBe(true);
    expect(aUsers.every((u) => !u.email.endsWith("@wat-pho.example"))).toBe(true);
    expect(aUsers.every((u) => !("passwordHash" in (u as unknown as Record<string, unknown>)))).toBe(true);
    // the cross-tenant read is recorded
    expect(await platformAuditCount("tenant_directory.listed", templeA)).toBeGreaterThanOrEqual(1);

    const { users: bUsers } = await tenantUsers.list(actorSuper, ip, { tenantId: templeB });
    expect(bUsers.every((u) => u.tenantId === templeB)).toBe(true);
  });

  it("directory fails closed on a malformed tenantId (422, not a silent all-tenant read)", async () => {
    await expectHttpError(tenantUsers.list(actorSuper, ip, { tenantId: "not-a-uuid" }), 422, "UNPROCESSABLE_ENTITY");
  });

  it("break-glass: open -> read-only summary snapshot -> revoke; expired/revoked/non-owner are 403; audited", async () => {
    const { grant } = await breakGlass.open(actorSuper, ip, {
      tenantId: templeA,
      reason: "ตรวจสอบยอดบริจาคตามคำร้อง",
      ttlMinutes: 30,
    });
    expect(grant.tenantId).toBe(templeA);
    expect(grant.revokedAt).toBeNull();
    expect(await platformAuditCount("break_glass.opened", templeA)).toBeGreaterThanOrEqual(1);

    const { snapshot } = await breakGlass.snapshot(actorSuper, ip, grant.id);
    expect(snapshot.tenant.id).toBe(templeA);
    expect(typeof snapshot.donationTotalSatang).toBe("string");
    expect(typeof snapshot.counts.donors).toBe("number");
    // summary only — recent receipts carry NO donor PII (only doc metadata)
    for (const r of snapshot.recentReceipts) {
      expect(Object.keys(r).sort()).toEqual(["issuedAt", "receiptNo", "status"]);
    }
    expect(await platformAuditCount("break_glass.accessed", templeA)).toBeGreaterThanOrEqual(1);

    // a different platform user cannot use this grant
    await expectHttpError(breakGlass.snapshot(actorSupport, ip, grant.id), 403, "FORBIDDEN");

    // revoke -> snapshot now forbidden
    await breakGlass.revoke(actorSuper, ip, grant.id);
    await expectHttpError(breakGlass.snapshot(actorSuper, ip, grant.id), 403, "FORBIDDEN");

    // an expired grant is forbidden too
    const { grant: g2 } = await breakGlass.open(actorSuper, ip, {
      tenantId: templeA,
      reason: "ทดสอบหมดอายุ",
      ttlMinutes: 30,
    });
    await psql(`UPDATE break_glass_grants SET expires_at = now() - interval '1 minute' WHERE id = ${lit(g2.id)}`);
    await expectHttpError(breakGlass.snapshot(actorSuper, ip, g2.id), 403, "FORBIDDEN");
  });

  it("break-glass snapshot is read-only (no tenant rows mutated by a peek)", async () => {
    // An isolated, empty temple no other spec touches -> stable counts.
    const isolatedTemple = await insertTemple(`wat-bg-${randomUUID()}`, "วัดทดสอบ break-glass", "active");
    const { grant } = await breakGlass.open(actorSuper, ip, {
      tenantId: isolatedTemple,
      reason: "พิสูจน์ read-only",
      ttlMinutes: 30,
    });

    const before = await psql(`SELECT count(*) FROM donors WHERE tenant_id = ${lit(isolatedTemple)}`);
    const { snapshot } = await breakGlass.snapshot(actorSuper, ip, grant.id);
    const after = await psql(`SELECT count(*) FROM donors WHERE tenant_id = ${lit(isolatedTemple)}`);

    expect(snapshot.counts.donors).toBe(0);
    expect(snapshot.donationTotalSatang).toBe("0");
    expect(before).toBe("0");
    expect(after).toBe("0");
  });

  it("validates break-glass open (missing reason / out-of-range ttl -> 422)", async () => {
    await expectHttpError(
      breakGlass.open(actorSuper, ip, { tenantId: templeA, ttlMinutes: 30 }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectHttpError(
      breakGlass.open(actorSuper, ip, { tenantId: templeA, reason: "x", ttlMinutes: 9999 }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("returns the project error envelope for not-found and malformed ids (never a raw 500)", async () => {
    await expectHttpError(applications.approve(actorSuper, ip, randomUUID(), { slug: `wat-${randomUUID()}`, adminPassword: devPassword }), 404, "NOT_FOUND");
    await expectHttpError(temples.suspend(actorSuper, ip, "not-a-uuid", { reason: "x" }), 404, "NOT_FOUND");
  });

  it("manages devotee accounts: list + disable/enable (audited), no password leak", async () => {
    const email = `plat-dev-${randomUUID()}@example.com`;
    const id = await returningId(
      `INSERT INTO devotee_accounts (email, display_name) VALUES (${lit(email)}, 'ทดสอบจัดการ') RETURNING id`,
    );
    const { devotees: list } = await devotees.list();
    const row = list.find((d) => d.id === id);
    expect(row).toBeTruthy();
    expect((row as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

    const { devotee: disabled } = await devotees.disable(actorSuper, ip, id);
    expect(disabled.isActive).toBe(false);
    expect(await platformAuditCount("devotee_account.disabled", id)).toBe(1);

    const { devotee: enabled } = await devotees.enable(actorSuper, ip, id);
    expect(enabled.isActive).toBe(true);
    // enabling an already-enabled (or disabling a disabled) account -> 409
    await expectHttpError(devotees.enable(actorSuper, ip, id), 409, "CONFLICT");
  });

  it("exposes the platform audit trail (read-only) with the actor email resolved", async () => {
    // The suite's logins + approvals/suspensions have written audit rows.
    const { logs } = await audit.list();
    expect(logs.length).toBeGreaterThan(0);
    const login = logs.find((l) => l.action === "platform_auth.login");
    expect(login).toBeTruthy();
    expect(login?.actorEmail).toBeTruthy(); // joined from platform_users, not just the id
    // action filter narrows the result
    const approvals = await audit.list("application.approved");
    expect(approvals.logs.every((l) => l.action === "application.approved")).toBe(true);
  });
});
