import { useEffect, useState, type ReactElement } from "react";
import {
  diffProfile,
  TEMPLE_FIELD_GROUPS,
  type TempleApi,
  type TempleProfile,
  type TempleProfileUpdate,
} from "./temple";

function draftFromProfile(profile: TempleProfile): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const group of TEMPLE_FIELD_GROUPS) {
    for (const { key } of group.fields) {
      draft[key as string] = (profile[key] ?? "") as string;
    }
  }
  return draft;
}

/** Read-only display of the temple profile, grouped, with a Thai empty state. */
export function TempleProfileView({ profile }: { profile: TempleProfile }): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      {TEMPLE_FIELD_GROUPS.map((group) => (
        <section key={group.title} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-stone-700">{group.title}</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {group.fields.map(({ key, label }) => {
              const value = (profile[key] ?? "") as string;
              return (
                <div key={key as string} className="flex flex-col">
                  <dt className="text-xs text-stone-500">{label}</dt>
                  <dd className={value ? "text-sm text-stone-800" : "text-sm text-stone-400"}>
                    {value || "— ยังไม่ระบุ"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

/** Controlled edit form for the temple profile. */
export function TempleProfileForm({
  draft,
  submitting,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Record<string, string>;
  submitting: boolean;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {TEMPLE_FIELD_GROUPS.map((group) => (
        <section key={group.title} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-stone-700">{group.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map(({ key, label, multiline }) => (
              <label key={key as string} className={`flex flex-col gap-1 text-sm ${multiline ? "sm:col-span-2" : ""}`}>
                <span className="font-medium text-stone-700">{label}</span>
                {multiline ? (
                  <textarea
                    className="rounded-lg border border-stone-300 px-3 py-2"
                    rows={2}
                    value={draft[key as string] ?? ""}
                    onChange={(event) => onChange(key as string, event.target.value)}
                  />
                ) : (
                  <input
                    className="rounded-lg border border-stone-300 px-3 py-2"
                    value={draft[key as string] ?? ""}
                    onChange={(event) => onChange(key as string, event.target.value)}
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

/** Stateful page: load the profile, view it, and (admin) edit it. */
export function TempleProfilePage({ api, canEdit }: { api: TempleApi; canEdit: boolean }): ReactElement {
  const [profile, setProfile] = useState<TempleProfile | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get()
      .then(setProfile)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลวัดไม่สำเร็จ"));
  }, [api]);

  const startEdit = (): void => {
    if (!profile) return;
    setDraft(draftFromProfile(profile));
    setSaved(false);
    setError(null);
    setEditing(true);
  };

  const save = async (): Promise<void> => {
    if (!profile) return;
    const patch: TempleProfileUpdate = diffProfile(profile, draft);
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setProfile(await api.update(patch));
      setEditing(false);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">ข้อมูลวัด</h1>
          <p className="mt-1 text-sm text-stone-600">ข้อมูลหลักของวัดที่ใช้บนเอกสาร ใบอนุโมทนา และรายงาน</p>
        </div>
        {canEdit && profile && !editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700"
          >
            แก้ไข
          </button>
        ) : null}
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {saved ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">บันทึกข้อมูลวัดแล้ว</p> : null}

      {!profile ? (
        <p className="text-sm text-stone-500">กำลังโหลด…</p>
      ) : editing ? (
        <TempleProfileForm
          draft={draft}
          submitting={submitting}
          onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <TempleProfileView profile={profile} />
      )}
    </section>
  );
}
