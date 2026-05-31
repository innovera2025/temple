import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Attachment, AttachmentsApi } from "./attachments";
import { AttachmentList, AttachmentsPanel } from "./attachments-view";

const att: Attachment = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerType: "donor",
  ownerId: "22222222-2222-4222-8222-222222222222",
  fileName: "slip.png",
  mimeType: "image/png",
  byteSize: "2048",
  createdAt: "2026-05-31T00:00:00.000Z",
};

describe("attachments view", () => {
  it("list renders the file name + size and a delete control when manageable", () => {
    const html = renderToStaticMarkup(<AttachmentList rows={[att]} canManage={true} />);
    expect(html).toContain("slip.png");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("ลบ");
  });

  it("list hides delete for read-only and shows a Thai empty state", () => {
    expect(renderToStaticMarkup(<AttachmentList rows={[att]} canManage={false} />)).not.toContain(">ลบ<");
    expect(renderToStaticMarkup(<AttachmentList rows={[]} canManage={true} />)).toContain("ยังไม่มีไฟล์แนบ");
  });

  it("panel shell renders the heading and an upload control for managers", () => {
    const api: AttachmentsApi = {
      list: async () => [att],
      upload: async () => att,
      remove: async () => undefined,
      download: async () => new Blob(["x"]),
    };
    const html = renderToStaticMarkup(<AttachmentsPanel api={api} ownerType="donor" ownerId={att.ownerId} canManage={true} />);
    expect(html).toContain("หลักฐานแนบ");
    expect(html).toContain("แนบไฟล์");
  });
});
