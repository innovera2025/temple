/**
 * Attachments (แนบหลักฐาน) feature — framework-free logic shared by the UI and
 * tests (Task 18). A reusable panel that attaches files to a donation / receipt /
 * ledger entry / donor. Files are uploaded as base64 JSON and stored in the DB.
 */

import { ATTACHMENT_OWNER_TYPE_LABELS_TH, type AttachmentOwnerType } from "@wat/shared";

export type { AttachmentOwnerType } from "@wat/shared";

/**
 * Upload payload from the browser. `mimeType` is a plain string here (the File's
 * type) — the server validates it against the allowlist and returns 422 on a bad
 * type, so the client deliberately does not narrow it.
 */
export interface UploadAttachmentRequest {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface Attachment {
  id: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  byteSize: string;
  createdAt: string;
}

export function ownerTypeLabel(ownerType: AttachmentOwnerType): string {
  return ATTACHMENT_OWNER_TYPE_LABELS_TH[ownerType];
}

/** Human-readable size from the (string) byte count. */
export function formatByteSize(byteSize: string): string {
  const n = Number(byteSize);
  if (!Number.isFinite(n)) return byteSize;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read a browser File into raw base64 (strips the data: URL prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export interface AttachmentsApi {
  list(ownerType: AttachmentOwnerType, ownerId: string): Promise<Attachment[]>;
  upload(input: UploadAttachmentRequest): Promise<Attachment>;
  remove(id: string, reason?: string): Promise<void>;
  download(id: string): Promise<Blob>;
}

export interface AttachmentsApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function createAttachmentsApiClient(options: AttachmentsApiClientOptions): AttachmentsApi {
  const doFetch = options.fetchFn ?? fetch;
  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  };
  const authHeader = (): Record<string, string> => {
    const token = options.getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  };

  return {
    async list(ownerType, ownerId) {
      const qs = `?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`;
      const response = await doFetch(`${options.baseUrl}/attachments${qs}`, { headers: authHeader() });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
      }
      return (body.attachments ?? []) as Attachment[];
    },
    async upload(input) {
      const response = await doFetch(`${options.baseUrl}/attachments`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(input),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "อัปโหลดไม่สำเร็จ");
      }
      return body.attachment as Attachment;
    },
    async remove(id, reason) {
      const response = await doFetch(`${options.baseUrl}/attachments/${id}`, {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ reason: reason ?? "" }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.error?.message ?? "ลบไม่สำเร็จ");
      }
    },
    async download(id) {
      const response = await doFetch(`${options.baseUrl}/attachments/${id}/download`, { headers: authHeader() });
      if (!response.ok) {
        throw new Error("ดาวน์โหลดไม่สำเร็จ");
      }
      return response.blob();
    },
  };
}
