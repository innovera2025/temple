import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AttachmentsService } from "../src/attachments/attachments.service";

const validInput = {
  ownerType: "donor" as const,
  ownerId: "11111111-1111-4111-8111-111111111111",
  fileName: "slip.png",
  mimeType: "image/png" as const,
  contentBase64: "aGVsbG8=",
};

function serviceWith(ownerCount: number, tenantCount: number): AttachmentsService {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    donor: { findFirst: vi.fn().mockResolvedValue({ id: "owner" }) },
    attachment: {
      // first count() = per-owner, second count() = per-tenant
      count: vi.fn().mockResolvedValueOnce(ownerCount).mockResolvedValueOnce(tenantCount),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  const prisma = { withTenant: (_t: string, fn: (tx: unknown) => unknown) => fn(tx) };
  return new AttachmentsService(prisma as never);
}

async function expect409(promise: Promise<unknown>, fragment: string): Promise<void> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect(JSON.stringify((error as HttpException).getResponse())).toContain(fragment);
    return;
  }
  throw new Error("expected a 409 conflict");
}

describe("AttachmentsService quotas", () => {
  it("rejects when the per-owner cap (20) is reached", async () => {
    await expect409(serviceWith(20, 0).upload("tenant", "actor", validInput, "ip"), "ต่อรายการ");
  });

  it("rejects when the per-tenant cap (10000) is reached", async () => {
    await expect409(serviceWith(0, 10_000).upload("tenant", "actor", validInput, "ip"), "สูงสุดของวัด");
  });
});
