import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { CeremoniesController } from "../src/ceremonies/ceremonies.controller";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const devPassword = "Password123!";
const ip = "127.0.0.1";

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

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec", "-i", process.env.POSTGRES_CONTAINER ?? "wat-dev-db",
      "psql", "-U", process.env.POSTGRES_USER ?? "wat_dev", "-d", process.env.POSTGRES_DB ?? "wat_dev",
      "-v", "ON_ERROR_STOP=1", "-q", "-At", "-c", sql,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return stdout.trim();
}

async function insertMonk(tenantId: string, name: string, type = "monk", status = "active"): Promise<string> {
  return psql(
    `INSERT INTO personnel (tenant_id, personnel_type, status, display_name) VALUES ('${tenantId}', '${type}', '${status}', '${name}') RETURNING id`,
  );
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

describe("hall booking (จองศาลา) + monk invitations (นิมนต์พระ)", () => {
  let app: INestApplication;
  let ceremonies: CeremoniesController;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let hallId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const authService = app.get(AuthService);
    ceremonies = app.get(CeremoniesController);
    reflector = app.get(Reflector);
    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);

    const { hall } = await ceremonies.createHall(actorA, templeA, ip, {
      name: `ศาลาทดสอบ-${randomUUID().slice(0, 8)}`,
      capacity: 80,
    });
    hallId = hall.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("manages the hall registry: create (audited), duplicate name 409, rename, deactivate blocks booking", async () => {
    const name = `ศาลาA-${randomUUID().slice(0, 8)}`;
    const { hall } = await ceremonies.createHall(actorA, templeA, ip, { name, capacity: 40 });
    expect(hall.isActive).toBe(true);
    expect(Number(await psql(`SELECT count(*) FROM audit_logs WHERE action = 'hall:create' AND entity_id = '${hall.id}'`))).toBe(1);

    await expectProjectHttpError(ceremonies.createHall(actorA, templeA, ip, { name }), 409, "CONFLICT");

    const { hall: renamed } = await ceremonies.updateHall(actorA, templeA, ip, hall.id, { name: `${name}-ใหม่`, isActive: false });
    expect(renamed.isActive).toBe(false);

    // booking a deactivated hall -> 422
    await expectProjectHttpError(
      ceremonies.create(actorA, templeA, ip, {
        ceremonyType: "merit", title: "งานทดสอบศาลาปิด", ceremonyDate: "2031-01-10", hallId: hall.id,
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("blocks double-booking: same hall + same date -> 409 naming the clash; freed after cancel; visible in bookings", async () => {
    const date = "2031-02-14";
    const { ceremony: first } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit", title: "งานบุญเช้า", ceremonyDate: date, hallId,
    });
    expect(first.hallId).toBe(hallId);

    await expectProjectHttpError(
      ceremonies.create(actorA, templeA, ip, {
        ceremonyType: "funeral", title: "งานซ้อน", ceremonyDate: date, hallId,
      }),
      409,
      "CONFLICT",
    );

    // availability view shows the booking
    const { bookings } = await ceremonies.hallBookings(templeA, hallId, date, date);
    expect(bookings.map((b) => b.ceremonyId)).toContain(first.id);

    // cancelling frees the slot
    await ceremonies.update(actorA, templeA, ip, first.id, { status: "cancelled" });
    const { ceremony: second } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "funeral", title: "งานหลังยกเลิก", ceremonyDate: date, hallId,
    });
    expect(second.hallId).toBe(hallId);

    // moving a booked ceremony onto an occupied date -> 409
    const { ceremony: other } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit", title: "งานอีกวัน", ceremonyDate: "2031-02-15", hallId,
    });
    await expectProjectHttpError(
      ceremonies.update(actorA, templeA, ip, other.id, { ceremonyDate: date }),
      409,
      "CONFLICT",
    );
  });

  it("serializes concurrent bookings of the same hall+date so only one wins (no double-book race)", async () => {
    const date = "2031-07-07";
    // Fired together: without the per-tenant advisory lock both check-then-insert
    // races would pass the clash check and double-book. The lock must serialize
    // them -> exactly one succeeds, the other gets a clean 409 (never a 500).
    const results = await Promise.allSettled([
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "merit", title: "ชนกันA", ceremonyDate: date, hallId }),
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "merit", title: "ชนกันB", ceremonyDate: date, hallId }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason as HttpException;
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(409);
    // and the DB really holds just one active booking for that slot
    const active = Number(
      await psql(
        `SELECT count(*) FROM ceremonies WHERE tenant_id = '${templeA}' AND hall_id = '${hallId}' AND ceremony_date = '${date}' AND status IN ('planned','requested')`,
      ),
    );
    expect(active).toBe(1);
  });

  it("serializes concurrent bookings of the same monk+date so only one wins (no double-book race)", async () => {
    const monk = await insertMonk(templeA, `พระชนกัน-${randomUUID().slice(0, 6)}`);
    const date = "2031-07-09";
    const results = await Promise.allSettled([
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "merit", title: "พระชนA", ceremonyDate: date, monkPersonnelIds: [monk] }),
      ceremonies.create(actorA, templeA, ip, { ceremonyType: "merit", title: "พระชนB", ceremonyDate: date, monkPersonnelIds: [monk] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(((rejected[0] as PromiseRejectedResult).reason as HttpException).getStatus()).toBe(409);
    // exactly one active invitation for that monk on that date
    const rows = Number(
      await psql(
        `SELECT count(*) FROM ceremony_monks cm JOIN ceremonies c ON c.id = cm.ceremony_id WHERE cm.tenant_id = '${templeA}' AND cm.personnel_id = '${monk}' AND c.ceremony_date = '${date}' AND c.status IN ('planned','requested')`,
      ),
    );
    expect(rows).toBe(1);
  });

  it("links invited monks from the personnel registry, syncs monkCount, and reads them back", async () => {
    const monk1 = await insertMonk(templeA, `พระทดสอบหนึ่ง-${randomUUID().slice(0, 6)}`);
    const monk2 = await insertMonk(templeA, `พระทดสอบสอง-${randomUUID().slice(0, 6)}`);

    const { ceremony } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit", title: "งานนิมนต์", ceremonyDate: "2031-03-01",
      monkPersonnelIds: [monk1, monk2],
    });
    expect(ceremony.monkCount).toBe(2);

    const detail = await ceremonies.get(templeA, ceremony.id);
    expect(detail.invitedMonks.map((m) => m.personnelId).sort()).toEqual([monk1, monk2].sort());

    // replace the set -> count follows
    const { ceremony: updated } = await ceremonies.update(actorA, templeA, ip, ceremony.id, {
      monkPersonnelIds: [monk1],
    });
    expect(updated.monkCount).toBe(1);
    const after = await ceremonies.get(templeA, ceremony.id);
    expect(after.invitedMonks.map((m) => m.personnelId)).toEqual([monk1]);
  });

  it("rejects invalid invitations: non-monk personnel, inactive monk, unknown id, cross-tenant id", async () => {
    const layStaff = await insertMonk(templeA, `เจ้าหน้าที่-${randomUUID().slice(0, 6)}`, "staff");
    const exMonk = await insertMonk(templeA, `อดีตพระ-${randomUUID().slice(0, 6)}`, "monk", "inactive");
    const monkOfB = await insertMonk(templeB, `พระวัดอื่น-${randomUUID().slice(0, 6)}`);

    const base = { ceremonyType: "merit" as const, title: "งานตรวจ", ceremonyDate: "2031-03-02" };
    for (const bad of [layStaff, exMonk, monkOfB, randomUUID()]) {
      await expectProjectHttpError(
        ceremonies.create(actorA, templeA, ip, { ...base, monkPersonnelIds: [bad] }),
        422,
        "UNPROCESSABLE_ENTITY",
      );
    }
  });

  it("blocks a monk being booked into two active ceremonies on the same date (ตารางพระชน)", async () => {
    const monk = await insertMonk(templeA, `พระตารางแน่น-${randomUUID().slice(0, 6)}`);
    const date = "2031-04-04";
    await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit", title: "งานแรกของพระ", ceremonyDate: date, monkPersonnelIds: [monk],
    });
    await expectProjectHttpError(
      ceremonies.create(actorA, templeA, ip, {
        ceremonyType: "funeral", title: "งานที่สองวันเดียวกัน", ceremonyDate: date, monkPersonnelIds: [monk],
      }),
      409,
      "CONFLICT",
    );
    // a different date is fine
    const { ceremony } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "funeral", title: "งานวันถัดไป", ceremonyDate: "2031-04-05", monkPersonnelIds: [monk],
    });
    // ...but MOVING it onto the clash date re-checks the monk's schedule
    await expectProjectHttpError(
      ceremonies.update(actorA, templeA, ip, ceremony.id, { ceremonyDate: date }),
      409,
      "CONFLICT",
    );
  });

  it("re-activating a cancelled ceremony re-checks the monk schedule (ตารางพระชน on re-activate)", async () => {
    const monk = await insertMonk(templeA, `พระคืนชีพ-${randomUUID().slice(0, 6)}`);
    const date = "2031-06-06";
    const { ceremony: first } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit", title: "งานเดิมของพระ", ceremonyDate: date, monkPersonnelIds: [monk],
    });
    // Cancel frees the monk; another ceremony then grabs them on that same date.
    await ceremonies.update(actorA, templeA, ip, first.id, { status: "cancelled" });
    await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "funeral", title: "งานแทนที่", ceremonyDate: date, monkPersonnelIds: [monk],
    });
    // Re-activating the first (status-only, no date/monk change) must NOT blindly
    // restore the booking — the monk is now taken, so it has to re-check -> 409.
    await expectProjectHttpError(
      ceremonies.update(actorA, templeA, ip, first.id, { status: "planned" }),
      409,
      "CONFLICT",
    );
  });

  it("changing invited monks while cancelled persists the new set; re-activate re-checks THAT set", async () => {
    const monkA = await insertMonk(templeA, `พระเอ-${randomUUID().slice(0, 6)}`);
    const monkB = await insertMonk(templeA, `พระบี-${randomUUID().slice(0, 6)}`);
    const date = "2031-06-07";
    const { ceremony: first } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit", title: "งานสลับพระ", ceremonyDate: date, monkPersonnelIds: [monkA],
    });
    await ceremonies.update(actorA, templeA, ip, first.id, { status: "cancelled" });

    // Swap the monk set while cancelled — must persist (validated), no clash check.
    const { ceremony: swapped } = await ceremonies.update(actorA, templeA, ip, first.id, { monkPersonnelIds: [monkB] });
    expect(swapped.monkCount).toBe(1);
    const detail = await ceremonies.get(templeA, first.id);
    expect(detail.invitedMonks.map((m) => m.personnelId)).toEqual([monkB]); // join table = new set, not [monkA]

    // Another ceremony now grabs monkB (the NEW set) on that date.
    await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "funeral", title: "งานยึดพระบี", ceremonyDate: date, monkPersonnelIds: [monkB],
    });
    // Re-activate must re-check the NEW set (monkB) -> 409. (Pre-fix it would have
    // re-checked the stale [monkA] from the join table and wrongly passed.)
    await expectProjectHttpError(
      ceremonies.update(actorA, templeA, ip, first.id, { status: "planned" }),
      409,
      "CONFLICT",
    );
  });

  it("re-activating a cancelled ceremony re-checks the HALL too (จองศาลา on re-activate)", async () => {
    const date = "2031-06-08";
    const { ceremony: first } = await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "merit", title: "งานจองศาลาเดิม", ceremonyDate: date, hallId,
    });
    await ceremonies.update(actorA, templeA, ip, first.id, { status: "cancelled" });
    await ceremonies.create(actorA, templeA, ip, {
      ceremonyType: "funeral", title: "งานยึดศาลา", ceremonyDate: date, hallId,
    });
    // Re-activating the first must re-check the hall (now taken) -> 409, mirroring
    // the monk re-check; locks down the symmetric hall path the F4 fix relies on.
    await expectProjectHttpError(
      ceremonies.update(actorA, templeA, ip, first.id, { status: "planned" }),
      409,
      "CONFLICT",
    );
  });

  it("keeps halls tenant-scoped: temple B cannot see or book temple A's hall", async () => {
    const { halls } = await ceremonies.listHalls(templeB);
    expect(halls.some((h) => h.id === hallId)).toBe(false);
    await expectProjectHttpError(
      ceremonies.create(actorB, templeB, ip, {
        ceremonyType: "merit", title: "งานข้ามวัด", ceremonyDate: "2031-05-05", hallId,
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("restricts hall management to admin; reads allow all tenant roles", () => {
    expect(reflector.get<string[]>(ROLES_KEY, CeremoniesController.prototype.createHall)).toEqual(["admin"]);
    expect(reflector.get<string[]>(ROLES_KEY, CeremoniesController.prototype.updateHall)).toEqual(["admin"]);
    expect(reflector.get<string[]>(ROLES_KEY, CeremoniesController.prototype.listHalls)).toEqual([
      "admin", "finance", "staff",
    ]);
    expect(reflector.get<string[]>(ROLES_KEY, CeremoniesController.prototype.hallBookings)).toEqual([
      "admin", "finance", "staff",
    ]);
  });
});
