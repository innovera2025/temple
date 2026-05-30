import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import type { DonationSearchQuery, FieldError } from "@wat/shared";
import {
  displayBaht,
  DONATION_METHOD_OPTIONS,
  DONATION_STATUS_OPTIONS,
  emptyDonationForm,
  firstError,
  methodLabel,
  statusLabel,
  validateDonationForm,
  validateVoidReason,
  type DonationFormValues,
  type DonationsApi,
  type DonationView,
} from "./donations";

const TODAY_FALLBACK = "2026-01-01";

function FieldMessage({ message }: { message?: string }): ReactElement | null {
  return message ? <p className="mt-1 text-xs text-rose-600">{message}</p> : null;
}

export function DonationsEmptyState(): ReactElement {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
      <p className="text-sm font-semibold text-stone-700">ยังไม่มีรายการบริจาค</p>
      <p className="mt-1 text-xs text-stone-500">
        เริ่มบันทึกการรับบริจาคได้จากแบบฟอร์ม “บันทึกการบริจาค” ด้านบน
      </p>
    </div>
  );
}

export function DonationCreateForm({
  values,
  errors,
  submitting,
  onChange,
  onSubmit,
}: {
  values: DonationFormValues;
  errors: FieldError[];
  submitting: boolean;
  onChange: (next: DonationFormValues) => void;
  onSubmit: () => void;
}): ReactElement {
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} aria-label="แบบฟอร์มบันทึกการบริจาค">
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
        <span className="font-medium text-stone-700">ช่องทางการบริจาค</span>
        <select
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={values.method}
          onChange={(event) => onChange({ ...values, method: event.target.value as DonationFormValues["method"] })}
        >
          {DONATION_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldMessage message={firstError(errors, "method")} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">วันที่บริจาค</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="date"
          value={values.donationDate}
          onChange={(event) => onChange({ ...values, donationDate: event.target.value })}
        />
        <FieldMessage message={firstError(errors, "donationDate")} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ผู้บริจาค (ไม่บังคับ)</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={values.donorId ?? ""}
          onChange={(event) => onChange({ ...values, donorId: event.target.value })}
          placeholder="รหัสผู้บริจาค หรือเว้นว่างหากไม่ระบุ"
        />
        <FieldMessage message={firstError(errors, "donorId")} />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium text-stone-700">หมายเหตุ (ไม่บังคับ)</span>
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
          {submitting ? "กำลังบันทึก…" : "บันทึกการบริจาค"}
        </button>
      </div>
    </form>
  );
}

export function DonationFilters({
  filters,
  onChange,
}: {
  filters: DonationSearchQuery;
  onChange: (next: DonationSearchQuery) => void;
}): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-4" aria-label="ตัวกรองรายการบริจาค">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-stone-600">ช่องทาง</span>
        <select
          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          value={filters.method ?? ""}
          onChange={(event) => onChange({ ...filters, method: (event.target.value || undefined) as DonationSearchQuery["method"] })}
        >
          <option value="">ทั้งหมด</option>
          {DONATION_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-stone-600">สถานะ</span>
        <select
          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          value={filters.status ?? ""}
          onChange={(event) => onChange({ ...filters, status: (event.target.value || undefined) as DonationSearchQuery["status"] })}
        >
          <option value="">ทั้งหมด</option>
          {DONATION_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-stone-600">ตั้งแต่วันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(event) => onChange({ ...filters, dateFrom: event.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-stone-600">ถึงวันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm"
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(event) => onChange({ ...filters, dateTo: event.target.value || undefined })}
        />
      </label>
    </div>
  );
}

export function DonationTable({
  donations,
  onVoid,
}: {
  donations: DonationView[];
  onVoid: (donation: DonationView) => void;
}): ReactElement {
  if (donations.length === 0) {
    return <DonationsEmptyState />;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">วันที่</th>
          <th className="py-2 pr-3">ผู้บริจาค</th>
          <th className="py-2 pr-3 text-right">จำนวนเงิน</th>
          <th className="py-2 pr-3">ช่องทาง</th>
          <th className="py-2 pr-3">สถานะ</th>
          <th className="py-2 pr-3" />
        </tr>
      </thead>
      <tbody>
        {donations.map((donation) => {
          const cancelled = donation.status === "cancelled";
          return (
            <tr
              key={donation.id}
              className={`border-b border-stone-100 ${cancelled ? "text-stone-400 line-through" : "text-stone-800"}`}
            >
              <td className="py-2 pr-3">{donation.donationDate}</td>
              <td className="py-2 pr-3">{donation.donorId ?? "ไม่ระบุผู้บริจาค"}</td>
              <td className="py-2 pr-3 text-right font-medium">{displayBaht(donation.amountSatang)}</td>
              <td className="py-2 pr-3">{methodLabel(donation.method)}</td>
              <td className="py-2 pr-3">{statusLabel(donation.status)}</td>
              <td className="py-2 pr-3 text-right">
                {donation.status === "confirmed" ? (
                  <button
                    type="button"
                    onClick={() => onVoid(donation)}
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

export function DonationVoidDialog({
  donation,
  reason,
  error,
  submitting,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  donation: DonationView;
  reason: string;
  error?: string;
  submitting: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4" role="dialog" aria-label="ยกเลิกรายการบริจาค">
      <p className="text-sm font-semibold text-rose-800">
        ยืนยันการยกเลิกการบริจาค {displayBaht(donation.amountSatang)}
      </p>
      <p className="mt-1 text-xs text-rose-700">
        การยกเลิกจะกลับรายการบัญชีรายรับที่เกี่ยวข้องทั้งหมด และบันทึกประวัติไว้ (ไม่มีการลบข้อมูล)
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
 * Stateful page that wires the presentational pieces to a {@link DonationsApi}.
 * The API is injected, so this composes with the real HTTP client in the app
 * and with a fake in tests.
 */
export function DonationsPage({
  api,
  today = TODAY_FALLBACK,
}: {
  api: DonationsApi;
  today?: string;
}): ReactElement {
  const [donations, setDonations] = useState<DonationView[]>([]);
  const [filters, setFilters] = useState<DonationSearchQuery>({});
  const [form, setForm] = useState<DonationFormValues>(() => emptyDonationForm(today));
  const [formErrors, setFormErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<DonationView | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | undefined>(undefined);

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    let active = true;
    api
      .list(filters)
      .then((rows) => {
        if (active) setDonations(rows);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      active = false;
    };
  }, [api, filterKey]);

  const submit = async (): Promise<void> => {
    const result = validateDonationForm(form);
    if (!result.success) {
      setFormErrors(result.errors);
      return;
    }
    setFormErrors([]);
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.create(result.data);
      setDonations((current) => [created, ...current]);
      setForm(emptyDonationForm(today));
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
      setDonations((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setVoiding(null);
      setVoidReason("");
    } catch (err: unknown) {
      setVoidError(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">รับบริจาค</h1>
        <p className="mt-1 text-sm text-stone-600">
          บันทึกการรับบริจาค ระบบจะลงบัญชีรายรับให้อัตโนมัติ และยกเลิกได้โดยต้องระบุเหตุผล
        </p>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-stone-900">บันทึกการบริจาค</h2>
        <DonationCreateForm
          values={form}
          errors={formErrors}
          submitting={submitting}
          onChange={setForm}
          onSubmit={submit}
        />
      </div>

      {voiding ? (
        <DonationVoidDialog
          donation={voiding}
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
        <h2 className="mb-4 text-base font-semibold text-stone-900">รายการบริจาค</h2>
        <div className="mb-4">
          <DonationFilters filters={filters} onChange={setFilters} />
        </div>
        <DonationTable donations={donations} onVoid={setVoiding} />
      </div>
    </section>
  );
}
