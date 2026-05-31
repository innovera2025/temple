import { describe, expect, it, vi } from "vitest";
import { createAttachmentsApiClient, formatByteSize, ownerTypeLabel, type Attachment } from "./attachments";

const att: Attachment = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerType: "donor",
  ownerId: "22222222-2222-4222-8222-222222222222",
  fileName: "slip.png",
  mimeType: "image/png",
  byteSize: "2048",
  createdAt: "2026-05-31T00:00:00.000Z",
};

describe("attachments helpers", () => {
  it("formats byte sizes and Thai owner labels", () => {
    expect(formatByteSize("512")).toBe("512 B");
    expect(formatByteSize("2048")).toBe("2.0 KB");
    expect(formatByteSize(String(3 * 1024 * 1024))).toBe("3.0 MB");
    expect(ownerTypeLabel("ledger_entry")).toBe("รายการบัญชี");
  });
});

describe("attachments API client", () => {
  it("lists by owner with the auth header", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ attachments: [att] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = createAttachmentsApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const rows = await api.list("donor", att.ownerId);
    expect(rows).toHaveLength(1);
    expect(fetchFn.mock.calls[0]?.[0]).toContain("/attachments?ownerType=donor&ownerId=");
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("uploads via POST with the base64 body", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ attachment: att }), { status: 201, headers: { "content-type": "application/json" } }),
    );
    const api = createAttachmentsApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const created = await api.upload({
      ownerType: "donor",
      ownerId: att.ownerId,
      fileName: "slip.png",
      mimeType: "image/png",
      contentBase64: "aGVsbG8=",
    });
    expect(created.id).toBe(att.id);
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("downloads as a Blob", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () => new Response("filebytes", { status: 200, headers: { "content-type": "image/png" } }),
    );
    const api = createAttachmentsApiClient({
      baseUrl: "http://api.test",
      getToken: () => "tok",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const blob = await api.download(att.id);
    expect(await blob.text()).toBe("filebytes");
    expect(fetchFn.mock.calls[0]?.[0]).toContain(`/attachments/${att.id}/download`);
  });

  it("surfaces the API's Thai error on a failed upload", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { message: "ไฟล์ต้องไม่เกิน 5 MB" } }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createAttachmentsApiClient({
      baseUrl: "http://api.test",
      getToken: () => null,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(
      api.upload({ ownerType: "donor", ownerId: att.ownerId, fileName: "x.pdf", mimeType: "application/pdf", contentBase64: "AAAA" }),
    ).rejects.toThrow("ไฟล์ต้องไม่เกิน 5 MB");
  });
});
