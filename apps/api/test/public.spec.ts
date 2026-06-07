import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PublicController } from "../src/public/public.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec", "-i",
      process.env.POSTGRES_CONTAINER ?? "wat-dev-db",
      "psql", "-U", process.env.POSTGRES_USER ?? "wat_dev",
      "-d", process.env.POSTGRES_DB ?? "wat_dev",
      "-At", "-c", sql,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout.trim();
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
async function returningId(sql: string): Promise<string> {
  return (await psql(sql)).split("\n")[0]?.trim() ?? "";
}
async function insertTemple(slug: string, nameTh: string, status: string): Promise<string> {
  return returningId(
    `INSERT INTO temples (slug, name_th, status) VALUES (${lit(slug)}, ${lit(nameTh)}, ${lit(status)}) RETURNING id`,
  );
}
async function insertCeremony(
  tenantId: string,
  opts: { status: string; isPublic: boolean; date: string; title: string },
): Promise<string> {
  return returningId(
    `INSERT INTO ceremonies (tenant_id, ceremony_type, status, title, ceremony_date, is_public, requester_name, requester_phone, note)
     VALUES (${lit(tenantId)}, 'merit', ${lit(opts.status)}, ${lit(opts.title)}, ${lit(opts.date)}, ${opts.isPublic}, ${lit("เจ้าภาพลับ")}, ${lit("0812345678")}, ${lit("โน้ตส่วนตัว")})
     RETURNING id`,
  );
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

const FUTURE = "2099-01-01";
const PAST = "2000-01-01";

describe("public (unauthenticated) directory + events", () => {
  let app: INestApplication;
  let publicCtrl: PublicController;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    publicCtrl = app.get(PublicController);
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists ACTIVE temples only, with no internal columns", async () => {
    const suspendedId = await insertTemple(`wat-susp-${randomUUID()}`, "วัดปิด", "suspended");
    const { temples } = await publicCtrl.temples();

    expect(temples.some((t) => t.id === templeA)).toBe(true);
    expect(temples.some((t) => t.id === suspendedId)).toBe(false);
    const sample = temples[0];
    expect(sample).toBeDefined();
    expect(sample).not.toHaveProperty("taxId");
    expect(sample).not.toHaveProperty("registrationNo");
    expect(sample).not.toHaveProperty("slug");
    expect(sample).not.toHaveProperty("receiptHeaderTh");
  });

  it("returns an active temple profile by id, 404 for inactive/unknown", async () => {
    const { temple } = await publicCtrl.temple(templeA);
    expect(temple.id).toBe(templeA);
    expect(temple).not.toHaveProperty("taxId");
    expect(temple).not.toHaveProperty("slug");

    const suspendedId = await insertTemple(`wat-susp-${randomUUID()}`, "วัดปิด", "suspended");
    await expectHttpError(publicCtrl.temple(suspendedId), 404);
    await expectHttpError(publicCtrl.temple(randomUUID()), 404);
  });

  it("returns ONLY published + confirmed + upcoming events, with NO requester PII", async () => {
    const tag = randomUUID().slice(0, 8);
    const shown = await insertCeremony(templeA, { status: "planned", isPublic: true, date: FUTURE, title: `แสดง-${tag}` });
    const past = await insertCeremony(templeA, { status: "planned", isPublic: true, date: PAST, title: `อดีต-${tag}` });
    const unconfirmed = await insertCeremony(templeA, { status: "requested", isPublic: true, date: FUTURE, title: `รอยืนยัน-${tag}` });
    const priv = await insertCeremony(templeA, { status: "planned", isPublic: false, date: FUTURE, title: `ส่วนตัว-${tag}` });
    const suspendedTemple = await insertTemple(`wat-susp-${randomUUID()}`, "วัดปิด", "suspended");
    const atSuspended = await insertCeremony(suspendedTemple, { status: "planned", isPublic: true, date: FUTURE, title: `วัดปิด-${tag}` });

    const { events } = await publicCtrl.events();
    const ids = events.map((e) => e.id);
    expect(ids).toContain(shown);
    expect(ids).not.toContain(past); // past
    expect(ids).not.toContain(unconfirmed); // not planned
    expect(ids).not.toContain(priv); // not public
    expect(ids).not.toContain(atSuspended); // temple not active

    // No requester PII or internal fields leak in the public shape.
    const ev = events.find((e) => e.id === shown);
    expect(ev).toBeDefined();
    expect(ev).not.toHaveProperty("requesterName");
    expect(ev).not.toHaveProperty("requesterPhone");
    expect(ev).not.toHaveProperty("note");
    expect(ev).not.toHaveProperty("assignedMonks");
    expect(ev).not.toHaveProperty("devoteeAccountId");
    expect(ev).not.toHaveProperty("monkCount");
    expect(ev?.templeNameTh).toBeTruthy();
  });

  it("narrows events by templeId (and never widens to other temples)", async () => {
    const tag = randomUUID().slice(0, 8);
    await insertCeremony(templeA, { status: "planned", isPublic: true, date: FUTURE, title: `เฉพาะวัด-${tag}` });

    const { events } = await publicCtrl.events(templeA);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((e) => e.templeId === templeA)).toBe(true);

    // A suspended temple yields nothing even when asked for explicitly.
    const suspendedTemple = await insertTemple(`wat-susp-${randomUUID()}`, "วัดปิด", "suspended");
    await insertCeremony(suspendedTemple, { status: "planned", isPublic: true, date: FUTURE, title: `ปิด-${tag}` });
    const { events: none } = await publicCtrl.events(suspendedTemple);
    expect(none.length).toBe(0);
  });
});
