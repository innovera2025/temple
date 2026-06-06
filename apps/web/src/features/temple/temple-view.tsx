import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { Button, Card } from "../../design-system";
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

// Logo upload: read the chosen image, downscale it client-side, and embed it as a
// compact base64 data URL stored in `logoUrl` (the shared schema accepts data URLs).
const MAX_LOGO_DIM = 400; // px, longest side
const MAX_LOGO_BYTES = 550_000; // keep within the shared logoUrl limit (600k)

async function fileToResizedDataUrl(file: File): Promise<string> {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("ไฟล์รูปไม่ถูกต้อง"));
    el.src = sourceUrl;
  });
  const scale = Math.min(1, MAX_LOGO_DIM / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round((img.width || 1) * scale));
  const h = Math.max(1, Math.round((img.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceUrl; // no canvas (e.g. jsdom) — fall back to the original
  ctx.drawImage(img, 0, 0, w, h);
  // PNG keeps logo transparency; switch to JPEG if the PNG is too large.
  let out = canvas.toDataURL("image/png");
  if (out.length > MAX_LOGO_BYTES) out = canvas.toDataURL("image/jpeg", 0.85);
  return out;
}

const LOGO_BOX = {
  width: 80,
  height: 80,
  borderRadius: "var(--r)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  objectFit: "contain" as const,
};

/** Logo image picker with preview + remove, used in place of a plain logoUrl text input. */
function LogoUploadField({ value, onChange }: { value: string; onChange: (next: string) => void }): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      if (dataUrl.length > MAX_LOGO_BYTES) {
        setErr("รูปใหญ่เกินไป กรุณาใช้รูปที่เล็กลง");
        return;
      }
      onChange(dataUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>โลโก้วัด</label>
      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        {value ? (
          <img src={value} alt="โลโก้วัด" style={LOGO_BOX} />
        ) : (
          <div style={{ ...LOGO_BOX, border: "1px dashed var(--border-2)", display: "grid", placeItems: "center", fontSize: 12, color: "var(--ink-3)" }}>ไม่มีโลโก้</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void onPick(event)} />
          <div className="row" style={{ gap: 8 }}>
            <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? "กำลังประมวลผล…" : value ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
            </Button>
            {value ? (
              <Button type="button" variant="tertiary" size="sm" onClick={() => onChange("")} disabled={busy}>ลบโลโก้</Button>
            ) : null}
          </div>
          <span className="hint">PNG/JPG · ระบบจะย่อรูปให้อัตโนมัติ</span>
        </div>
      </div>
      {err ? <p className="error-text">{err}</p> : null}
    </div>
  );
}

/** Read-only display of the temple profile, grouped, with a Thai empty state. */
export function TempleProfileView({ profile }: { profile: TempleProfile }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {TEMPLE_FIELD_GROUPS.map((group) => (
        <Card pad key={group.title}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{group.title}</h3>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2" style={{ margin: 0 }}>
            {group.fields.map(({ key, label }) => {
              const value = (profile[key] ?? "") as string;
              if (key === "logoUrl") {
                return (
                  <div key="logoUrl" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <dt style={{ fontSize: 12, color: "var(--ink-3)" }}>โลโก้วัด</dt>
                    <dd style={{ margin: 0 }}>
                      {value ? (
                        <img src={value} alt="โลโก้วัด" style={{ ...LOGO_BOX, width: 64, height: 64, marginTop: 2 }} />
                      ) : (
                        <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>— ยังไม่ระบุ</span>
                      )}
                    </dd>
                  </div>
                );
              }
              return (
                <div key={key as string} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <dt style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</dt>
                  <dd style={{ margin: 0, fontSize: 13.5, color: value ? "var(--ink)" : "var(--ink-3)" }}>{value || "— ยังไม่ระบุ"}</dd>
                </div>
              );
            })}
          </dl>
        </Card>
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
    <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      {TEMPLE_FIELD_GROUPS.map((group) => (
        <Card pad key={group.title}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{group.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map(({ key, label, multiline }) => {
              if (key === "logoUrl") {
                return <LogoUploadField key="logoUrl" value={draft.logoUrl ?? ""} onChange={(next) => onChange("logoUrl", next)} />;
              }
              return (
                <div className="field" key={key as string} style={multiline ? { gridColumn: "1 / -1" } : undefined}>
                  <label>{label}</label>
                  {multiline ? (
                    <textarea className="control" style={{ minHeight: 56 }} value={draft[key as string] ?? ""} onChange={(event) => onChange(key as string, event.target.value)} />
                  ) : (
                    <input className="control" value={draft[key as string] ?? ""} onChange={(event) => onChange(key as string, event.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <div className="row" style={{ gap: 8 }}>
        <Button type="submit" variant="primary" disabled={submitting}>{submitting ? "กำลังบันทึก…" : "บันทึก"}</Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>ยกเลิก</Button>
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
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">เพิ่มเติม</div>
          <h1>ข้อมูลวัด</h1>
          <p className="desc">ข้อมูลหลักของวัดที่ใช้บนเอกสาร ใบอนุโมทนา และรายงาน</p>
        </div>
        {canEdit && profile && !editing ? (
          <div className="head-actions"><Button variant="secondary" onClick={startEdit}>แก้ไข</Button></div>
        ) : null}
      </div>

      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
      {saved ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--credit-tint)", color: "var(--credit)", fontSize: 13 }}>บันทึกข้อมูลวัดแล้ว</div> : null}

      {!profile ? (
        <p className="muted">กำลังโหลด…</p>
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
    </div>
  );
}
