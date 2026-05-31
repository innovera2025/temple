import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  createAttachmentsApiClient,
  fileToBase64,
  formatByteSize,
  type Attachment,
  type AttachmentOwnerType,
  type AttachmentsApi,
} from "./attachments";

export { createAttachmentsApiClient };

export function AttachmentList({
  rows,
  canManage,
  onDownload,
  onDelete,
}: {
  rows: Attachment[];
  canManage: boolean;
  onDownload?: (a: Attachment) => void;
  onDelete?: (a: Attachment) => void;
}): ReactElement {
  if (rows.length === 0) {
    return <p className="text-sm text-stone-500">ยังไม่มีไฟล์แนบ</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-stone-100">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center justify-between py-2 text-sm">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onDownload?.(a)}
              className="truncate text-left font-medium text-stone-800 hover:underline"
            >
              {a.fileName}
            </button>
            <span className="ml-2 text-xs text-stone-400">{formatByteSize(a.byteSize)}</span>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => onDelete?.(a)}
              className="ml-3 text-xs font-semibold text-rose-600 hover:underline"
            >
              ลบ
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Reusable panel: list + upload + download/delete attachments for one owner. */
export function AttachmentsPanel({
  api,
  ownerType,
  ownerId,
  canManage,
}: {
  api: AttachmentsApi;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  canManage: boolean;
}): ReactElement {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = (): void => {
    api
      .list(ownerType, ownerId)
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดไฟล์แนบไม่สำเร็จ"));
  };

  useEffect(() => {
    reload();
  }, [api, ownerType, ownerId]);

  const onPick = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      await api.upload({ ownerType, ownerId, fileName: file.name, mimeType: file.type, contentBase64 });
      if (fileInput.current) fileInput.current.value = "";
      reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (a: Attachment): Promise<void> => {
    try {
      const blob = await api.download(a.id);
      if (typeof document !== "undefined" && typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = a.fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ดาวน์โหลดไม่สำเร็จ");
    }
  };

  const onDelete = async (a: Attachment): Promise<void> => {
    setError(null);
    try {
      await api.remove(a.id);
      reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-700">หลักฐานแนบ</h3>
        {canManage ? (
          <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700">
            {busy ? "กำลังอัปโหลด…" : "แนบไฟล์"}
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={busy}
              onChange={(event) => void onPick(event.target.files?.[0])}
            />
          </label>
        ) : null}
      </div>
      {error ? <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <AttachmentList rows={rows} canManage={canManage} onDownload={(a) => void onDownload(a)} onDelete={(a) => void onDelete(a)} />
    </section>
  );
}
