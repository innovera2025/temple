import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { AuthGuard } from "../src/common/guards/auth.guard";
import { DevoteeAuthService } from "../src/devotee/devotee-auth.service";
import { DevoteeCeremoniesController } from "../src/devotee/devotee-ceremonies.controller";
import { DevoteeDonationsController } from "../src/devotee/devotee-donations.controller";
import { DevoteeItemLoansController } from "../src/devotee/devotee-item-loans.controller";
import { DevoteeProfileController } from "../src/devotee/devotee-profile.controller";
import { DevoteeRecordsController } from "../src/devotee/devotee-records.controller";
import { DevoteeTemplesController } from "../src/devotee/devotee-temples.controller";
import { DevoteeGuard } from "../src/devotee/guards/devotee.guard";
import { DevoteePrincipal } from "../src/devotee/types/devotee-request";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const devPassword = "Password123!";
const ip = "127.0.0.1";

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

async function returningId(sql: string): Promise<string> {
  const out = await psql(sql);
  return out.split("\n")[0]?.trim() ?? "";
}

async function insertTemple(slug: string, nameTh: string, status: string): Promise<string> {
  return returningId(
    `INSERT INTO temples (slug, name_th, status) VALUES (${lit(slug)}, ${lit(nameTh)}, ${lit(status)}) RETURNING id`,
  );
}

async function insertBorrowableItem(tenantId: string, name: string, totalQty: number): Promise<string> {
  return returningId(
    `INSERT INTO borrowable_items (tenant_id, name, category, unit, total_qty, status) VALUES (${lit(tenantId)}, ${lit(name)}, 'equipment', 'หลัง', ${totalQty}, 'active') RETURNING id`,
  );
}

interface DevoteeJwtClaims {
  typ: string;
  sub: string;
  email: string;
  tenant_id?: string;
  role?: string;
  platform_role?: string;
}

function decodeJwt(token: string): DevoteeJwtClaims {
  const segment = token.split(".")[1];
  if (!segment) {
    throw new Error("JWT payload segment is missing");
  }
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as DevoteeJwtClaims;
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

describe("devotee self-service plane", () => {
  let app: INestApplication;
  let devoteeAuth: DevoteeAuthService;
  let tenantAuth: AuthService;
  let temples: DevoteeTemplesController;
  let donations: DevoteeDonationsController;
  let ceremonies: DevoteeCeremoniesController;
  let itemLoansCtrl: DevoteeItemLoansController;
  let records: DevoteeRecordsController;
  let profileCtrl: DevoteeProfileController;
  let devoteeGuard: DevoteeGuard;
  let tenantAuthGuard: AuthGuard;

  let devotee1: DevoteePrincipal;
  let devotee1Token: string;
  let devotee2: DevoteePrincipal;
  let tenantAccessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    devoteeAuth = app.get(DevoteeAuthService);
    tenantAuth = app.get(AuthService);
    temples = app.get(DevoteeTemplesController);
    donations = app.get(DevoteeDonationsController);
    ceremonies = app.get(DevoteeCeremoniesController);
    itemLoansCtrl = app.get(DevoteeItemLoansController);
    records = app.get(DevoteeRecordsController);
    profileCtrl = app.get(DevoteeProfileController);
    devoteeGuard = app.get(DevoteeGuard);
    tenantAuthGuard = app.get(AuthGuard);

    const email1 = `devotee-${randomUUID()}@example.com`;
    const tokens1 = await devoteeAuth.register(
      { email: email1, displayName: "ญาติโยมหนึ่ง", password: devPassword },
      ip,
    );
    devotee1Token = tokens1.accessToken;
    const claims1 = decodeJwt(devotee1Token);
    devotee1 = { sub: claims1.sub, email: claims1.email };

    const email2 = `devotee-${randomUUID()}@example.com`;
    const tokens2 = await devoteeAuth.register(
      { email: email2, displayName: "ญาติโยมสอง", password: devPassword },
      ip,
    );
    const claims2 = decodeJwt(tokens2.accessToken);
    devotee2 = { sub: claims2.sub, email: claims2.email };

    tenantAccessToken = (await tenantAuth.login({ email: "admin@wat-arun.example", password: devPassword }))
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("issues a devotee access token with typ=devotee_access and NO tenant_id/role", () => {
    const claims = decodeJwt(devotee1Token);
    expect(claims.typ).toBe("devotee_access");
    expect(claims.tenant_id).toBeUndefined();
    expect(claims.role).toBeUndefined();
    expect(claims.platform_role).toBeUndefined();
  });

  it("rejects a duplicate-email registration with 409", async () => {
    const email = `dup-${randomUUID()}@example.com`;
    await devoteeAuth.register({ email, displayName: "ซ้ำ", password: devPassword }, ip);
    await expectHttpError(
      devoteeAuth.register({ email, displayName: "ซ้ำอีก", password: devPassword }, ip),
      409,
    );
  });

  it("rejects a wrong password at login with 401", async () => {
    await expectHttpError(devoteeAuth.login({ email: devotee1.email, password: "wrong" }), 401);
  });

  it("isolates the token planes (devotee token rejected by tenant guard, and vice-versa)", async () => {
    const tenantCtxWithDevoteeToken = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${devotee1Token}` } }) }),
    } as never;
    await expect(tenantAuthGuard.canActivate(tenantCtxWithDevoteeToken)).rejects.toThrow();

    const devoteeCtxWithTenantToken = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${tenantAccessToken}` } }) }),
    } as never;
    await expect(devoteeGuard.canActivate(devoteeCtxWithTenantToken)).rejects.toThrow();
  });

  it("lists ACTIVE temples only and exposes no internal columns", async () => {
    const inactiveId = await insertTemple(`wat-inactive-${randomUUID()}`, "วัดปิดรับ", "suspended");
    const { temples: list } = await temples.list();

    expect(list.some((t) => t.id === templeA)).toBe(true);
    expect(list.some((t) => t.id === inactiveId)).toBe(false);
    const sample = list[0];
    expect(sample).toBeDefined();
    expect(sample).not.toHaveProperty("taxId");
    expect(sample).not.toHaveProperty("registrationNo");
    expect(sample).not.toHaveProperty("slug");
    expect(sample).not.toHaveProperty("receiptHeaderTh");
  });

  it("returns a public temple profile by id, but 404 for an inactive temple", async () => {
    const { temple } = await temples.getById(templeA);
    expect(temple.id).toBe(templeA);
    expect(temple).not.toHaveProperty("taxId");
    expect(temple).not.toHaveProperty("registrationNo");
    expect(temple).not.toHaveProperty("slug");

    const inactiveId = await insertTemple(`wat-inactive-${randomUUID()}`, "วัดปิดรับ", "suspended");
    await expectHttpError(temples.getById(inactiveId), 404);
  });

  it("records a donation under the selected temple, tags the donor to the devotee, and audits as actor_type=devotee", async () => {
    const result = await donations.create(devotee1, templeA, ip, {
      amountSatang: 50000,
      method: "cash",
      donationDate: "2026-06-01",
      // A forged devotee/donor field in the body must be ignored (validator strips it).
      donorId: randomUUID(),
      devoteeAccountId: randomUUID(),
    } as never);

    // Self-reported money is a PLEDGE: no income posts to the official ledger
    // until staff confirm the funds (POST /donations/:id/confirm).
    expect(result.donation.status).toBe("pledged");
    expect(result.donation.amountSatang).toBe("50000");
    expect(result.ledgerEntry).toBeNull();
    const ledgerCount = await psql(
      `SELECT count(*) FROM ledger_entries WHERE donation_id = ${lit(result.donation.id)}`,
    );
    expect(ledgerCount).toBe("0");

    // The donor is keyed to THIS devotee (token), never the forged id.
    const donorDevotee = await psql(
      `SELECT devotee_account_id FROM donors WHERE id = ${lit(result.donation.donorId ?? "")}`,
    );
    expect(donorDevotee).toBe(devotee1.sub);

    // The donation + ledger entry belong to temple A.
    const donationTenant = await psql(
      `SELECT tenant_id FROM donations WHERE id = ${lit(result.donation.id)}`,
    );
    expect(donationTenant).toBe(templeA);

    // The donation:create audit row records the devotee actor, NOT a user.
    const auditRow = await psql(
      `SELECT actor_type || '|' || coalesce(actor_user_id::text,'NULL') || '|' || coalesce(actor_devotee_account_id::text,'NULL') FROM audit_logs WHERE action = 'donation:create' AND entity_id = ${lit(result.donation.id)}`,
    );
    expect(auditRow).toBe(`devotee|NULL|${devotee1.sub}`);

    // No ledger:post audit either — posting happens only at staff confirmation.
    const ledgerAuditCount = await psql(
      `SELECT count(*) FROM audit_logs WHERE action = 'ledger:post' AND (metadata->>'donationId') = ${lit(result.donation.id)}`,
    );
    expect(ledgerAuditCount).toBe("0");
  });

  it("reuses ONE donor per (temple, devotee) across repeat donations", async () => {
    const first = await donations.create(devotee1, templeB, ip, {
      amountSatang: 10000,
      method: "cash",
      donationDate: "2026-06-02",
    } as never);
    const second = await donations.create(devotee1, templeB, ip, {
      amountSatang: 20000,
      method: "qr",
      donationDate: "2026-06-03",
    } as never);
    expect(first.donation.donorId).toBe(second.donation.donorId);

    const donorCount = await psql(
      `SELECT count(*) FROM donors WHERE tenant_id = ${lit(templeB)} AND devotee_account_id = ${lit(devotee1.sub)}`,
    );
    expect(donorCount).toBe("1");
  });

  it("rejects an invalid calendar date (2026-02-31) with 422 (not just a shape regex)", async () => {
    await expectHttpError(
      donations.create(devotee1, templeA, ip, {
        amountSatang: 10000,
        method: "cash",
        donationDate: "2026-02-31",
      } as never),
      422,
    );
  });

  it("rejects a donation to an inactive temple with 404", async () => {
    const inactiveId = await insertTemple(`wat-inactive-${randomUUID()}`, "วัดปิดรับ", "suspended");
    await expectHttpError(
      donations.create(devotee1, inactiveId, ip, {
        amountSatang: 10000,
        method: "cash",
        donationDate: "2026-06-01",
      } as never),
      404,
    );
  });

  it("returns ONLY the requesting devotee's own donations across temples (cross-read isolation)", async () => {
    await donations.create(devotee2, templeA, ip, {
      amountSatang: 30000,
      method: "cash",
      donationDate: "2026-06-04",
    } as never);

    const { donations: mine } = await records.myDonations(devotee1);
    const { donations: theirs } = await records.myDonations(devotee2);

    // devotee1 donated to both temple A and temple B above.
    expect(mine.some((d) => d.templeId === templeA)).toBe(true);
    expect(mine.some((d) => d.templeId === templeB)).toBe(true);
    // none of devotee1's rows may belong to devotee2 (verified by donor linkage).
    const mineDonorOk = await Promise.all(
      mine.map(async (d) => {
        const owner = await psql(
          `SELECT dn.devotee_account_id FROM donations d JOIN donors dn ON dn.id = d.donor_id WHERE d.id = ${lit(d.id)}`,
        );
        return owner === devotee1.sub;
      }),
    );
    expect(mineDonorOk.every(Boolean)).toBe(true);

    // devotee2 sees only its own (1+) and never devotee1's.
    expect(theirs.length).toBeGreaterThanOrEqual(1);
    const theirsDonorOk = await Promise.all(
      theirs.map(async (d) => {
        const owner = await psql(
          `SELECT dn.devotee_account_id FROM donations d JOIN donors dn ON dn.id = d.donor_id WHERE d.id = ${lit(d.id)}`,
        );
        return owner === devotee2.sub;
      }),
    );
    expect(theirsDonorOk.every(Boolean)).toBe(true);
  });

  // --- Phase 2: ceremony booking ------------------------------------------------

  it("books a ceremony as status=requested, stamps the devotee, and audits as actor_type=devotee", async () => {
    const result = await ceremonies.create(devotee1, templeA, ip, {
      ceremonyType: "merit",
      title: "ทำบุญขึ้นบ้านใหม่",
      ceremonyDate: "2026-08-01",
      // Forged server-controlled fields must be ignored by the validator/server.
      status: "completed",
      assignedMonks: "หลวงพี่ปลอม",
      devoteeAccountId: randomUUID(),
    } as never);

    expect(result.booking.status).toBe("requested");
    expect(result.booking.title).toBe("ทำบุญขึ้นบ้านใหม่");

    // Row is bound to temple A, tagged to THIS devotee, requester = devotee name,
    // and the forged staff-only assignedMonks was NOT honored.
    const row = await psql(
      `SELECT tenant_id || '|' || coalesce(devotee_account_id::text,'NULL') || '|' || status || '|' || coalesce(requester_name,'NULL') || '|' || coalesce(assigned_monks,'NULL') FROM ceremonies WHERE id = ${lit(result.booking.id)}`,
    );
    expect(row).toBe(`${templeA}|${devotee1.sub}|requested|ญาติโยมหนึ่ง|NULL`);

    const auditRow = await psql(
      `SELECT actor_type || '|' || coalesce(actor_user_id::text,'NULL') || '|' || coalesce(actor_devotee_account_id::text,'NULL') FROM audit_logs WHERE action = 'ceremony:create' AND entity_id = ${lit(result.booking.id)}`,
    );
    expect(auditRow).toBe(`devotee|NULL|${devotee1.sub}`);
  });

  it("rejects a booking with an invalid type/date (422) and an inactive temple (404)", async () => {
    await expectHttpError(
      ceremonies.create(devotee1, templeA, ip, {
        ceremonyType: "party",
        title: "x",
        ceremonyDate: "2026-08-01",
      } as never),
      422,
    );
    await expectHttpError(
      ceremonies.create(devotee1, templeA, ip, {
        ceremonyType: "merit",
        title: "x",
        ceremonyDate: "2026-02-31",
      } as never),
      422,
    );
    const inactiveId = await insertTemple(`wat-inactive-${randomUUID()}`, "วัดปิดรับ", "suspended");
    await expectHttpError(
      ceremonies.create(devotee1, inactiveId, ip, {
        ceremonyType: "merit",
        title: "x",
        ceremonyDate: "2026-08-01",
      } as never),
      404,
    );
  });

  it("returns ONLY the requesting devotee's own ceremony bookings across temples", async () => {
    await ceremonies.create(devotee1, templeB, ip, {
      ceremonyType: "ordination",
      title: "งานบวช",
      ceremonyDate: "2026-09-01",
    } as never);
    await ceremonies.create(devotee2, templeA, ip, {
      ceremonyType: "funeral",
      title: "งานของอีกคน",
      ceremonyDate: "2026-09-02",
    } as never);

    const { ceremonies: mine } = await records.myCeremonies(devotee1);
    const { ceremonies: theirs } = await records.myCeremonies(devotee2);

    expect(mine.some((c) => c.templeId === templeA)).toBe(true);
    expect(mine.some((c) => c.templeId === templeB)).toBe(true);
    const mineOk = await Promise.all(
      mine.map(async (c) => {
        const owner = await psql(`SELECT devotee_account_id FROM ceremonies WHERE id = ${lit(c.id)}`);
        return owner === devotee1.sub;
      }),
    );
    expect(mineOk.every(Boolean)).toBe(true);

    expect(theirs.length).toBeGreaterThanOrEqual(1);
    expect(theirs.every((c) => c.title !== "ทำบุญขึ้นบ้านใหม่")).toBe(true);
    const theirsOk = await Promise.all(
      theirs.map(async (c) => {
        const owner = await psql(`SELECT devotee_account_id FROM ceremonies WHERE id = ${lit(c.id)}`);
        return owner === devotee2.sub;
      }),
    );
    expect(theirsOk.every(Boolean)).toBe(true);
  });

  // --- item loans: browse + borrow request + own history -----------------------

  it("lists a temple's ACTIVE borrowable items with availableQty and safe columns only", async () => {
    const itemId = await insertBorrowableItem(templeA, `เต็นท์-${randomUUID().slice(0, 8)}`, 5);
    const { items } = await itemLoansCtrl.items(templeA);
    const mine = items.find((i) => i.id === itemId);
    expect(mine).toBeDefined();
    expect(mine?.availableQty).toBe(5);
    // public-safe shape only — no tenant internals or borrower PII columns leak.
    expect(mine).not.toHaveProperty("tenantId");
    expect(mine).not.toHaveProperty("note");
    expect(mine).not.toHaveProperty("totalQty");
  });

  it("submits a borrow REQUEST: status=requested, stamps the devotee, NO stock decrement, NO photo, audits actor=devotee", async () => {
    const itemId = await insertBorrowableItem(templeA, `โต๊ะ-${randomUUID().slice(0, 8)}`, 4);
    const myName = (await profileCtrl.profile(devotee1)).profile.displayName;
    const { request } = await itemLoansCtrl.request(devotee1, templeA, ip, {
      itemId,
      quantity: 2,
      borrowedAt: "2031-10-01",
      // Forged server-controlled fields must be ignored by the validator/server.
      status: "borrowed",
      devoteeAccountId: randomUUID(),
      borrowPhotoIds: [randomUUID()],
    } as never);

    expect(request.status).toBe("requested");
    expect(request.quantity).toBe(2);

    // Row bound to temple A, tagged to THIS devotee, requester = the devotee's own
    // name, NO photo committed, and the forged status/account were NOT honored.
    const row = await psql(
      `SELECT tenant_id || '|' || coalesce(devotee_account_id::text,'NULL') || '|' || status || '|' || coalesce(borrower_name,'NULL') || '|' || coalesce(borrow_photo_ids::text,'NULL') FROM item_loans WHERE id = ${lit(request.id)}`,
    );
    expect(row).toBe(`${templeA}|${devotee1.sub}|requested|${myName}|NULL`);

    // A request commits NO stock — availableQty is still the full total.
    const { items } = await itemLoansCtrl.items(templeA);
    expect(items.find((i) => i.id === itemId)?.availableQty).toBe(4);

    const auditRow = await psql(
      `SELECT actor_type || '|' || coalesce(actor_user_id::text,'NULL') || '|' || coalesce(actor_devotee_account_id::text,'NULL') FROM audit_logs WHERE action = 'item_loan:request' AND entity_id = ${lit(request.id)}`,
    );
    expect(auditRow).toBe(`devotee|NULL|${devotee1.sub}`);
  });

  it("rejects a borrow request to an inactive temple (404), an unknown item (404), and an invalid quantity (422)", async () => {
    const inactiveId = await insertTemple(`wat-inactive-${randomUUID()}`, "วัดปิดรับ", "suspended");
    await expectHttpError(
      itemLoansCtrl.request(devotee1, inactiveId, ip, { itemId: randomUUID(), quantity: 1, borrowedAt: "2031-10-01" } as never),
      404,
    );
    await expectHttpError(
      itemLoansCtrl.request(devotee1, templeA, ip, { itemId: randomUUID(), quantity: 1, borrowedAt: "2031-10-01" } as never),
      404,
    );
    const itemId = await insertBorrowableItem(templeA, `ม้านั่ง-${randomUUID().slice(0, 8)}`, 3);
    await expectHttpError(
      itemLoansCtrl.request(devotee1, templeA, ip, { itemId, quantity: 0, borrowedAt: "2031-10-01" } as never),
      422,
    );
  });

  it("returns ONLY the requesting devotee's own item loans across temples (cross-read isolation)", async () => {
    const itemAId = await insertBorrowableItem(templeA, `กลอง-${randomUUID().slice(0, 8)}`, 5);
    const itemBId = await insertBorrowableItem(templeB, `ฉิ่ง-${randomUUID().slice(0, 8)}`, 5);
    await itemLoansCtrl.request(devotee1, templeA, ip, { itemId: itemAId, quantity: 1, borrowedAt: "2031-10-02" } as never);
    await itemLoansCtrl.request(devotee1, templeB, ip, { itemId: itemBId, quantity: 1, borrowedAt: "2031-10-03" } as never);
    await itemLoansCtrl.request(devotee2, templeA, ip, { itemId: itemAId, quantity: 1, borrowedAt: "2031-10-04" } as never);

    const { itemLoans: mine } = await records.myItemLoans(devotee1);
    const { itemLoans: theirs } = await records.myItemLoans(devotee2);

    expect(mine.some((l) => l.templeId === templeA)).toBe(true);
    expect(mine.some((l) => l.templeId === templeB)).toBe(true);
    const mineOk = await Promise.all(
      mine.map(async (l) => (await psql(`SELECT devotee_account_id FROM item_loans WHERE id = ${lit(l.id)}`)) === devotee1.sub),
    );
    expect(mineOk.every(Boolean)).toBe(true);

    expect(theirs.length).toBeGreaterThanOrEqual(1);
    const theirsOk = await Promise.all(
      theirs.map(async (l) => (await psql(`SELECT devotee_account_id FROM item_loans WHERE id = ${lit(l.id)}`)) === devotee2.sub),
    );
    expect(theirsOk.every(Boolean)).toBe(true);
  });

  it("lists upcoming PUBLIC events for a temple with safe columns only (no requester PII)", async () => {
    await psql(
      `INSERT INTO ceremonies (tenant_id, ceremony_type, title, ceremony_date, status, is_public, requester_name, requester_phone) VALUES (${lit(templeA)}, 'robe_offering', 'งานกฐินสาธารณะ', '2031-11-05', 'planned', true, 'ห้ามเปิดเผย', '0800000000')`,
    );
    const { events } = await itemLoansCtrl.events(templeA);
    const ev = events.find((e) => e.title === "งานกฐินสาธารณะ");
    expect(ev).toBeDefined();
    expect(ev?.templeId).toBe(templeA);
    expect(ev).not.toHaveProperty("requesterName");
    expect(ev).not.toHaveProperty("requesterPhone");
    expect(ev).not.toHaveProperty("assignedMonks");
  });

  // --- Phase 4: account settings + own-receipt document -------------------------

  it("returns and updates the devotee's own profile", async () => {
    const { profile } = await profileCtrl.profile(devotee1);
    expect(profile.email).toBe(devotee1.email);
    const { profile: updated } = await profileCtrl.update(devotee1, { displayName: "ชื่อใหม่", phone: "0899999999" });
    expect(updated.displayName).toBe("ชื่อใหม่");
    expect(updated.phone).toBe("0899999999");
  });

  it("changes password (wrong current -> 401; correct -> success, revokes refresh tokens)", async () => {
    const email = `pw-${randomUUID()}@example.com`;
    const tokens = await devoteeAuth.register({ email, displayName: "เปลี่ยนรหัส", password: devPassword }, ip);
    const claims = decodeJwt(tokens.accessToken);
    const principal = { sub: claims.sub, email: claims.email };

    await expectHttpError(
      profileCtrl.changePassword(principal, { currentPassword: "wrong-pass", newPassword: "NewPassword123!" }),
      401,
    );
    const before = await psql(
      `SELECT count(*) FROM devotee_refresh_tokens WHERE devotee_account_id = ${lit(principal.sub)} AND revoked_at IS NULL`,
    );
    expect(Number(before)).toBeGreaterThanOrEqual(1);

    const res = await profileCtrl.changePassword(principal, {
      currentPassword: devPassword,
      newPassword: "NewPassword123!",
    });
    expect(res.changed).toBe(true);

    // All refresh tokens revoked; old password rejected; new password works.
    const after = await psql(
      `SELECT count(*) FROM devotee_refresh_tokens WHERE devotee_account_id = ${lit(principal.sub)} AND revoked_at IS NULL`,
    );
    expect(after).toBe("0");
    await expectHttpError(devoteeAuth.login({ email, password: devPassword }), 401);
    const relogin = await devoteeAuth.login({ email, password: "NewPassword123!" });
    expect(relogin.accessToken).toBeTruthy();
  });

  it("serves the devotee's OWN receipt document but 404s another devotee's", async () => {
    const created = await donations.create(devotee1, templeA, ip, {
      amountSatang: 12300,
      method: "cash",
      donationDate: "2026-06-10",
    } as never);
    const receiptNo = `RC-${randomUUID().slice(0, 8)}`;
    const receiptId = await returningId(
      `INSERT INTO receipts (tenant_id, donation_id, receipt_no, status) VALUES (${lit(templeA)}, ${lit(created.donation.id)}, ${lit(receiptNo)}, 'issued') RETURNING id`,
    );

    const { receipt } = await records.myReceiptDocument(devotee1, receiptId);
    expect(receipt.receiptNo).toBe(receiptNo);
    expect(receipt.donorName).toBeTruthy();
    expect(receipt.amountText).toBeTruthy();

    // devotee2 cannot read devotee1's receipt (no existence/content disclosure).
    await expectHttpError(records.myReceiptDocument(devotee2, receiptId), 404);
  });

  // --- Phase 5: hardening (refresh reuse-detection + enumeration) ---------------

  it("rotates refresh tokens, and replaying a consumed token revokes the whole family", async () => {
    const email = `reuse-${randomUUID()}@example.com`;
    const t0 = await devoteeAuth.register({ email, displayName: "รีเฟรช", password: devPassword }, ip);
    const t1 = await devoteeAuth.refresh(t0.refreshToken);
    expect(t1.refreshToken).not.toBe(t0.refreshToken);
    expect(t1.accessToken).toBeTruthy();

    // Replaying the already-consumed t0 is rejected AND (reuse-detection) revokes
    // the whole family — so the freshly rotated t1 is now dead too.
    await expectHttpError(devoteeAuth.refresh(t0.refreshToken), 401);
    await expectHttpError(devoteeAuth.refresh(t1.refreshToken), 401);
  });

  it("login with an unknown email returns a generic 401 (no account disclosure)", async () => {
    await expectHttpError(
      devoteeAuth.login({ email: `nobody-${randomUUID()}@example.com`, password: "whatever123" }),
      401,
    );
  });
});
