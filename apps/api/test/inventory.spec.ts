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
import { InventoryController } from "../src/inventory/inventory.controller";

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

async function inventoryAuditCount(tenantId: string, action: string, entityId: string): Promise<number> {
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

describe("inventory (คลังของบริจาค/พัสดุ)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let inventory: InventoryController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let financeToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    inventory = app.get(InventoryController);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    financeToken = (await authService.login({ email: financeEmail, password: devPassword })).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates an item at quantity 0 (quantity is not settable), audited; receive/issue update the balance", async () => {
    const name = `สังฆทาน-${randomUUID().slice(0, 8)}`;
    const { item: created } = await inventory.createItem(actorA, templeA, ip, {
      name,
      category: "sangha_offering",
      unit: "ชุด",
      // attempt to set quantity directly is ignored/rejected; balance must start at 0
    });
    expect(created.quantity).toBe(0);
    expect(await inventoryAuditCount(templeA, "inventory:item:create", created.id)).toBe(1);

    const { item: afterReceive } = await inventory.recordMovement(actorA, templeA, ip, created.id, {
      movementType: "receive",
      quantity: 12,
      movementDate: "2031-08-01",
      reason: "รับบริจาค",
    });
    expect(afterReceive.quantity).toBe(12);

    const { movement, item: afterIssue } = await inventory.recordMovement(actorA, templeA, ip, created.id, {
      movementType: "issue",
      quantity: 5,
      movementDate: "2031-08-02",
      reason: "เบิกใช้งานบุญ",
    });
    expect(afterIssue.quantity).toBe(7);
    expect(movement.balanceAfter).toBe(7);
    expect(await inventoryAuditCount(templeA, "inventory:movement:create", movement.id)).toBe(1);

    const { movements } = await inventory.listMovements(templeA, created.id);
    expect(movements).toHaveLength(2);
  });

  it("rejects setting quantity directly on an item (mass-assignment) with 422", async () => {
    await expectProjectHttpError(
      inventory.createItem(actorA, templeA, ip, { name: "x", quantity: 50 }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("rejects issuing more than on hand with 409 (no negative balance)", async () => {
    const { item } = await inventory.createItem(actorA, templeA, ip, { name: `neg-${randomUUID().slice(0, 8)}` });
    await inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "receive", quantity: 3, movementDate: "2031-08-01" });
    await expectProjectHttpError(
      inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "issue", quantity: 5, movementDate: "2031-08-02" }),
      409,
      "CONFLICT",
    );
    expect((await inventory.getItem(templeA, item.id)).item.quantity).toBe(3);
  });

  it("serializes concurrent issues so stock is never oversold (FOR UPDATE lock)", async () => {
    const { item } = await inventory.createItem(actorA, templeA, ip, { name: `concur-${randomUUID().slice(0, 8)}` });
    await inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "receive", quantity: 10, movementDate: "2031-08-01" });

    // four concurrent issues of 3 (12 > 10): exactly three succeed, one fails, balance ends at 1
    const results = await Promise.allSettled(
      [3, 3, 3, 3].map(() =>
        inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "issue", quantity: 3, movementDate: "2031-08-03" }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    expect(ok).toBe(3);
    expect(failed).toBe(1);
    expect((await inventory.getItem(templeA, item.id)).item.quantity).toBe(1);
  });

  it("blocks stock movement on an archived (inactive) item with 409", async () => {
    const { item } = await inventory.createItem(actorA, templeA, ip, { name: `arch-${randomUUID().slice(0, 8)}` });
    await inventory.updateItem(actorA, templeA, ip, item.id, { status: "inactive" });
    await expectProjectHttpError(
      inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "receive", quantity: 1, movementDate: "2031-08-01" }),
      409,
      "CONFLICT",
    );
    expect(await inventoryAuditCount(templeA, "inventory:item:update", item.id)).toBe(1);
  });

  it("rejects invalid input with 422", async () => {
    await expectProjectHttpError(inventory.createItem(actorA, templeA, ip, {}), 422, "UNPROCESSABLE_ENTITY");
    const { item } = await inventory.createItem(actorA, templeA, ip, { name: `val-${randomUUID().slice(0, 8)}` });
    await expectProjectHttpError(
      inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "donate", quantity: 1, movementDate: "2031-08-01" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "receive", quantity: 0, movementDate: "2031-08-01" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    await expectProjectHttpError(
      inventory.recordMovement(actorA, templeA, ip, item.id, { movementType: "receive", quantity: 2, movementDate: "2031-13-40" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("returns 404 for a malformed or cross-tenant id (never a raw 500)", async () => {
    await expectProjectHttpError(inventory.getItem(templeA, "not-a-uuid"), 404, "NOT_FOUND");
    await expectProjectHttpError(inventory.getItem(templeA, randomUUID()), 404, "NOT_FOUND");
    await expectProjectHttpError(
      inventory.recordMovement(actorA, templeA, ip, randomUUID(), { movementType: "receive", quantity: 1, movementDate: "2031-08-01" }),
      404,
      "NOT_FOUND",
    );
  });

  it("never exposes another tenant's inventory (RLS isolation)", async () => {
    const { item } = await inventory.createItem(actorA, templeA, ip, { name: `iso-${randomUUID().slice(0, 8)}` });
    await expectProjectHttpError(inventory.getItem(templeB, item.id), 404, "NOT_FOUND");
    await expectProjectHttpError(
      inventory.recordMovement(actorB, templeB, ip, item.id, { movementType: "receive", quantity: 1, movementDate: "2031-08-01" }),
      404,
      "NOT_FOUND",
    );
    const { items } = await inventory.listItems(templeB, {});
    expect(items.some((i) => i.id === item.id)).toBe(false);
    expect(actorB.tenant_id).toBe(templeB);
  });

  it("creates a storage room, lists it with itemCount, and rejects a duplicate name (409)", async () => {
    const name = `โรงเก็บ-${randomUUID().slice(0, 8)}`;
    const { room } = await inventory.createRoom(actorA, templeA, ip, { name, note: "ของหนัก" });
    expect(room.itemCount).toBe(0);
    const { rooms } = await inventory.listRooms(templeA);
    expect(rooms.some((r) => r.id === room.id && r.name === name)).toBe(true);
    await expectProjectHttpError(inventory.createRoom(actorA, templeA, ip, { name }), 409, "CONFLICT");
  });

  it("assigns a room to an item; a non-existent/cross-tenant room is 422, not 500", async () => {
    const { room } = await inventory.createRoom(actorA, templeA, ip, { name: `ห้อง-${randomUUID().slice(0, 8)}` });
    const { item } = await inventory.createItem(actorA, templeA, ip, { name: `กับร่ม-${randomUUID().slice(0, 8)}`, roomId: room.id });
    expect(item.roomId).toBe(room.id);
    await expectProjectHttpError(
      inventory.createItem(actorA, templeA, ip, { name: "x", roomId: randomUUID() }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("imports items from Excel rows: creates rooms by name, items, and a receive movement for qty", async () => {
    const roomName = `คลังนำเข้า-${randomUUID().slice(0, 8)}`;
    const a = `นำเข้า-A-${randomUUID().slice(0, 8)}`;
    const b = `นำเข้า-B-${randomUUID().slice(0, 8)}`;
    const result = await inventory.importItems(actorA, templeA, ip, {
      rows: [
        { name: a, category: "equipment", quantity: 12, unit: "ตัว", roomName },
        { name: b, category: "พัสดุ/วัสดุสิ้นเปลือง", roomName },
      ],
    });
    expect(result).toMatchObject({ itemsCreated: 2, roomsCreated: 1 });

    const { items } = await inventory.listItems(templeA, { q: a });
    const created = items.find((i) => i.name === a);
    expect(created?.quantity).toBe(12); // backed by a receive movement
    expect(created?.roomId).toBeTruthy();
    const { rooms } = await inventory.listRooms(templeA);
    expect(rooms.find((r) => r.name === roomName)?.itemCount).toBe(2);
  });

  it("rejects an invalid import payload (bad row) with 422", async () => {
    await expectProjectHttpError(
      inventory.importItems(actorA, templeA, ip, { rows: [{ name: "" }, { name: "ok", quantity: -5 }] }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("never imports into another tenant (RLS): rooms created are tenant-scoped", async () => {
    const name = `iso-room-${randomUUID().slice(0, 8)}`;
    await inventory.importItems(actorA, templeA, ip, { rows: [{ name: `iso-item-${randomUUID().slice(0, 8)}`, roomName: name }] });
    const { rooms } = await inventory.listRooms(templeB);
    expect(rooms.some((r) => r.name === name)).toBe(false);
  });

  it("restricts writes to admin/staff (finance rejected); reads allow admin/finance/staff", () => {
    expect(reflector.get<string[]>(ROLES_KEY, InventoryController.prototype.createItem)).toEqual(["admin", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, InventoryController.prototype.recordMovement)).toEqual(["admin", "staff"]);
    expect(reflector.get<string[]>(ROLES_KEY, InventoryController.prototype.listItems)).toEqual([
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
      getClass: () => InventoryController,
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
