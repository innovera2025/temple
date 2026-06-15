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
import { DevoteeAuthService } from "../src/devotee/devotee-auth.service";
import { ItemLoansController } from "../src/item-loans/item-loans.controller";
import { ItemLoansService } from "../src/item-loans/item-loans.service";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const devPassword = "Password123!";

interface TokenPayload { sub: string; tenant_id: string; role: string; email: string }
function decodeJwtPayload(token: string): TokenPayload {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("JWT payload segment is missing");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    ["exec", "-i", process.env.POSTGRES_CONTAINER ?? "wat-dev-db", "psql", "-U", process.env.POSTGRES_USER ?? "wat_dev",
      "-d", process.env.POSTGRES_DB ?? "wat_dev", "-q", "-At", "-c", sql],
    { maxBuffer: 1024 * 1024 },
  );
  return stdout.trim();
}

/** Insert an item_loan photo attachment owned by `ownerId` (the borrowable item),
 *  mirroring the real upload path (ownerType=item_loan, ownerId=item id). */
async function createPhoto(tenantId: string, ownerId: string): Promise<string> {
  return psql(
    `INSERT INTO attachments (tenant_id, owner_type, owner_id, file_name, mime_type, storage_key, byte_size, data)
     VALUES ('${tenantId}', 'item_loan', '${ownerId}', 'borrow.jpg', 'image/jpeg', '${randomUUID()}', 3, '\\x010203')
     RETURNING id`,
  );
}

async function auditCount(tenantId: string, action: string, entityId: string): Promise<number> {
  return Number(await psql(`SELECT count(*) FROM audit_logs WHERE tenant_id = '${tenantId}' AND action = '${action}' AND entity_id = '${entityId}'`));
}

async function expectErr(promise: Promise<unknown>, statusCode: number, code: string): Promise<void> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(statusCode);
    expect((error as HttpException).getResponse()).toMatchObject({ error: { code, statusCode } });
    return;
  }
  throw new Error(`Expected ${statusCode} ${code}`);
}

const ip = "127.0.0.1";

describe("item-loans (การยืม-คืนสิ่งของวัด)", () => {
  let app: INestApplication;
  let auth: AuthService;
  let loans: ItemLoansController;
  let loansSvc: ItemLoansService;
  let devoteeAuth: DevoteeAuthService;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    auth = app.get(AuthService);
    loans = app.get(ItemLoansController);
    loansSvc = app.get(ItemLoansService);
    devoteeAuth = app.get(DevoteeAuthService);
    reflector = app.get(Reflector);
    actorA = decodeJwtPayload((await auth.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await auth.login({ email: adminEmailB, password: devPassword })).accessToken);
  });
  afterAll(async () => {
    await app.close();
  });

  async function makeItem(totalQty: number) {
    const { item } = await loans.createItem(actorA, templeA, ip, { name: `เต็นท์-${randomUUID().slice(0, 8)}`, category: "equipment", unit: "หลัง", totalQty });
    return item;
  }

  /** Register a devotee and return the principal-ish fields needed for a borrow request. */
  async function registerDevotee() {
    const email = `loan-dev-${randomUUID()}@example.com`;
    const tokens = await devoteeAuth.register({ email, displayName: "ญาติโยมยืม", password: devPassword }, ip);
    const segment = tokens.accessToken.split(".")[1] ?? "";
    const sub = (JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as { sub: string }).sub;
    return { id: sub, email, displayName: "ญาติโยมยืม" };
  }

  it("creates an item showing availableQty and audits it", async () => {
    const item = await makeItem(5);
    expect(item.totalQty).toBe(5);
    expect(item.availableQty).toBe(5);
    expect(await auditCount(templeA, "item_loan:item:create", item.id)).toBe(1);
  });

  it("borrowing requires a photo, and the photo must exist (ถ่ายรูปก่อนยืม)", async () => {
    const item = await makeItem(5);
    await expectErr(loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 1, borrowedAt: "2031-08-01" }), 422, "UNPROCESSABLE_ENTITY");
    await expectErr(loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: randomUUID() }), 422, "UNPROCESSABLE_ENTITY");
  });

  it("a soft-deleted photo no longer counts as borrow evidence (422)", async () => {
    const item = await makeItem(5);
    const photo = await createPhoto(templeA, item.id);
    // Evidence removed AFTER capture must not be reusable as proof of hand-over.
    await psql(`UPDATE attachments SET deleted_at = now() WHERE id = '${photo}'`);
    await expectErr(
      loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: photo }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("records a borrow (LOAN number, photo, audit) and decrements availableQty; lists who borrowed", async () => {
    const item = await makeItem(5);
    const photo = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "คุณสมชาย", borrowerPhone: "081", quantity: 2, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    expect(loan.loanNo).toMatch(/^LOAN-\d{6}$/);
    expect(loan.status).toBe("borrowed");
    expect(loan.borrowPhotoId).toBe(photo);
    expect(await auditCount(templeA, "item_loan:create", loan.id)).toBe(1);
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(3);

    const { loans: list } = await loans.listLoans(templeA, { itemId: item.id });
    expect(list.some((l) => l.id === loan.id && l.borrowerName === "คุณสมชาย")).toBe(true);
  });

  it("records multiple borrow photos (borrowPhotoIds) and keeps the first as the primary", async () => {
    const item = await makeItem(5);
    const p1 = await createPhoto(templeA, item.id);
    const p2 = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "คุณมานี", quantity: 1, borrowedAt: "2031-08-02", borrowPhotoIds: [p1, p2] });
    expect(loan.borrowPhotoIds).toEqual([p1, p2]);
    expect(loan.borrowPhotoId).toBe(p1);
    const { loans: list } = await loans.listLoans(templeA, { itemId: item.id });
    expect(list.find((l) => l.id === loan.id)?.borrowPhotoIds).toEqual([p1, p2]);
  });

  it("rejects reusing a photo already used as evidence by another loan (no cross-loan replay)", async () => {
    const item = await makeItem(5);
    const photo = await createPhoto(templeA, item.id);
    await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ยืมครั้งแรก", quantity: 1, borrowedAt: "2031-09-01", borrowPhotoId: photo });
    // the SAME photo (same item, so the owner check passes) cannot stand in for a second loan
    await expectErr(
      loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ยืมซ้ำรูป", quantity: 1, borrowedAt: "2031-09-02", borrowPhotoId: photo }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects reusing the borrow photo as the return photo (borrow != return evidence)", async () => {
    const item = await makeItem(5);
    const borrowPhoto = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "คืนรูปเดิม", quantity: 1, borrowedAt: "2031-09-03", borrowPhotoId: borrowPhoto });
    await expectErr(
      loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-09-04", returnPhotoIds: [borrowPhoto] }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("serializes a concurrent borrow + return that reuse the same photo (advisory lock) -> one 422", async () => {
    const item = await makeItem(5);
    const borrowPhoto = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ยืมไว้ก่อน", quantity: 1, borrowedAt: "2031-09-10", borrowPhotoId: borrowPhoto });
    // One fresh photo that BOTH a new borrow and the return of `loan` try to claim
    // at the same time — the per-tenant loan lock must let only one succeed.
    const shared = await createPhoto(templeA, item.id);
    const results = await Promise.allSettled([
      loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ยืมใหม่", quantity: 1, borrowedAt: "2031-09-11", borrowPhotoId: shared }),
      loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-09-11", returnPhotoIds: [shared] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(((rejected[0] as PromiseRejectedResult).reason as HttpException).getStatus()).toBe(422);
  });

  it("rejects a borrow photo id that does not belong to the tenant", async () => {
    const item = await makeItem(5);
    const valid = await createPhoto(templeA, item.id);
    await expectErr(loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoIds: [valid, randomUUID()] }), 422, "UNPROCESSABLE_ENTITY");
  });

  it("rejects borrowing more than available with 409", async () => {
    const item = await makeItem(3);
    const photo = await createPhoto(templeA, item.id);
    await expectErr(loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 5, borrowedAt: "2031-08-01", borrowPhotoId: photo }), 409, "CONFLICT");
  });

  it("returns fully: status returned, no shortage, availableQty restored", async () => {
    const item = await makeItem(4);
    const photo = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ข", quantity: 4, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    await expectErr(loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 4, returnedAt: "2031-08-05" } as never), 422, "UNPROCESSABLE_ENTITY");
    const returnPhoto = await createPhoto(templeA, item.id);
    const { loan: returned } = await loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 4, returnedAt: "2031-08-05", returnPhotoIds: [returnPhoto] });
    expect(returned.status).toBe("returned");
    expect(returned.returnPhotoIds).toEqual([returnPhoto]);
    expect(returned.shortageQty).toBe(0);
    expect(returned.settlement).toBeNull();
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(4);
    await expectErr(loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-06", returnPhotoIds: [returnPhoto] }), 409, "CONFLICT"); // double return
  });

  it("short return REQUIRES a settlement; records a cash settlement (จ่ายเงิน)", async () => {
    const item = await makeItem(5);
    const photo = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ค", quantity: 3, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    const returnPhoto = await createPhoto(templeA, item.id);
    await expectErr(loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-05", returnPhotoIds: [returnPhoto] }), 422, "UNPROCESSABLE_ENTITY");
    const { loan: settled } = await loans.returnLoan(actorA, templeA, ip, loan.id, {
      returnedQty: 1, returnedAt: "2031-08-05", returnPhotoIds: [returnPhoto],
      settlement: { settlementType: "cash", cashAmountSatang: 50000 },
    });
    expect(settled.shortageQty).toBe(2);
    expect(settled.settlement).toMatchObject({ settlementType: "cash", cashAmountSatang: "50000", shortageQty: 2 });
    expect(await auditCount(templeA, "item_loan:settle", loan.id)).toBe(1);
  });

  it("records a replacement settlement (ซื้อมาชดใช้)", async () => {
    const item = await makeItem(2);
    const photo = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ง", quantity: 2, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    const returnPhoto = await createPhoto(templeA, item.id);
    const { loan: settled } = await loans.returnLoan(actorA, templeA, ip, loan.id, {
      returnedQty: 0, returnedAt: "2031-08-05", returnPhotoIds: [returnPhoto],
      settlement: { settlementType: "replacement", replacementNote: "ซื้อเต็นท์ใหม่ 2 หลัง" },
    });
    expect(settled.settlement).toMatchObject({ settlementType: "replacement", replacementNote: "ซื้อเต็นท์ใหม่ 2 หลัง" });
    expect(settled.settlement?.cashAmountSatang).toBeNull();
  });

  it("binds borrow/return photos to the loan's item: a photo of another item is rejected (422)", async () => {
    const item = await makeItem(5);
    const other = await makeItem(5);
    // borrow: a photo owned by ANOTHER item cannot stand in as hand-over evidence
    const wrongBorrow = await createPhoto(templeA, other.id);
    await expectErr(
      loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: wrongBorrow }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // a correctly-bound borrow photo works
    const goodBorrow = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ข", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: goodBorrow });
    // return: same binding — a photo of another item is rejected
    const wrongReturn = await createPhoto(templeA, other.id);
    await expectErr(
      loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-05", returnPhotoIds: [wrongReturn] }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // a correctly-bound return photo succeeds and closes the loan
    const goodReturn = await createPhoto(templeA, item.id);
    const { loan: returned } = await loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-05", returnPhotoIds: [goodReturn] });
    expect(returned.status).toBe("returned");
    expect(returned.returnPhotoIds).toEqual([goodReturn]);
  });

  it("never exposes/affects another tenant's loans (RLS) and 404s malformed ids", async () => {
    const item = await makeItem(2);
    const photo = await createPhoto(templeA, item.id);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "จ", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    await expectErr(loans.getLoan(templeB, loan.id), 404, "NOT_FOUND");
    await expectErr(loans.returnLoan(actorB, templeB, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-05", returnPhotoIds: [photo] }), 404, "NOT_FOUND");
    await expectErr(loans.getItem(templeA, "not-a-uuid"), 404, "NOT_FOUND");
    expect(actorB.tenant_id).toBe(templeB);
  });

  it("allocates unique LOAN numbers under concurrent borrows", async () => {
    const item = await makeItem(10);
    const photos = await Promise.all([createPhoto(templeA, item.id), createPhoto(templeA, item.id), createPhoto(templeA, item.id)]);
    const results = await Promise.all(
      photos.map((p) => loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ฉ", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: p })),
    );
    const numbers = new Set(results.map((r) => r.loan.loanNo));
    expect(numbers.size).toBe(3);
  });

  // --- devotee borrow requests: staff approve / reject -------------------------

  it("approves a devotee request: requested -> borrowed, commits stock + photo, audits actor=user", async () => {
    const item = await makeItem(5);
    const dev = await registerDevotee();
    const requested = await loansSvc.createDevoteeLoanRequest(templeA, dev, { itemId: item.id, quantity: 2, borrowedAt: "2031-09-01" }, ip);
    expect(requested.status).toBe("requested");
    // A pending request commits no stock yet.
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(5);

    const photo = await createPhoto(templeA, item.id);
    const { loan } = await loans.approveLoan(actorA, templeA, ip, requested.id, { borrowPhotoIds: [photo] });
    expect(loan.status).toBe("borrowed");
    expect(loan.borrowPhotoId).toBe(photo);
    expect(loan.borrowPhotoIds).toEqual([photo]);
    // Stock is committed only on approval.
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(3);
    expect(await auditCount(templeA, "item_loan:approve", loan.id)).toBe(1);
    // The approve audit row is a USER actor (staff), not a devotee.
    const actorType = await psql(`SELECT actor_type FROM audit_logs WHERE action = 'item_loan:approve' AND entity_id = '${loan.id}'`);
    expect(actorType).toBe("user");

    // Re-approving an already-approved loan is rejected (409).
    await expectErr(loans.approveLoan(actorA, templeA, ip, requested.id, { borrowPhotoIds: [photo] }), 409, "CONFLICT");
  });

  it("approval requires a photo (422) and never commits stock without one", async () => {
    const item = await makeItem(3);
    const dev = await registerDevotee();
    const requested = await loansSvc.createDevoteeLoanRequest(templeA, dev, { itemId: item.id, quantity: 1, borrowedAt: "2031-09-02" }, ip);
    await expectErr(loans.approveLoan(actorA, templeA, ip, requested.id, { borrowPhotoIds: [] }), 422, "UNPROCESSABLE_ENTITY");
    await expectErr(loans.approveLoan(actorA, templeA, ip, requested.id, { borrowPhotoIds: [randomUUID()] }), 422, "UNPROCESSABLE_ENTITY");
    // Still requested, still no stock committed.
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(3);
    expect(await psql(`SELECT status FROM item_loans WHERE id = '${requested.id}'`)).toBe("requested");
  });

  it("blocks an approval that would oversell (409) and leaves the request pending", async () => {
    const item = await makeItem(2);
    const dev = await registerDevotee();
    // Request for the full 2 (soft check passes: available = 2).
    const requested = await loansSvc.createDevoteeLoanRequest(templeA, dev, { itemId: item.id, quantity: 2, borrowedAt: "2031-09-03" }, ip);
    // A staff borrow of 1 reduces availability to 1 before approval.
    const borrowPhoto = await createPhoto(templeA, item.id);
    await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "เจ้าหน้าที่", quantity: 1, borrowedAt: "2031-09-03", borrowPhotoId: borrowPhoto });
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(1);
    // Approving the request for 2 now oversells -> 409, request stays pending.
    const photo = await createPhoto(templeA, item.id);
    await expectErr(loans.approveLoan(actorA, templeA, ip, requested.id, { borrowPhotoIds: [photo] }), 409, "CONFLICT");
    expect(await psql(`SELECT status FROM item_loans WHERE id = '${requested.id}'`)).toBe("requested");
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(1);
  });

  it("rejects a devotee request: requested -> cancelled, no stock change, audits actor=user", async () => {
    const item = await makeItem(4);
    const dev = await registerDevotee();
    const requested = await loansSvc.createDevoteeLoanRequest(templeA, dev, { itemId: item.id, quantity: 2, borrowedAt: "2031-09-04" }, ip);
    const { loan } = await loans.rejectLoan(actorA, templeA, ip, requested.id, { reason: "สิ่งของไม่ว่างในช่วงนั้น" });
    expect(loan.status).toBe("cancelled");
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(4);
    expect(await auditCount(templeA, "item_loan:reject", loan.id)).toBe(1);
    const rejectRow = await psql(`SELECT actor_type || '|' || coalesce(reason,'NULL') FROM audit_logs WHERE action = 'item_loan:reject' AND entity_id = '${loan.id}'`);
    expect(rejectRow).toBe("user|สิ่งของไม่ว่างในช่วงนั้น");
    // A cancelled request cannot be approved afterwards.
    const photo = await createPhoto(templeA, item.id);
    await expectErr(loans.approveLoan(actorA, templeA, ip, requested.id, { borrowPhotoIds: [photo] }), 409, "CONFLICT");
  });

  it("never approves/rejects another tenant's request (RLS 404)", async () => {
    const item = await makeItem(3);
    const dev = await registerDevotee();
    const requested = await loansSvc.createDevoteeLoanRequest(templeA, dev, { itemId: item.id, quantity: 1, borrowedAt: "2031-09-05" }, ip);
    const photo = await createPhoto(templeA, item.id);
    await expectErr(loans.approveLoan(actorB, templeB, ip, requested.id, { borrowPhotoIds: [photo] }), 404, "NOT_FOUND");
    await expectErr(loans.rejectLoan(actorB, templeB, ip, requested.id, {}), 404, "NOT_FOUND");
  });

  it("guards roles: loan write + read = admin/finance/staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.createLoan)).toEqual(["admin", "finance", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.returnLoan)).toEqual(["admin", "finance", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.listLoans)).toEqual(["admin", "finance", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.approveLoan)).toEqual(["admin", "finance", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.rejectLoan)).toEqual(["admin", "finance", "staff"]);
  });

  it("restricts adding/editing borrowable items to the temple owner (admin) only", () => {
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.createItem)).toEqual(["admin"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.updateItem)).toEqual(["admin"]);
    // reading the item register stays open to all temple roles
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.listItems)).toEqual(["admin", "finance", "staff"]);
  });
});
