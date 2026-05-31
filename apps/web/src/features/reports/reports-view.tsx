import { useState, type ReactElement } from "react";
import {
  downloadCsv,
  REPORT_TYPE_OPTIONS,
  reportFilename,
  type ReportFilters,
  type ReportsApi,
  type ReportType,
  type ReportView,
} from "./reports";

export function ReportControls({
  type,
  filters,
  submitting,
  onTypeChange,
  onFiltersChange,
  onGenerate,
}: {
  type: ReportType;
  filters: ReportFilters;
  submitting: boolean;
  onTypeChange: (type: ReportType) => void;
  onFiltersChange: (filters: ReportFilters) => void;
  onGenerate: () => void;
}): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-4 sm:items-end" aria-label="ตัวเลือกรายงาน">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">รายงาน</span>
        <select
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={type}
          onChange={(event) => onTypeChange(event.target.value as ReportType)}
        >
          {REPORT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ตั้งแต่วันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(event) => onFiltersChange({ ...filters, dateFrom: event.target.value || undefined })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ถึงวันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(event) => onFiltersChange({ ...filters, dateTo: event.target.value || undefined })}
        />
      </label>
      <button
        type="button"
        onClick={onGenerate}
        disabled={submitting}
        className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "กำลังสร้าง…" : "สร้างรายงาน"}
      </button>
    </div>
  );
}

export function ReportTable({ report }: { report: ReportView }): ReactElement {
  if (report.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        ไม่พบข้อมูลในช่วงที่เลือก
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          {report.columns.map((column) => (
            <th key={column} className="py-2 pr-3">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((cells, rowIndex) => (
          <tr key={rowIndex} className="border-b border-stone-100 text-stone-800">
            {cells.map((cell, cellIndex) => (
              <td key={cellIndex} className="py-2 pr-3">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Stateful page: pick a report + date range, preview the rows, download CSV. */
export function ReportsPage({ api, today }: { api: ReportsApi; today: string }): ReactElement {
  const [type, setType] = useState<ReportType>("donations");
  const [filters, setFilters] = useState<ReportFilters>({});
  const [report, setReport] = useState<ReportView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      setReport(await api.get(type, filters));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "สร้างรายงานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">รายงานและส่งออก</h1>
        <p className="mt-1 text-sm text-stone-600">เลือกรายงาน กรองช่วงวันที่ แล้วดูตัวอย่างหรือดาวน์โหลดเป็น CSV</p>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <ReportControls
          type={type}
          filters={filters}
          submitting={submitting}
          onTypeChange={setType}
          onFiltersChange={setFilters}
          onGenerate={generate}
        />
      </div>

      {report ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-stone-600">พบ {report.count} รายการ</p>
            <button
              type="button"
              onClick={() => downloadCsv(reportFilename(report.type, today), report.csv)}
              disabled={report.rows.length === 0}
              className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-700 disabled:opacity-50"
            >
              ดาวน์โหลด CSV
            </button>
          </div>
          <ReportTable report={report} />
        </div>
      ) : null}
    </section>
  );
}
