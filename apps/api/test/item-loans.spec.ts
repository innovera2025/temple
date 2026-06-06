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
import { ItemLoansController } from "../src/item-loans/item-loans.controller";

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

/** Insert an attachment row directly (simulating an already-uploaded borrow photo). */
async function createPhoto(tenantId: string): Promise<string> {
  return psql(
    `INSERT INTO attachments (tenant_id, owner_type, owner_id, file_name, mime_type, storage_key, byte_size, data)
     VALUES ('${tenantId}', 'item_loan', '${randomUUID()}', 'borrow.jpg', 'image/jpeg', '${randomUUID()}', 3, '\\x010203')
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
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    auth = app.get(AuthService);
    loans = app.get(ItemLoansController);
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

  it("records a borrow (LOAN number, photo, audit) and decrements availableQty; lists who borrowed", async () => {
    const item = await makeItem(5);
    const photo = await createPhoto(templeA);
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
    const p1 = await createPhoto(templeA);
    const p2 = await createPhoto(templeA);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "คุณมานี", quantity: 1, borrowedAt: "2031-08-02", borrowPhotoIds: [p1, p2] });
    expect(loan.borrowPhotoIds).toEqual([p1, p2]);
    expect(loan.borrowPhotoId).toBe(p1);
    const { loans: list } = await loans.listLoans(templeA, { itemId: item.id });
    expect(list.find((l) => l.id === loan.id)?.borrowPhotoIds).toEqual([p1, p2]);
  });

  it("rejects a borrow photo id that does not belong to the tenant", async () => {
    const item = await makeItem(5);
    const valid = await createPhoto(templeA);
    await expectErr(loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoIds: [valid, randomUUID()] }), 422, "UNPROCESSABLE_ENTITY");
  });

  it("rejects borrowing more than available with 409", async () => {
    const item = await makeItem(3);
    const photo = await createPhoto(templeA);
    await expectErr(loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ก", quantity: 5, borrowedAt: "2031-08-01", borrowPhotoId: photo }), 409, "CONFLICT");
  });

  it("returns fully: status returned, no shortage, availableQty restored", async () => {
    const item = await makeItem(4);
    const photo = await createPhoto(templeA);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ข", quantity: 4, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    const { loan: returned } = await loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 4, returnedAt: "2031-08-05" });
    expect(returned.status).toBe("returned");
    expect(returned.shortageQty).toBe(0);
    expect(returned.settlement).toBeNull();
    expect((await loans.getItem(templeA, item.id)).item.availableQty).toBe(4);
    await expectErr(loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-06" }), 409, "CONFLICT"); // double return
  });

  it("short return REQUIRES a settlement; records a cash settlement (จ่ายเงิน)", async () => {
    const item = await makeItem(5);
    const photo = await createPhoto(templeA);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ค", quantity: 3, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    await expectErr(loans.returnLoan(actorA, templeA, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-05" }), 422, "UNPROCESSABLE_ENTITY");
    const { loan: settled } = await loans.returnLoan(actorA, templeA, ip, loan.id, {
      returnedQty: 1, returnedAt: "2031-08-05",
      settlement: { settlementType: "cash", cashAmountSatang: 50000 },
    });
    expect(settled.shortageQty).toBe(2);
    expect(settled.settlement).toMatchObject({ settlementType: "cash", cashAmountSatang: "50000", shortageQty: 2 });
    expect(await auditCount(templeA, "item_loan:settle", loan.id)).toBe(1);
  });

  it("records a replacement settlement (ซื้อมาชดใช้)", async () => {
    const item = await makeItem(2);
    const photo = await createPhoto(templeA);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ง", quantity: 2, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    const { loan: settled } = await loans.returnLoan(actorA, templeA, ip, loan.id, {
      returnedQty: 0, returnedAt: "2031-08-05",
      settlement: { settlementType: "replacement", replacementNote: "ซื้อเต็นท์ใหม่ 2 หลัง" },
    });
    expect(settled.settlement).toMatchObject({ settlementType: "replacement", replacementNote: "ซื้อเต็นท์ใหม่ 2 หลัง" });
    expect(settled.settlement?.cashAmountSatang).toBeNull();
  });

  it("never exposes/affects another tenant's loans (RLS) and 404s malformed ids", async () => {
    const item = await makeItem(2);
    const photo = await createPhoto(templeA);
    const { loan } = await loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "จ", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: photo });
    await expectErr(loans.getLoan(templeB, loan.id), 404, "NOT_FOUND");
    await expectErr(loans.returnLoan(actorB, templeB, ip, loan.id, { returnedQty: 1, returnedAt: "2031-08-05" }), 404, "NOT_FOUND");
    await expectErr(loans.getItem(templeA, "not-a-uuid"), 404, "NOT_FOUND");
    expect(actorB.tenant_id).toBe(templeB);
  });

  it("allocates unique LOAN numbers under concurrent borrows", async () => {
    const item = await makeItem(10);
    const photos = await Promise.all([createPhoto(templeA), createPhoto(templeA), createPhoto(templeA)]);
    const results = await Promise.all(
      photos.map((p) => loans.createLoan(actorA, templeA, ip, { itemId: item.id, borrowerName: "ฉ", quantity: 1, borrowedAt: "2031-08-01", borrowPhotoId: p })),
    );
    const numbers = new Set(results.map((r) => r.loan.loanNo));
    expect(numbers.size).toBe(3);
  });

  it("guards roles: loan write + read = admin/finance/staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.createLoan)).toEqual(["admin", "finance", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.returnLoan)).toEqual(["admin", "finance", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.listLoans)).toEqual(["admin", "finance", "staff"]);
  });

  it("restricts adding/editing borrowable items to the temple owner (admin) only", () => {
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.createItem)).toEqual(["admin"]);
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.updateItem)).toEqual(["admin"]);
    // reading the item register stays open to all temple roles
    expect(reflector.get<string[]>(ROLES_KEY, ItemLoansController.prototype.listItems)).toEqual(["admin", "finance", "staff"]);
  });
});
