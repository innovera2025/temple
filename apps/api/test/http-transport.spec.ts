import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app-setup";

/**
 * Real-HTTP-transport behavior that unit-level controller specs cannot see:
 * the body-parser limits and error envelopes configured in configureApp()
 * (shared with main.ts). The Nest 10→11 upgrade changed how middleware errors
 * reach the exception filter — these lock the contract.
 */
describe("HTTP transport (configureApp — same setup as production bootstrap)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app as NestExpressApplication);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves /health over real HTTP with a database ping", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });

  it("rejects an oversize JSON body with a clean 413 envelope (not a 500)", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .set("content-type", "application/json")
      .send(`{"email":"${"a".repeat(2_000_000)}"}`);
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE", statusCode: 413 },
    });
  });

  it("rejects malformed JSON with a 400 envelope (not a 500)", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .set("content-type", "application/json")
      .send("{broken");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(res.body.error.statusCode).toBe(400);
  });

  it("keeps the large body limit scoped to /attachments (unauthenticated -> 401, NOT 413)", async () => {
    // ~2 MB body passes the 12 MB route-scoped parser, then auth rejects it —
    // proving the bigger limit applies on this route while /auth got 413 above.
    const res = await request(app.getHttpServer())
      .post("/attachments")
      .set("content-type", "application/json")
      .send(`{"contentBase64":"${"A".repeat(2_000_000)}"}`);
    expect(res.status).toBe(401);
  });
});
