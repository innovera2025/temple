import { ReactElement, useEffect, useState } from "react";
import { TEMPLE_STATUS_LABELS_TH, type TempleStatus, validateReason } from "@wat/shared";
import { Badge, Button, Card, Modal } from "../../design-system";
import { PlatformApi, TempleRecord, platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";

function statusBadge(status: string): ReactElement {
  const label = TEMPLE_STATUS_LABELS_TH[status as TempleStatus] ?? status;
  if (status === "active") return <Badge kind="credit" dot>{label}</Badge>;
  if (status === "suspended") return <Badge kind="void" dot>{label}</Badge>;
  if (status === "archived") return <Badge kind="neutral" dot>{label}</Badge>;
  return <Badge kind="neutral">{label}</Badge>;
}

const FILTERS: Array<{ value: "" | TempleStatus; label: string }> = [
  { value: "", label: "ทั้งหมด" },
  { value: "active", label: "ใช้งาน" },
  { value: "suspended", label: "ระงับ" },
  { value: "archived", label: "เก็บถาวร" },
];

export function TemplesView({ api, token, canWrite, onUnauthorized }: PlatformViewProps): ReactElement {
  const [status, setStatus] = useState<"" | TempleStatus>("");
  const [rows, setRows] = useState<TempleRecord[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);
  const [acting, setActing] = useState<{ temple: TempleRecord; mode: "suspend" | "resume" } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    api
      .listTemples(token, status || undefined)
      .then((r) => !cancelled && setRows(r))
      .catch((err) => {
        if (cancelled || on401(err, onUnauthorized)) return;
        setError(platformErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, status, reloadKey, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">จัดการ</div>
          <h1>จัดการวัด</h1>
          <p className="desc">วัดทั้งหมดในระบบ — ระงับการใช้งาน (suspend) หรือเปิดใช้งานอีกครั้ง (resume) พร้อมเหตุผล</p>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="กรองสถานะ" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.value || "all"} type="button" role="tab" aria-selected={status === f.value} className={status === f.value ? "active" : ""} onClick={() => setStatus(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <Card>
        <div className="t-scroll">
          <table className="tbl">
            <thead>
              <tr><th>ชื่อวัด</th><th>slug</th><th>สถานะ</th><th>สร้างเมื่อ</th><th /></tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>ไม่มีวัดในสถานะนี้</td></tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.nameTh}{t.nameEn ? <div className="muted" style={{ fontSize: 12 }}>{t.nameEn}</div> : null}</td>
                    <td className="mono muted">{t.slug}</td>
                    <td>{statusBadge(t.status)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{t.createdAt.slice(0, 10)}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {canWrite && t.status === "active" ? <Button variant="tertiary" size="sm" onClick={() => setActing({ temple: t, mode: "suspend" })}>ระงับ</Button> : null}
                      {canWrite && t.status === "suspended" ? <Button variant="primary" size="sm" onClick={() => setActing({ temple: t, mode: "resume" })}>เปิดใช้งาน</Button> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {acting ? (
        <ReasonActionModal
          api={api}
          token={token}
          temple={acting.temple}
          mode={acting.mode}
          onClose={() => setActing(null)}
          onDone={() => { setActing(null); reload(); }}
          onUnauthorized={onUnauthorized}
        />
      ) : null}
    </div>
  );
}

function ReasonActionModal({
  api,
  token,
  temple,
  mode,
  onClose,
  onDone,
  onUnauthorized,
}: {
  api: PlatformApi;
  token: string;
  temple: TempleRecord;
  mode: "suspend" | "resume";
  onClose: () => void;
  onDone: () => void;
  onUnauthorized: () => void;
}): ReactElement {
  const [reason, setReason] = useState("");
  const [fieldErr, setFieldErr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSuspend = mode === "suspend";

  async function save(): Promise<void> {
    setError("");
    setFieldErr("");
    const result = validateReason({ reason: reason.trim() });
    if (!result.success) {
      setFieldErr(result.errors[0]?.message ?? "ต้องระบุเหตุผล");
      return;
    }
    setBusy(true);
    try {
      if (isSuspend) await api.suspendTemple(token, temple.id, result.data.reason);
      else await api.resumeTemple(token, temple.id, result.data.reason);
      onDone();
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setError(platformErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isSuspend ? "ระงับการใช้งานวัด" : "เปิดใช้งานวัดอีกครั้ง"}
      sub={`${temple.nameTh} · ${temple.slug}`}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant={isSuspend ? "danger" : "primary"} disabled={busy} onClick={() => void save()}>{busy ? "กำลังบันทึก…" : isSuspend ? "ยืนยันระงับ" : "ยืนยันเปิดใช้งาน"}</Button></>}
    >
      <div className="field">
        <label>เหตุผล (บันทึกไว้ตรวจสอบย้อนหลัง)</label>
        <input className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isSuspend ? "เช่น พบการใช้งานผิดเงื่อนไข" : "เช่น แก้ไขปัญหาเรียบร้อยแล้ว"} aria-invalid={fieldErr ? true : undefined} />
        {fieldErr ? <p className="error-text">{fieldErr}</p> : null}
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </Modal>
  );
}
