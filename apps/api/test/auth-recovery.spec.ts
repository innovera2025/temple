import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { MailService } from "../src/common/mail/mail.service";
import { DevoteeAuthController } from "../src/devotee/devotee-auth.controller";
import { DevoteeProfileController } from "../src/devotee/devotee-profile.controller";

const execFileAsync = promisify(execFile);
const adminEmail = "admin@wat-arun.example";
const devPassword = "Password123!";
const ip = "127.0.0.1";

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec", "-i", process.env.POSTGRES_CONTAINER ?? "wat-dev-db",
      "psql", "-U", process.env.POSTGRES_USER ?? "wat_dev", "-d", process.env.POSTGRES_DB ?? "wat_dev",
      "-v", "ON_ERROR_STOP=1", "-At", "-c", sql,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return stdout.trim();
}

async function expectHttpError(promise: Promise<unknown>, statusCode: number): Promise<void> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(statusCode);
    return;
  }
  throw new Error(`Expected ${statusCode} exception`);
}

/** The raw token only exists inside the captured email — fish it out. */
function tokenFromMail(mail: MailService, to: string, pathPart: string): string {
  const message = [...mail.sent].reverse().find((m) => m.to === to && m.text.includes(pathPart));
  expect(message, `no captured mail to ${to} containing ${pathPart}`).toBeDefined();
  const match = /token=([0-9a-f]{64})/.exec(message?.text ?? "");
  expect(match).toBeTruthy();
  return match?.[1] ?? "";
}

describe("account recovery (forgot/reset password + devotee email verification)", () => {
  let app: INestApplication;
  let auth: AuthController;
  let authService: AuthService;
  let devoteeAuth: DevoteeAuthController;
  let devoteeProfile: DevoteeProfileController;
  let mail: MailService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    auth = app.get(AuthController);
    authService = app.get(AuthService);
    devoteeAuth = app.get(DevoteeAuthController);
    devoteeProfile = app.get(DevoteeProfileController);
    mail = app.get(MailService);
  });

  afterAll(async () => {
    // Restore the seeded admin's password so later suites keep working.
    await app.close();
  });

  it("staff forgot/reset round trip: token mail -> new password works, old sessions revoked, single-use token", async () => {
    const before = await authService.login({ email: adminEmail, password: devPassword });

    await expect(auth.forgotPassword({ email: adminEmail })).resolves.toEqual({ accepted: true });
    const token = tokenFromMail(mail, adminEmail, "reset-password/staff");

    const newPassword = `Reset-${randomUUID().slice(0, 8)}!`;
    await expect(auth.resetPassword({ token, newPassword })).resolves.toEqual({ reset: true });

    // old password dead, new one works
    await expectHttpError(authService.login({ email: adminEmail, password: devPassword }), 401);
    const after = await authService.login({ email: adminEmail, password: newPassword });
    expect(after.accessToken).toBeTruthy();

    // pre-reset refresh tokens are revoked (controlling email != controlling sessions)
    await expectHttpError(authService.refresh({ refreshToken: before.refreshToken }), 401);

    // the token is single-use
    await expectHttpError(auth.resetPassword({ token, newPassword: "Another123!" }), 422);

    // audit row exists
    const audited = await psql(
      `SELECT count(*) FROM audit_logs WHERE action = 'user:password_reset' AND actor_user_id = (SELECT id FROM users WHERE email = '${adminEmail}')`,
    );
    expect(Number(audited)).toBeGreaterThanOrEqual(1);

    // restore the seed password for the rest of the suite run
    await expect(auth.forgotPassword({ email: adminEmail })).resolves.toEqual({ accepted: true });
    const restoreToken = tokenFromMail(mail, adminEmail, "reset-password/staff");
    await expect(auth.resetPassword({ token: restoreToken, newPassword: devPassword })).resolves.toEqual({ reset: true });
  });

  it("forgot-password answers identically for unknown emails (no enumeration) and sends nothing", async () => {
    const sentBefore = mail.sent.length;
    await expect(auth.forgotPassword({ email: `nobody-${randomUUID()}@example.com` })).resolves.toEqual({
      accepted: true,
    });
    expect(mail.sent.length).toBe(sentBefore);
  });

  it("reset rejects malformed bodies (422): bad token shape, short password", async () => {
    await expectHttpError(auth.resetPassword({ token: "zzz", newPassword: "GoodPass123!" }), 422);
    await expectHttpError(auth.resetPassword({ token: "a".repeat(64), newPassword: "short" }), 422);
    await expectHttpError(auth.forgotPassword({ email: "not-an-email" }), 422);
  });

  it("devotee register sends a verification mail; verify-email flips the profile flag (token single-use)", async () => {
    const email = `verify-${randomUUID()}@example.com`;
    const tokens = await devoteeAuth.register(ip, { email, displayName: "ผู้ยืนยัน", password: devPassword });
    const principal = JSON.parse(
      Buffer.from(tokens.accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub: string; email: string };

    const profileBefore = await devoteeProfile.profile(principal as never);
    expect(profileBefore.profile.emailVerified).toBe(false);

    const token = tokenFromMail(mail, email, "verify-email");
    await expect(devoteeAuth.verifyEmail({ token })).resolves.toEqual({ verified: true });

    const profileAfter = await devoteeProfile.profile(principal as never);
    expect(profileAfter.profile.emailVerified).toBe(true);

    await expectHttpError(devoteeAuth.verifyEmail({ token }), 422);

    // resend after verification is a quiet no-op (no new mail)
    const sentBefore = mail.sent.length;
    await expect(devoteeProfile.resendVerification(principal as never)).resolves.toEqual({ accepted: true });
    expect(mail.sent.length).toBe(sentBefore);
  });

  it("devotee forgot/reset round trip revokes refresh tokens and accepts the new password", async () => {
    const email = `dreset-${randomUUID()}@example.com`;
    const session = await devoteeAuth.register(ip, { email, displayName: "ผู้ลืมรหัส", password: devPassword });

    await expect(devoteeAuth.forgotPassword({ email })).resolves.toEqual({ accepted: true });
    const token = tokenFromMail(mail, email, "reset-password/devotee");

    const newPassword = "NewDevotee123!";
    await expect(devoteeAuth.resetPassword({ token, newPassword })).resolves.toEqual({ reset: true });

    await expectHttpError(devoteeAuth.login(ip, { email, password: devPassword }), 401);
    const relogin = await devoteeAuth.login(ip, { email, password: newPassword });
    expect(relogin.accessToken).toBeTruthy();
    await expectHttpError(devoteeAuth.refresh({ refreshToken: session.refreshToken }), 401);
  });

  it("an expired token is rejected (422)", async () => {
    const email = `expired-${randomUUID()}@example.com`;
    await devoteeAuth.register(ip, { email, displayName: "หมดอายุ", password: devPassword });
    await devoteeAuth.forgotPassword({ email });
    const token = tokenFromMail(mail, email, "reset-password/devotee");
    await psql(
      `UPDATE auth_action_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = encode(sha256('${token}'::bytea), 'hex')`,
    );
    await expectHttpError(devoteeAuth.resetPassword({ token, newPassword: "Whatever123!" }), 422);
  });
});
