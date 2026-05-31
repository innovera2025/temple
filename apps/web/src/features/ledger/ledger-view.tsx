import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import type { FieldError } from "@wat/shared";
import {
  accountOptionLabel,
  canVoidEntry,
  directionLabel,
  displayBaht,
  emptyLedgerForm,
  firstError,
  periodStatusLabel,
  postableAccounts,
  statusLabel,
  validateLedgerEntryForm,
  validateVoidReason,
  type LedgerAccountView,
  type LedgerApi,
  type LedgerEntryView,
  type LedgerFormValues,
  type LedgerSummaryView,
  type ReconciliationPeriodView,
} from "./ledger";

const TODAY_FALLBACK = "2026-01-01";

function FieldMessage({ message }: { message?: string }): ReactElement | null {
  return message ? <p className="mt-1 text-xs text-rose-600">{message}</p> : null;
}

export function LedgerSummaryCards({ summary }: { summary: LedgerSummaryView | null }): ReactElement {
  const income = summary ? displayBaht(summary.incomeSatang) : "—";
  const expense = summary ? displayBaht(summary.expenseSatang) : "—";
  const balance = summary ? displayBaht(summary.balanceSatang) : "—";

  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-label="สรุปยอดบัญชี">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold text-emerald-700">รับเดือนนี้</p>
        <p className="mt-2 text-2xl font-bold text-emerald-800">{income}</p>
      </div>
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-xs font-semibold text-rose-700">จ่ายเดือนนี้</p>
        <p className="mt-2 text-2xl font-bold text-rose-800">{expense}</p>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-xs font-semibold text-stone-600">คงเหลือ</p>
        <p className="mt-2 text-2xl font-bold text-stone-900">{balance}</p>
      </div>
    </div>
  );
}

export function LedgerEntriesEmptyState(): ReactElement {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
      <p className="text-sm font-semibold text-stone-700">ยังไม่มีรายการบัญชี</p>
      <p className="mt-1 text-xs text-stone-500">
        เริ่มบันทึกรายจ่ายของวัดได้จากแบบฟอร์ม “บันทึกรายรับ/รายจ่าย” ด้านบน
      </p>
    </div>
  );
}

export function LedgerEntryForm({
  values,
  accounts,
  errors,
  submitting,
  onChange,
  onSubmit,
}: {
  values: LedgerFormValues;
  accounts: LedgerAccountView[];
  errors: FieldError[];
  submitting: boolean;
  onChange: (next: LedgerFormValues) => void;
  onSubmit: () => void;
}): ReactElement {
  const options = postableAccounts(accounts);
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} aria-label="แบบฟอร์มบันทึกรายรับรายจ่าย">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">บัญชี/หมวด</span>
        <select
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={values.accountId}
          onChange={(event) => onChange({ ...values, accountId: event.target.value })}
        >
          <option value="">เลือกบัญชี</option>
          {options.map((account) => (
            <option key={account.id} value={account.id}>
              {accountOptionLabel(account)} ({directionLabel(account.direction)})
            </option>
          ))}
        </select>
        <FieldMessage message={firstError(errors, "accountId")} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">จำนวนเงิน (บาท)</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          inputMode="decimal"
          value={values.amountBaht}
          onChange={(event) => onChange({ ...values, amountBaht: event.target.value })}
          placeholder="0.00"
        />
        <FieldMessage message={firstError(errors, "amountBaht") ?? firstError(errors, "amountSatang")} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">วันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="date"
          value={values.entryDate}
          onChange={(event) => onChange({ ...values, entryDate: event.target.value })}
        />
        <FieldMessage message={firstError(errors, "entryDate")} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ผู้รับเงิน/ผู้จ่าย (ไม่บังคับ)</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={values.payee ?? ""}
          onChange={(event) => onChange({ ...values, payee: event.target.value })}
          placeholder="ชื่อร้าน/ผู้รับเงิน"
        />
        <FieldMessage message={firstError(errors, "payee")} />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium text-stone-700">รายละเอียด (ไม่บังคับ)</span>
        <textarea
          className="rounded-lg border border-stone-300 px-3 py-2"
          rows={2}
          value={values.note ?? ""}
          onChange={(event) => onChange({ ...values, note: event.target.value })}
        />
        <FieldMessage message={firstError(errors, "note")} />
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึกรายการ"}
        </button>
      </div>
    </form>
  );
}

export function LedgerTable({
  entries,
  onVoid,
  onReconcile,
}: {
  entries: LedgerEntryView[];
  onVoid: (entry: LedgerEntryView) => void;
  onReconcile?: (entry: LedgerEntryView) => void;
}): ReactElement {
  if (entries.length === 0) {
    return <LedgerEntriesEmptyState />;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">วันที่</th>
          <th className="py-2 pr-3">เลขที่</th>
          <th className="py-2 pr-3">บัญชี</th>
          <th className="py-2 pr-3">ผู้รับเงิน</th>
          <th className="py-2 pr-3">ทิศทาง</th>
          <th className="py-2 pr-3 text-right">จำนวนเงิน</th>
          <th className="py-2 pr-3">สถานะ</th>
          <th className="py-2 pr-3" />
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const voided = entry.status === "voided";
          return (
            <tr
              key={entry.id}
              className={`border-b border-stone-100 ${voided ? "text-stone-400 line-through" : "text-stone-800"}`}
            >
              <td className="py-2 pr-3">{entry.entryDate}</td>
              <td className="py-2 pr-3 font-mono text-xs">{entry.entryNo}</td>
              <td className="py-2 pr-3">
                {entry.accountCode} {entry.accountNameTh}
              </td>
              <td className="py-2 pr-3">{entry.payee ?? "—"}</td>
              <td className="py-2 pr-3">{directionLabel(entry.direction)}</td>
              <td className="py-2 pr-3 text-right font-medium">{displayBaht(entry.amountSatang)}</td>
              <td className="py-2 pr-3">
                {statusLabel(entry.status)}
                {entry.reconciledAt ? (
                  <span className="ml-1 rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700">กระทบยอดแล้ว</span>
                ) : null}
              </td>
              <td className="py-2 pr-3 text-right">
                {onReconcile && entry.status === "posted" && !entry.reconciledAt ? (
                  <button
                    type="button"
                    onClick={() => onReconcile(entry)}
                    className="mr-2 text-xs font-semibold text-teal-700"
                  >
                    กระทบยอด
                  </button>
                ) : null}
                {canVoidEntry(entry) ? (
                  <button
                    type="button"
                    onClick={() => onVoid(entry)}
                    className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700"
                  >
                    ยกเลิก
                  </button>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export interface ClosePeriodFormValues {
  periodStart: string;
  periodEnd: string;
}

export function ClosePeriodForm({
  values,
  errors,
  submitting,
  onChange,
  onSubmit,
}: {
  values: ClosePeriodFormValues;
  errors: FieldError[];
  submitting: boolean;
  onChange: (next: ClosePeriodFormValues) => void;
  onSubmit: () => void;
}): ReactElement {
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="grid gap-3 sm:grid-cols-3 sm:items-end" onSubmit={handleSubmit} aria-label="ปิดงวดบัญชี">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ตั้งแต่วันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="date"
          value={values.periodStart}
          onChange={(event) => onChange({ ...values, periodStart: event.target.value })}
        />
        <FieldMessage message={firstError(errors, "periodStart")} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ถึงวันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="date"
          value={values.periodEnd}
          onChange={(event) => onChange({ ...values, periodEnd: event.target.value })}
        />
        <FieldMessage message={firstError(errors, "periodEnd")} />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "กำลังปิดงวด…" : "ปิดงวดบัญชี"}
      </button>
    </form>
  );
}

export function LedgerPeriodList({ periods }: { periods: ReconciliationPeriodView[] }): ReactElement {
  if (periods.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-sm text-stone-500">
        ยังไม่มีการปิดงวดบัญชี
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">ช่วงงวด</th>
          <th className="py-2 pr-3">สถานะ</th>
          <th className="py-2 pr-3">ปิดเมื่อ</th>
        </tr>
      </thead>
      <tbody>
        {periods.map((period) => (
          <tr key={period.id} className="border-b border-stone-100 text-stone-800">
            <td className="py-2 pr-3">
              {period.periodStart} – {period.periodEnd}
            </td>
            <td className="py-2 pr-3">{periodStatusLabel(period.status)}</td>
            <td className="py-2 pr-3">{period.closedAt ? period.closedAt.slice(0, 10) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LedgerVoidDialog({
  entry,
  reason,
  error,
  submitting,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  entry: LedgerEntryView;
  reason: string;
  error?: string;
  submitting: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4" role="dialog" aria-label="ยกเลิกรายการบัญชี">
      <p className="text-sm font-semibold text-rose-800">
        ยืนยันการยกเลิกรายการ {entry.entryNo} จำนวน {displayBaht(entry.amountSatang)}
      </p>
      <p className="mt-1 text-xs text-rose-700">
        รายการจะถูกทำเครื่องหมายว่ายกเลิกและไม่ถูกนับในยอดสรุป แต่ยังเก็บประวัติไว้ (ไม่มีการลบข้อมูล)
      </p>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="font-medium text-rose-800">เหตุผลในการยกเลิก</span>
        <textarea
          className="rounded-lg border border-rose-300 px-3 py-2"
          rows={2}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <FieldMessage message={error} />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          ยืนยันการยกเลิก
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700"
        >
          ปิด
        </button>
      </div>
    </div>
  );
}

/**
 * Stateful page that wires the presentational pieces to a {@link LedgerApi}.
 * The API is injected, so this composes with the real HTTP client in the app
 * and with a fake in tests.
 */
export function LedgerPage({
  api,
  today = TODAY_FALLBACK,
  month,
}: {
  api: LedgerApi;
  today?: string;
  month?: string;
}): ReactElement {
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccountView[]>([]);
  const [summary, setSummary] = useState<LedgerSummaryView | null>(null);
  const [form, setForm] = useState<LedgerFormValues>(() => emptyLedgerForm(today));
  const [formErrors, setFormErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<LedgerEntryView | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | undefined>(undefined);

  const summaryQuery = useMemo(() => (month ? { month } : {}), [month]);

  const refreshSummary = useMemo(
    () => (): void => {
      api
        .summary(summaryQuery)
        .then(setSummary)
        .catch(() => undefined);
    },
    [api, summaryQuery],
  );

  useEffect(() => {
    let active = true;
    Promise.all([api.listEntries(), api.listAccounts()])
      .then(([rows, accountRows]) => {
        if (!active) return;
        setEntries(rows);
        setAccounts(accountRows);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    refreshSummary();
    return () => {
      active = false;
    };
  }, [api, refreshSummary]);

  const submit = async (): Promise<void> => {
    const result = validateLedgerEntryForm(form);
    if (!result.success) {
      setFormErrors(result.errors);
      return;
    }
    setFormErrors([]);
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.create(result.data);
      setEntries((current) => [created, ...current]);
      setForm(emptyLedgerForm(today));
      refreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmVoid = async (): Promise<void> => {
    if (!voiding) return;
    const check = validateVoidReason(voidReason);
    if (!check.success) {
      setVoidError(check.errors[0]?.message);
      return;
    }
    setVoidError(undefined);
    setSubmitting(true);
    try {
      const updated = await api.void(voiding.id, check.data.reason);
      setEntries((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setVoiding(null);
      setVoidReason("");
      refreshSummary();
    } catch (err: unknown) {
      setVoidError(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">บัญชีรายรับรายจ่าย</h1>
        <p className="mt-1 text-sm text-stone-600">
          บันทึกรายจ่ายของวัด ดูยอดสรุปรายเดือน และยกเลิกรายการได้โดยต้องระบุเหตุผล (ไม่มีการลบข้อมูล)
        </p>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <LedgerSummaryCards summary={summary} />

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-stone-900">บันทึกรายรับ/รายจ่าย</h2>
        <LedgerEntryForm
          values={form}
          accounts={accounts}
          errors={formErrors}
          submitting={submitting}
          onChange={setForm}
          onSubmit={submit}
        />
      </div>

      {voiding ? (
        <LedgerVoidDialog
          entry={voiding}
          reason={voidReason}
          error={voidError}
          submitting={submitting}
          onReasonChange={setVoidReason}
          onConfirm={confirmVoid}
          onCancel={() => {
            setVoiding(null);
            setVoidReason("");
            setVoidError(undefined);
          }}
        />
      ) : null}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-stone-900">รายการบัญชี</h2>
        <LedgerTable entries={entries} onVoid={setVoiding} />
      </div>
    </section>
  );
}
