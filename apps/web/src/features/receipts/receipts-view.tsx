import { useEffect, useState, type ReactElement } from "react";
import { DONATION_METHOD_LABELS_TH, type DonationMethod, type ReceiptPreview } from "@wat/shared";
import {
  displayBaht,
  receiptStatusLabel,
  validateReissueReason,
  validateVoidReason,
  type ReceiptsApi,
  type ReceiptView,
} from "./receipts";

function methodLabel(method: string): string {
  return DONATION_METHOD_LABELS_TH[method as DonationMethod] ?? method;
}

/** Printable ใบอนุโมทนา — temple header, donor, amount in digits + Thai words. */
export function ReceiptPreviewCard({ preview }: { preview: ReceiptPreview }): ReactElement {
  const inactive = preview.status !== "issued";
  return (
    <article className="mx-auto max-w-xl rounded-2xl border border-stone-300 bg-white p-8 text-stone-900 shadow-sm">
      <header className="border-b border-stone-200 pb-4 text-center">
        {preview.templeReceiptHeaderTh ? (
          <p className="mb-1 text-xs text-stone-500">{preview.templeReceiptHeaderTh}</p>
        ) : null}
        <h2 className="text-xl font-bold">{preview.templeNameTh}</h2>
        {preview.templeNameEn ? <p className="text-sm text-stone-500">{preview.templeNameEn}</p> : null}
        {preview.templeAddressTh ? <p className="mt-1 text-xs text-stone-500">{preview.templeAddressTh}</p> : null}
        <p className="mt-3 text-lg font-semibold">ใบอนุโมทนาบุญ</p>
      </header>

      {inactive ? (
        <p className="mt-3 text-center text-sm font-semibold text-rose-600">
          ** {receiptStatusLabel(preview.status)} — ไม่ใช่ใบที่ใช้งานได้ **
        </p>
      ) : null}

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-500">เลขที่</dt>
          <dd className="font-medium">{preview.receiptNo}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">วันที่บริจาค</dt>
          <dd>{preview.donationDate}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">ผู้บริจาค</dt>
          <dd>{preview.donorName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">ช่องทาง</dt>
          <dd>{methodLabel(preview.donationMethod)}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-200 pt-2 text-base">
          <dt className="font-semibold">จำนวนเงิน</dt>
          <dd className="font-bold">{displayBaht(preview.amountSatang)}</dd>
        </div>
        <p className="text-right text-sm text-stone-600">({preview.amountText})</p>
      </dl>

      <p className="mt-6 text-center text-xs text-stone-500">
        ขออนุโมทนาบุญ ขอให้เจริญรุ่งเรืองด้วยจตุรพิธพรชัยทุกประการ
      </p>

      {preview.templeReceiptFooterTh ? (
        <p className="mt-3 border-t border-stone-200 pt-3 text-center text-xs text-stone-500">
          {preview.templeReceiptFooterTh}
        </p>
      ) : null}
    </article>
  );
}

export function ReceiptList({
  receipts,
  onVoid,
  onReissue,
  onPreview,
}: {
  receipts: ReceiptView[];
  onVoid: (receipt: ReceiptView) => void;
  onReissue: (receipt: ReceiptView) => void;
  onPreview: (receipt: ReceiptView) => void;
}): ReactElement {
  if (receipts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        ยังไม่มีใบอนุโมทนา
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">เลขที่</th>
          <th className="py-2 pr-3">วันที่ออก</th>
          <th className="py-2 pr-3">สถานะ</th>
          <th className="py-2 pr-3" />
        </tr>
      </thead>
      <tbody>
        {receipts.map((receipt) => (
          <tr key={receipt.id} className="border-b border-stone-100">
            <td className="py-2 pr-3 font-medium">{receipt.receiptNo}</td>
            <td className="py-2 pr-3">{receipt.issuedAt.slice(0, 10)}</td>
            <td className="py-2 pr-3">{receiptStatusLabel(receipt.status)}</td>
            <td className="py-2 pr-3 text-right">
              <button type="button" onClick={() => onPreview(receipt)} className="mr-2 text-xs font-semibold text-indigo-700">
                ดูตัวอย่าง / พิมพ์
              </button>
              {receipt.status === "issued" ? (
                <>
                  <button type="button" onClick={() => onReissue(receipt)} className="mr-2 text-xs font-semibold text-amber-700">
                    ออกใหม่แทน
                  </button>
                  <button type="button" onClick={() => onVoid(receipt)} className="text-xs font-semibold text-rose-700">
                    ยกเลิก
                  </button>
                </>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReceiptReasonDialog({
  title,
  confirmLabel,
  reason,
  error,
  submitting,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  reason: string;
  error?: string;
  submitting: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="dialog" aria-label={title}>
      <p className="text-sm font-semibold text-amber-900">{title}</p>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="font-medium text-amber-900">เหตุผล</span>
        <textarea
          className="rounded-lg border border-amber-300 px-3 py-2"
          rows={2}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
        />
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700">
          ปิด
        </button>
      </div>
    </div>
  );
}

type PendingAction = { kind: "void" | "reissue"; receipt: ReceiptView };

/** Stateful panel: lists a donation's receipts and wires issue/void/reissue/preview. */
export function ReceiptsPanel({
  api,
  donationId,
}: {
  api: ReceiptsApi;
  donationId?: string;
}): ReactElement {
  const [receipts, setReceipts] = useState<ReceiptView[]>([]);
  const [preview, setPreview] = useState<ReceiptPreview | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .list(donationId ? { donationId } : {})
      .then((rows) => {
        if (active) setReceipts(rows);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      active = false;
    };
  }, [api, donationId]);

  const refresh = async (): Promise<void> => {
    const rows = await api.list(donationId ? { donationId } : {});
    setReceipts(rows);
  };

  const issue = async (): Promise<void> => {
    if (!donationId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.issue(donationId);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "ออกใบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReason = async (): Promise<void> => {
    if (!pending) return;
    const check =
      pending.kind === "void" ? validateVoidReason(reason) : validateReissueReason(reason);
    if (!check.success) {
      setReasonError(check.errors[0]?.message);
      return;
    }
    setReasonError(undefined);
    setSubmitting(true);
    try {
      if (pending.kind === "void") {
        await api.void(pending.receipt.id, check.data.reason);
      } else {
        await api.reissue(pending.receipt.id, check.data.reason);
      }
      setPending(null);
      setReason("");
      await refresh();
    } catch (err: unknown) {
      setReasonError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const showPreview = async (receipt: ReceiptView): Promise<void> => {
    try {
      setPreview(await api.preview(receipt.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เปิดตัวอย่างไม่สำเร็จ");
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-stone-900">ใบอนุโมทนา</h2>
        {donationId ? (
          <button
            type="button"
            onClick={issue}
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            ออกใบอนุโมทนา
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {pending ? (
        <ReceiptReasonDialog
          title={pending.kind === "void" ? "ยกเลิกใบอนุโมทนา" : "ออกใบอนุโมทนาใหม่แทน"}
          confirmLabel={pending.kind === "void" ? "ยืนยันการยกเลิก" : "ยืนยันออกใบใหม่"}
          reason={reason}
          error={reasonError}
          submitting={submitting}
          onReasonChange={setReason}
          onConfirm={confirmReason}
          onCancel={() => {
            setPending(null);
            setReason("");
            setReasonError(undefined);
          }}
        />
      ) : null}

      <ReceiptList
        receipts={receipts}
        onPreview={showPreview}
        onVoid={(receipt) => setPending({ kind: "void", receipt })}
        onReissue={(receipt) => setPending({ kind: "reissue", receipt })}
      />

      {preview ? <ReceiptPreviewCard preview={preview} /> : null}
    </section>
  );
}
