import { useEffect, useState, type ReactElement } from "react";
import {
  createDraftFromPersonnel,
  PERSONNEL_FORM_SECTIONS,
  PERSONNEL_STATUS_OPTIONS,
  PERSONNEL_TYPE_OPTIONS,
  personnelStatusLabel,
  personnelTypeLabel,
  type CreatePersonnelInput,
  type Personnel,
  type PersonnelApi,
  type PersonnelFilters,
  type PersonnelStatus,
  type PersonnelType,
} from "./personnel";

export function PersonnelTable({
  rows,
  onSelect,
}: {
  rows: Personnel[];
  onSelect?: (row: Personnel) => void;
}): ReactElement {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        ยังไม่มีข้อมูลพระ/บุคลากร
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">ชื่อ</th>
          <th className="py-2 pr-3">ประเภท</th>
          <th className="py-2 pr-3">ตำแหน่ง</th>
          <th className="py-2 pr-3">พรรษา</th>
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
            <td className="py-2 pr-3">
              {row.displayName}
              {row.dharmaName ? <span className="text-stone-400"> ({row.dharmaName})</span> : null}
            </td>
            <td className="py-2 pr-3">{personnelTypeLabel(row.personnelType)}</td>
            <td className="py-2 pr-3">{row.position ?? "—"}</td>
            <td className="py-2 pr-3">{row.phansaCount ?? "—"}</td>
            <td className="py-2 pr-3">
              <span className={row.status === "active" ? "text-emerald-700" : "text-stone-400"}>
                {personnelStatusLabel(row.status)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PersonnelForm({
  personnelType,
  status,
  draft,
  submitting,
  onTypeChange,
  onStatusChange,
  onChange,
  onSubmit,
  onCancel,
}: {
  personnelType: PersonnelType;
  status: PersonnelStatus;
  draft: Record<string, string>;
  submitting: boolean;
  onTypeChange: (type: PersonnelType) => void;
  onStatusChange: (status: PersonnelStatus) => void;
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
          <span className="font-medium text-stone-700">ประเภท</span>
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
            value={personnelType}
            onChange={(event) => onTypeChange(event.target.value as PersonnelType)}
          >
            {PERSONNEL_TYPE_OPTIONS.map((option) => (
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
            onChange={(event) => onStatusChange(event.target.value as PersonnelStatus)}
          >
            {PERSONNEL_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {PERSONNEL_FORM_SECTIONS.map((section) => (
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

type Mode = { kind: "list" } | { kind: "create" } | { kind: "edit"; row: Personnel };

/** Stateful page: list + filter personnel, and (write roles) add/edit them. */
export function PersonnelPage({ api, canWrite }: { api: PersonnelApi; canWrite: boolean }): ReactElement {
  const [rows, setRows] = useState<Personnel[]>([]);
  const [filters, setFilters] = useState<PersonnelFilters>({});
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [personnelType, setPersonnelType] = useState<PersonnelType>("monk");
  const [status, setStatus] = useState<PersonnelStatus>("active");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = (next: PersonnelFilters): void => {
    api
      .list(next)
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  };

  useEffect(() => {
    reload(filters);
  }, [api]);

  const startCreate = (): void => {
    setPersonnelType("monk");
    setStatus("active");
    setDraft({});
    setError(null);
    setMode({ kind: "create" });
  };

  const startEdit = (row: Personnel): void => {
    setPersonnelType(row.personnelType);
    setStatus(row.status);
    setDraft(createDraftFromPersonnel(row));
    setError(null);
    setMode({ kind: "edit", row });
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    const payload = { personnelType, status, ...draft } as unknown as CreatePersonnelInput;
    try {
      if (mode.kind === "create") {
        await api.create(payload);
      } else if (mode.kind === "edit") {
        await api.update(mode.row.id, payload);
      }
      const next = filters;
      setMode({ kind: "list" });
      reload(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const applyFilter = (next: PersonnelFilters): void => {
    setFilters(next);
    reload(next);
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">พระ / สามเณร / บุคลากร</h1>
          <p className="mt-1 text-sm text-stone-600">ทะเบียนพระภิกษุ สามเณร และบุคลากรของวัด</p>
        </div>
        {canWrite && mode.kind === "list" ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white"
          >
            เพิ่มรายชื่อ
          </button>
        ) : null}
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {mode.kind === "list" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3" aria-label="ตัวกรอง">
            <select
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={filters.personnelType ?? ""}
              onChange={(event) =>
                applyFilter({ ...filters, personnelType: (event.target.value || undefined) as PersonnelType | undefined })
              }
            >
              <option value="">ทุกประเภท</option>
              {PERSONNEL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={filters.status ?? ""}
              onChange={(event) =>
                applyFilter({ ...filters, status: (event.target.value || undefined) as PersonnelStatus | undefined })
              }
            >
              <option value="">ทุกสถานะ</option>
              {PERSONNEL_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="ค้นหาชื่อ/ฉายา"
              value={filters.q ?? ""}
              onChange={(event) => applyFilter({ ...filters, q: event.target.value || undefined })}
            />
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <PersonnelTable rows={rows} onSelect={canWrite ? startEdit : undefined} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">
            {mode.kind === "create" ? "เพิ่มรายชื่อ" : "แก้ไขข้อมูล"}
          </h2>
          <PersonnelForm
            personnelType={personnelType}
            status={status}
            draft={draft}
            submitting={submitting}
            onTypeChange={setPersonnelType}
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
