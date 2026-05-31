import { useEffect, useState, type ReactElement } from "react";
import {
  CEREMONY_FORM_SECTIONS,
  CEREMONY_STATUS_OPTIONS,
  CEREMONY_TYPE_OPTIONS,
  ceremonyStatusLabel,
  ceremonyTypeLabel,
  createDraftFromCeremony,
  type Ceremony,
  type CeremoniesApi,
  type CeremonyFilters,
  type CeremonyStatus,
  type CeremonyType,
  type CreateCeremonyInput,
} from "./ceremonies";

export function CeremoniesTable({
  rows,
  onSelect,
}: {
  rows: Ceremony[];
  onSelect?: (row: Ceremony) => void;
}): ReactElement {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        ยังไม่มีงานบุญ/พิธี
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">วันที่</th>
          <th className="py-2 pr-3">งาน</th>
          <th className="py-2 pr-3">ประเภท</th>
          <th className="py-2 pr-3">สถานที่</th>
          <th className="py-2 pr-3">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className="cursor-pointer border-b border-stone-100 text-stone-800 hover:bg-stone-50"
            onClick={() => onSelect?.(row)}
          >
            <td className="py-2 pr-3 whitespace-nowrap">{row.ceremonyDate}</td>
            <td className="py-2 pr-3">{row.title}</td>
            <td className="py-2 pr-3">{ceremonyTypeLabel(row.ceremonyType)}</td>
            <td className="py-2 pr-3">{row.location ?? "—"}</td>
            <td className="py-2 pr-3">
              <span className={row.status === "cancelled" ? "text-stone-400" : "text-stone-800"}>
                {ceremonyStatusLabel(row.status)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CeremonyForm({
  ceremonyType,
  status,
  draft,
  submitting,
  onTypeChange,
  onStatusChange,
  onChange,
  onSubmit,
  onCancel,
}: {
  ceremonyType: CeremonyType;
  status: CeremonyStatus;
  draft: Record<string, string>;
  submitting: boolean;
  onTypeChange: (type: CeremonyType) => void;
  onStatusChange: (status: CeremonyStatus) => void;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">ประเภทงาน</span>
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
            value={ceremonyType}
            onChange={(event) => onTypeChange(event.target.value as CeremonyType)}
          >
            {CEREMONY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">สถานะ</span>
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as CeremonyStatus)}
          >
            {CEREMONY_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {CEREMONY_FORM_SECTIONS.map((section) => (
        <section key={section.title} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-stone-700">{section.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <label
                key={field.key as string}
                className={`flex flex-col gap-1 text-sm ${field.type === "textarea" ? "sm:col-span-2" : ""}`}
              >
                <span className="font-medium text-stone-700">{field.label}</span>
                {field.type === "textarea" ? (
                  <textarea
                    className="rounded-lg border border-stone-300 px-3 py-2"
                    rows={2}
                    value={draft[field.key as string] ?? ""}
                    onChange={(event) => onChange(field.key as string, event.target.value)}
                  />
                ) : (
                  <input
                    className="rounded-lg border border-stone-300 px-3 py-2"
                    type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                    value={draft[field.key as string] ?? ""}
                    onChange={(event) => onChange(field.key as string, event.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

type Mode = { kind: "list" } | { kind: "create" } | { kind: "edit"; row: Ceremony };

/** Stateful page: list + filter ceremonies, and (write roles) add/edit them. */
export function CeremoniesPage({ api, canWrite }: { api: CeremoniesApi; canWrite: boolean }): ReactElement {
  const [rows, setRows] = useState<Ceremony[]>([]);
  const [filters, setFilters] = useState<CeremonyFilters>({});
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [ceremonyType, setCeremonyType] = useState<CeremonyType>("merit");
  const [status, setStatus] = useState<CeremonyStatus>("planned");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = (next: CeremonyFilters): void => {
    api
      .list(next)
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  };

  useEffect(() => {
    reload(filters);
  }, [api]);

  const startCreate = (): void => {
    setCeremonyType("merit");
    setStatus("planned");
    setDraft({});
    setError(null);
    setMode({ kind: "create" });
  };

  const startEdit = (row: Ceremony): void => {
    setCeremonyType(row.ceremonyType);
    setStatus(row.status);
    setDraft(createDraftFromCeremony(row));
    setError(null);
    setMode({ kind: "edit", row });
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    const payload = { ceremonyType, status, ...draft } as unknown as CreateCeremonyInput;
    try {
      if (mode.kind === "create") {
        await api.create(payload);
      } else if (mode.kind === "edit") {
        await api.update(mode.row.id, payload);
      }
      setMode({ kind: "list" });
      reload(filters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const applyFilter = (next: CeremonyFilters): void => {
    setFilters(next);
    reload(next);
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">งานบุญ / พิธี</h1>
          <p className="mt-1 text-sm text-stone-600">บันทึกงานบุญ งานพิธี และกำหนดการของวัด</p>
        </div>
        {canWrite && mode.kind === "list" ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white"
          >
            เพิ่มงาน
          </button>
        ) : null}
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {mode.kind === "list" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3" aria-label="ตัวกรอง">
            <select
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={filters.ceremonyType ?? ""}
              onChange={(event) =>
                applyFilter({ ...filters, ceremonyType: (event.target.value || undefined) as CeremonyType | undefined })
              }
            >
              <option value="">ทุกประเภท</option>
              {CEREMONY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={filters.status ?? ""}
              onChange={(event) =>
                applyFilter({ ...filters, status: (event.target.value || undefined) as CeremonyStatus | undefined })
              }
            >
              <option value="">ทุกสถานะ</option>
              {CEREMONY_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="ค้นหาชื่องาน"
              value={filters.q ?? ""}
              onChange={(event) => applyFilter({ ...filters, q: event.target.value || undefined })}
            />
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <CeremoniesTable rows={rows} onSelect={canWrite ? startEdit : undefined} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">
            {mode.kind === "create" ? "เพิ่มงาน" : "แก้ไขงาน"}
          </h2>
          <CeremonyForm
            ceremonyType={ceremonyType}
            status={status}
            draft={draft}
            submitting={submitting}
            onTypeChange={setCeremonyType}
            onStatusChange={setStatus}
            onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
            onSubmit={submit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}
    </section>
  );
}
