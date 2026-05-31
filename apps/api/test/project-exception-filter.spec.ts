import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { projectHttpException } from "../src/common/errors/project-error";
import { ProjectExceptionFilter } from "../src/common/filters/project-exception.filter";

interface Captured {
  status?: number;
  body?: { error: { code: string; message: string; statusCode: number } };
}

function run(exception: unknown): Captured {
  const captured: Captured = {};
  const res = {
    status(status: number) {
      captured.status = status;
      return {
        json(body: Captured["body"]) {
          captured.body = body;
        },
      };
    },
  };
  const host = {
    getType: () => "http",
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ProjectExceptionFilter().catch(exception, host);
  return captured;
}

const PRISMA_VERSION = "6.19.3";

describe("ProjectExceptionFilter", () => {
  it("passes a project-shaped HttpException body through unchanged", () => {
    const out = run(projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง"));
    expect(out.status).toBe(422);
    expect(out.body).toMatchObject({ error: { code: "UNPROCESSABLE_ENTITY", statusCode: 422, message: "ข้อมูลไม่ถูกต้อง" } });
  });

  it("envelopes a plain HttpException", () => {
    const out = run(new HttpException("nope", HttpStatus.BAD_REQUEST));
    expect(out.status).toBe(400);
    expect(out.body?.error.statusCode).toBe(400);
    expect(out.body?.error.message).toBe("nope");
  });

  it("maps Prisma P2025 (record not found) to 404", () => {
    const out = run(new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: PRISMA_VERSION }));
    expect(out.status).toBe(404);
    expect(out.body?.error.code).toBe("NOT_FOUND");
  });

  it("maps Prisma P2002 / P2003 (constraint violations) to 409", () => {
    expect(run(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: PRISMA_VERSION })).status).toBe(409);
    expect(run(new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: PRISMA_VERSION })).status).toBe(409);
  });

  it("maps Prisma P2000 (value too long) to 422", () => {
    const out = run(new Prisma.PrismaClientKnownRequestError("too long", { code: "P2000", clientVersion: PRISMA_VERSION }));
    expect(out.status).toBe(422);
  });

  it("returns a sanitised 500 for an unmapped Prisma code (no raw message leak)", () => {
    const out = run(
      new Prisma.PrismaClientKnownRequestError("numeric_value_out_of_range detail", { code: "P2010", clientVersion: PRISMA_VERSION }),
    );
    expect(out.status).toBe(500);
    expect(out.body?.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(out.body?.error.message).not.toContain("numeric_value_out_of_range");
  });

  it("returns a sanitised 500 for a generic error and never leaks the raw message", () => {
    const out = run(new Error("DB password is hunter2 at internal-host"));
    expect(out.status).toBe(500);
    expect(out.body?.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(out.body?.error.message).toBe("เกิดข้อผิดพลาดภายในระบบ");
    expect(out.body?.error.message).not.toContain("hunter2");
  });

  it("sanitises a >=500 HttpException so a caller-supplied message never leaks", () => {
    const out = run(new HttpException("raw 500 secret detail", HttpStatus.INTERNAL_SERVER_ERROR));
    expect(out.status).toBe(500);
    expect(out.body?.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(out.body?.error.message).toBe("เกิดข้อผิดพลาดภายในระบบ");
    expect(out.body?.error.message).not.toContain("secret");
  });

  it("envelopes a non-Error thrown value (string) as a sanitised 500", () => {
    const out = run("raw string failure detail");
    expect(out.status).toBe(500);
    expect(out.body?.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(out.body?.error.message).not.toContain("raw string failure");
  });

  it("returns a sanitised 500 for a Prisma validation error", () => {
    const out = run(new Prisma.PrismaClientValidationError("Invalid `prisma.x.findMany()` argument", { clientVersion: PRISMA_VERSION }));
    expect(out.status).toBe(500);
    expect(out.body?.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
