import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { DonorsController } from "../src/donors/donors.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const devPassword = "Password123!";

interface TokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}

interface AuditRow {
  tenant_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: { displayName?: string } | null;
  after: { displayName?: string; phone?: string; tags?: string[] } | null;
  ip: string | null;
}

function decodeJwtPayload(token: string): TokenPayload {
  const payload = token.split(".")[1];

  if (!payload) {
    throw new Error("JWT payload segment is missing");
  }

  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
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

async function expectProjectHttpError(
  promise: Promise<unknown>,
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

describe("donor registry", () => {
  let app: INestApplication;
  let authService: AuthService;
  let donorsController: DonorsController;
  let actor: TokenPayload;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    donorsController = app.get(DonorsController);
    actor = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates donors, searches by name/phone/tag, and stores normalized Thai-first fields", async () => {
    const marker = `donor-${randomUUID()}`;

    const created = await donorsController.create(actor, templeA, "127.0.0.1", {
      displayName: ` คุณสมชาย ${marker} `,
      legalName: "สมชาย ใจดี",
      phone: " 0812345678 ",
      lineId: "somchai-line",
      email: "somchai@example.test",
      address: "กรุงเทพฯ",
      tags: ["เจ้าภาพ", "รายเดือน", "เจ้าภาพ"],
      notes: "ผู้บริจาคประจำ",
      consent: true,
    });

    expect(created.donor).toMatchObject({
      displayName: `คุณสมชาย ${marker}`,
      legalName: "สมชาย ใจดี",
      phone: "0812345678",
      lineId: "somchai-line",
      email: "somchai@example.test",
      tags: ["เจ้าภาพ", "รายเดือน"],
      consent: true,
    });

    await expect(donorsController.list(templeA, { q: marker })).resolves.toMatchObject({
      donors: expect.arrayContaining([expect.objectContaining({ id: created.donor.id })]),
    });
    await expect(donorsController.list(templeA, { q: "0812345678" })).resolves.toMatchObject({
      donors: expect.arrayContaining([expect.objectContaining({ id: created.donor.id })]),
    });
    await expect(donorsController.list(templeA, { tag: "รายเดือน" })).resolves.toMatchObject({
      donors: expect.arrayContaining([expect.objectContaining({ id: created.donor.id })]),
    });
  });

  it("returns 422 validation errors for invalid create and update inputs", async () => {
    await expectProjectHttpError(
      donorsController.create(actor, templeA, "127.0.0.1", { displayName: "", email: "not-email" }),
      422,
      "UNPROCESSABLE_ENTITY",
    );

    await expectProjectHttpError(
      donorsController.update(actor, templeA, "127.0.0.1", "00000000-0000-4000-8000-000000000000", {}),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("does not leak donors across tenants", async () => {
    const marker = `isolated-${randomUUID()}`;
    const created = await donorsController.create(actor, templeA, "127.0.0.1", {
      displayName: marker,
      phone: "0999999999",
      tags: ["isolation"],
    });

    const tenantBSearch = await donorsController.list(templeB, { q: marker });
    expect(tenantBSearch.donors).toHaveLength(0);

    await expectProjectHttpError(donorsController.getOne(templeB, created.donor.id), 404, "NOT_FOUND");
  });

  it("writes donor:create and donor:update audit rows with before/after snapshots", async () => {
    const marker = `audit-${randomUUID()}`;
    const created = await donorsController.create(actor, templeA, "127.0.0.1", {
      displayName: marker,
      phone: "0800000000",
      tags: ["audit"],
    });

    const updated = await donorsController.update(actor, templeA, "127.0.0.2", created.donor.id, {
      displayName: `${marker}-updated`,
      phone: "0800000001",
    });

    expect(updated.donor).toMatchObject({
      id: created.donor.id,
      displayName: `${marker}-updated`,
      phone: "0800000001",
    });

    const rows = await psqlJson<AuditRow>(`
      SELECT tenant_id, actor_user_id, action, entity_type, entity_id, "before", "after", ip
      FROM audit_logs
      WHERE tenant_id = '${templeA}' AND entity_id = '${created.donor.id}'
      ORDER BY created_at ASC
    `);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      tenant_id: templeA,
      actor_user_id: actor.sub,
      action: "donor:create",
      entity_type: "donor",
      entity_id: created.donor.id,
      before: null,
      after: { displayName: marker, phone: "0800000000", tags: ["audit"] },
      ip: "127.0.0.1",
    });
    expect(rows[1]).toMatchObject({
      tenant_id: templeA,
      actor_user_id: actor.sub,
      action: "donor:update",
      entity_type: "donor",
      entity_id: created.donor.id,
      before: { displayName: marker, phone: "0800000000" },
      after: { displayName: `${marker}-updated`, phone: "0800000001" },
      ip: "127.0.0.2",
    });
  });
});
