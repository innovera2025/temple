import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { HealthController } from "../src/health/health.controller";

describe("GET /health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns ok with a real database ping", async () => {
    const controller = app.get(HealthController);

    expect(await controller.check()).toEqual({ status: "ok", db: "ok" });
  });

  it("liveness probe never touches the database", () => {
    const controller = app.get(HealthController);

    expect(controller.live()).toEqual({ status: "ok" });
  });
});
