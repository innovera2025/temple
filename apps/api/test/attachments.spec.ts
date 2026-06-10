import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { HttpException, INestApplication } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AttachmentsController } from "../src/attachments/attachments.controller";
import { AttachmentsService } from "../src/attachments/attachments.service";
import { AuthService } from "../src/auth/auth.service";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { DonationsController } from "../src/donations/donations.controller";
import { DonorsController } from "../src/donors/donors.controller";
import { ItemLoansController } from "../src/item-loans/item-loans.controller";

const execFileAsync = promisify(execFile);
const templeA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const templeB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const adminEmail = "admin@wat-arun.example";
const adminEmailB = "admin@wat-pho.example";
const staffEmail = "staff@wat-arun.example";
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

async function attachmentAuditCount(tenantId: string, action: string, entityId: string): Promise<number> {
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
const fileBytes = "หลักฐานการโอนเงิน 12345 — slip";
const contentBase64 = Buffer.from(fileBytes, "utf8").toString("base64");

describe("attachments (แนบหลักฐาน)", () => {
  let app: INestApplication;
  let authService: AuthService;
  let donors: DonorsController;
  let donations: DonationsController;
  let loans: ItemLoansController;
  let attachments: AttachmentsController;
  let attachmentsService: AttachmentsService;
  let reflector: Reflector;
  let actorA: TokenPayload;
  let actorB: TokenPayload;
  let actorStaff: TokenPayload;
  let donorAId: string;
  let itemAId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    authService = app.get(AuthService);
    donors = app.get(DonorsController);
    donations = app.get(DonationsController);
    loans = app.get(ItemLoansController);
    attachments = app.get(AttachmentsController);
    attachmentsService = app.get(AttachmentsService);
    reflector = app.get(Reflector);

    actorA = decodeJwtPayload((await authService.login({ email: adminEmail, password: devPassword })).accessToken);
    actorB = decodeJwtPayload((await authService.login({ email: adminEmailB, password: devPassword })).accessToken);
    actorStaff = decodeJwtPayload((await authService.login({ email: staffEmail, password: devPassword })).accessToken);

    const { donor } = await donors.create(actorA, templeA, ip, { displayName: `ผู้บริจาคแนบ-${randomUUID().slice(0, 8)}` });
    donorAId = donor.id;
    const { item } = await loans.createItem(actorA, templeA, ip, { name: `เต็นท์แนบ-${randomUUID().slice(0, 8)}`, category: "equipment", unit: "หลัง", totalQty: 5 });
    itemAId = item.id;
  });

  afterAll(async () => {
    // Clean up this spec's uploads so they don't accumulate toward the per-tenant cap.
    await execFileAsync(
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
        "-c",
        `DELETE FROM attachments WHERE tenant_id = '${templeA}'`,
      ],
      { maxBuffer: 1024 * 1024 },
    ).catch(() => undefined);
    await app.close();
  });

  it("uploads (audited, no blob/leak in metadata), lists, and round-trips the bytes on download", async () => {
    const { attachment } = await attachments.upload(actorA, templeA, ip, {
      ownerType: "donor",
      ownerId: donorAId,
      fileName: "slip.png",
      mimeType: "image/png",
      contentBase64,
    });
    expect(attachment.ownerId).toBe(donorAId);
    expect(attachment.byteSize).toBe(String(Buffer.byteLength(fileBytes, "utf8")));
    expect("data" in (attachment as unknown as Record<string, unknown>)).toBe(false);
    expect(await attachmentAuditCount(templeA, "attachment:create", attachment.id)).toBe(1);

    const { attachments: list } = await attachments.list(templeA, "donor", donorAId);
    expect(list.some((a) => a.id === attachment.id)).toBe(true);

    // the stored bytes come back exactly (DB round-trip)
    const download = await attachmentsService.download(templeA, attachment.id);
    expect(download.mimeType).toBe("image/png");
    expect(download.data.toString("utf8")).toBe(fileBytes);
  });

  it("downloads a Thai-named file with an ASCII-safe Content-Disposition (RFC 5987, no header 500)", async () => {
    const { attachment } = await attachments.upload(actorA, templeA, ip, {
      ownerType: "donor",
      ownerId: donorAId,
      fileName: "ใบเสร็จ-มกราคม.pdf",
      mimeType: "application/pdf",
      contentBase64,
    });
    const headers: Record<string, string> = {};
    const res = { set: (h: Record<string, string>) => Object.assign(headers, h) };
    const stream = await attachments.download(templeA, attachment.id, res as never);
    expect(stream).toBeDefined();
    // the header value must be pure ASCII (a raw Thai value makes res.setHeader throw -> 500)
    expect(/^[\x20-\x7e]+$/.test(headers["Content-Disposition"] ?? "")).toBe(true);
    expect(headers["Content-Disposition"]).toContain("filename*=UTF-8''");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("caps the number of attachments per owner (409)", async () => {
    const { donor } = await donors.create(actorA, templeA, ip, { displayName: `cap-${randomUUID().slice(0, 8)}` });
    for (let i = 0; i < 20; i++) {
      await attachments.upload(actorA, templeA, ip, {
        ownerType: "donor",
        ownerId: donor.id,
        fileName: `f${i}.png`,
        mimeType: "image/png",
        contentBase64,
      });
    }
    await expectProjectHttpError(
      attachments.upload(actorA, templeA, ip, {
        ownerType: "donor",
        ownerId: donor.id,
        fileName: "over.png",
        mimeType: "image/png",
        contentBase64,
      }),
      409,
      "CONFLICT",
    );
  });

  it("rejects a disallowed MIME type and an oversized file with 422", async () => {
    await expectProjectHttpError(
      attachments.upload(actorA, templeA, ip, {
        ownerType: "donor",
        ownerId: donorAId,
        fileName: "x.exe",
        mimeType: "application/x-msdownload",
        contentBase64,
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
    // ~5.25 MB decoded (> 5 MB cap)
    const oversized = "A".repeat(7_000_000);
    await expectProjectHttpError(
      attachments.upload(actorA, templeA, ip, {
        ownerType: "donor",
        ownerId: donorAId,
        fileName: "big.pdf",
        mimeType: "application/pdf",
        contentBase64: oversized,
      }),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("uploads an item_loan hand-over photo against a borrowable item (regression: ownerExists item_loan)", async () => {
    const { attachment } = await attachments.upload(actorA, templeA, ip, {
      ownerType: "item_loan",
      ownerId: itemAId,
      fileName: "handover.png",
      mimeType: "image/png",
      contentBase64,
    });
    expect(attachment.ownerType).toBe("item_loan");
    expect(attachment.ownerId).toBe(itemAId);
    // a bogus item id is still rejected (404), proving the owner is really validated.
    await expectProjectHttpError(
      attachments.upload(actorA, templeA, ip, {
        ownerType: "item_loan",
        ownerId: randomUUID(),
        fileName: "x.png",
        mimeType: "image/png",
        contentBase64,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("rejects attaching to a non-existent owner with 404", async () => {
    await expectProjectHttpError(
      attachments.upload(actorA, templeA, ip, {
        ownerType: "donor",
        ownerId: randomUUID(),
        fileName: "slip.png",
        mimeType: "image/png",
        contentBase64,
      }),
      404,
      "NOT_FOUND",
    );
  });

  it("never exposes another tenant's attachment (RLS isolation)", async () => {
    const { attachment } = await attachments.upload(actorA, templeA, ip, {
      ownerType: "donor",
      ownerId: donorAId,
      fileName: "iso.png",
      mimeType: "image/png",
      contentBase64,
    });
    await expectProjectHttpError(
      Promise.resolve().then(() => attachmentsService.download(templeB, attachment.id)),
      404,
      "NOT_FOUND",
    );
    const { attachments: bList } = await attachments.list(templeB, "donor", donorAId);
    expect(bList.some((a) => a.id === attachment.id)).toBe(false);
    expect(actorB.tenant_id).toBe(templeB);
  });

  it("deletes an attachment (audited) so it can no longer be downloaded — but the row survives (soft delete)", async () => {
    const { attachment } = await attachments.upload(actorA, templeA, ip, {
      ownerType: "donor",
      ownerId: donorAId,
      fileName: "todelete.png",
      mimeType: "image/png",
      contentBase64,
    });
    await attachments.remove(actorA, templeA, ip, attachment.id);
    expect(await attachmentAuditCount(templeA, "attachment:delete", attachment.id)).toBe(1);
    await expectProjectHttpError(
      Promise.resolve().then(() => attachmentsService.download(templeA, attachment.id)),
      404,
      "NOT_FOUND",
    );
    const { attachments: list } = await attachments.list(templeA, "donor", donorAId);
    expect(list.some((a) => a.id === attachment.id)).toBe(false);

    // no-hard-delete: the row (and blob) is retained with deleted_at stamped
    const { stdout } = await execFileAsync(
      "docker",
      [
        "exec", "-i", process.env.POSTGRES_CONTAINER ?? "wat-dev-db",
        "psql", "-U", process.env.POSTGRES_USER ?? "wat_dev", "-d", process.env.POSTGRES_DB ?? "wat_dev",
        "-At", "-c",
        `SELECT (deleted_at IS NOT NULL)::text || ':' || (deleted_by_user_id IS NOT NULL)::text FROM attachments WHERE id = '${attachment.id}'`,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    expect(stdout.trim()).toBe("true:true");
  });

  it("forbids staff from deleting financial-evidence attachments (donation slip), allows finance/admin", async () => {
    const { donation } = await donations.create(actorA, templeA, ip, {
      amountSatang: 9900,
      method: "bank_transfer",
      donationDate: "2026-06-10",
    });
    const { attachment } = await attachments.upload(actorA, templeA, ip, {
      ownerType: "donation",
      ownerId: donation.id,
      fileName: "slip.png",
      mimeType: "image/png",
      contentBase64,
    });

    await expectProjectHttpError(
      attachments.remove(actorStaff, templeA, ip, attachment.id),
      403,
      "FORBIDDEN",
    );
    // still downloadable — the staff attempt must not have removed anything
    const file = await attachmentsService.download(templeA, attachment.id);
    expect(file.fileName).toBe("slip.png");

    // admin may remove it (soft delete, audited)
    await attachments.remove(actorA, templeA, ip, attachment.id);
    expect(await attachmentAuditCount(templeA, "attachment:delete", attachment.id)).toBe(1);
  });

  it("returns 404 for a malformed id and 422 for a bad list query", async () => {
    await expectProjectHttpError(
      Promise.resolve().then(() => attachments.remove(actorA, templeA, ip, "not-a-uuid")),
      404,
      "NOT_FOUND",
    );
    await expectProjectHttpError(
      Promise.resolve().then(() => attachments.list(templeA, "bogus", donorAId)),
      422,
      "UNPROCESSABLE_ENTITY",
    );
  });

  it("allows admin/finance/staff to manage attachments", () => {
    expect(reflector.get<string[]>(ROLES_KEY, AttachmentsController)).toEqual(["admin", "finance", "staff"]);
  });
});
