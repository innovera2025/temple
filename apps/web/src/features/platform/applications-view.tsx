import { ReactElement, useEffect, useState } from "react";
import {
  APPLICATION_STATUS_LABELS_TH,
  type ApplicationStatus,
  type ApproveApplicationInput,
  validateApproveApplication,
  validateReason,
} from "@wat/shared";
import { Badge, Button, Card, Modal } from "../../design-system";
import { ApplicationRecord, PlatformApi, platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";

function statusBadge(status: string): ReactElement {
  const label = APPLICATION_STATUS_LABELS_TH[status as ApplicationStatus] ?? status;
  if (status === "pending") return <Badge kind="pending" dot>{label}</Badge>;
  if (status === "approved") return <Badge kind="reconciled" dot>{label}</Badge>;
  if (status === "rejected") return <Badge kind="void" dot>{label}</Badge>;
  return <Badge kind="neutral">{label}</Badge>;
}

const FILTERS: Array<{ value: "" | ApplicationStatus; label: string }> = [
  { value: "pending", label: "รอตรวจสอบ" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "rejected", label: "ปฏิเสธ" },
  { value: "", label: "ทั้งหมด" },
];

export function ApplicationsView({ api, token, canWrite, onUnauthorized }: PlatformViewProps): ReactElement {
  const [status, setStatus] = useState<"" | ApplicationStatus>("pending");
  const [rows, setRows] = useState<ApplicationRecord[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);
  const [approving, setApproving] = useState<ApplicationRecord | null>(null);
  const [rejecting, setRejecting] = useState<ApplicationRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    api
      .listApplications(token, status || undefined)
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
          <div className="eyebrow">งานอนุมัติ</div>
          <h1>ใบสมัครวัด</h1>
          <p className="desc">วัดที่ยื่นสมัครเข้าระบบ — อนุมัติเพื่อสร้างวัด + บัญชีผู้ดูแลวัด หรือปฏิเสธพร้อมเหตุผล</p>
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
              <tr>
                <th>วันที่ยื่น</th>
                <th>ชื่อวัด</th>
                <th>อีเมลติดต่อ</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>ไม่มีใบสมัครในสถานะนี้</td></tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{a.createdAt.slice(0, 10)}</td>
                    <td style={{ fontWeight: 500 }}>{a.templeNameTh}</td>
                    <td className="muted">{a.contactEmail}</td>
                    <td>
                      {statusBadge(a.status)}
                      {a.status === "rejected" && a.rejectionReason ? <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>เหตุผล: {a.rejectionReason}</div> : null}
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {canWrite && a.status === "pending" ? (
                        <>
                          <Button variant="primary" size="sm" onClick={() => setApproving(a)}>อนุมัติ</Button>{" "}
                          <Button variant="tertiary" size="sm" onClick={() => setRejecting(a)}>ปฏิเสธ</Button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {approving ? (
        <ApproveModal api={api} token={token} application={approving} onClose={() => setApproving(null)} onDone={() => { setApproving(null); reload(); }} onUnauthorized={onUnauthorized} />
      ) : null}
      {rejecting ? (
        <RejectModal api={api} token={token} application={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); reload(); }} onUnauthorized={onUnauthorized} />
      ) : null}
    </div>
  );
}

interface ModalProps {
  api: PlatformApi;
  token: string;
  application: ApplicationRecord;
  onClose: () => void;
  onDone: () => void;
  onUnauthorized: () => void;
}

/** Suggest a URL-safe slug from any ASCII in the contact email's local part. */
function suggestSlug(email: string): string {
  const local = email.split("@")[0] ?? "";
  const ascii = local.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return ascii ? `wat-${ascii}` : "";
}

function ApproveModal({ api, token, application, onClose, onDone, onUnauthorized }: ModalProps): ReactElement {
  const [slug, setSlug] = useState(suggestSlug(application.contactEmail));
  const [nameEn, setNameEn] = useState("");
  const [adminEmail, setAdminEmail] = useState(application.contactEmail);
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  async function save(): Promise<void> {
    setError("");
    setFieldErr({});
    const input: ApproveApplicationInput = {
      slug: slug.trim(),
      adminPassword,
      ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
      ...(adminEmail.trim() ? { adminEmail: adminEmail.trim() } : {}),
      ...(adminDisplayName.trim() ? { adminDisplayName: adminDisplayName.trim() } : {}),
    };
    const result = validateApproveApplication(input);
    if (!result.success) {
      setFieldErr(Object.fromEntries(result.errors.map((e) => [e.field, e.message])));
      return;
    }
    setBusy(true);
    try {
      const res = await api.approveApplication(token, application.id, result.data);
      setDone(`สร้างวัด "${res.temple.nameTh}" (slug: ${res.temple.slug}) และบัญชีผู้ดูแลเรียบร้อย`);
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setError(platformErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="อนุมัติใบสมัครวัด"
      sub={`${application.templeNameTh} · ${application.contactEmail}`}
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onDone}>เสร็จสิ้น</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "กำลังอนุมัติ…" : "อนุมัติและสร้างวัด"}</Button>
          </>
        )
      }
    >
      {done ? (
        <div className="auth-success" role="status"><p>{done}</p><p className="muted">ผู้ดูแลวัดเข้าใช้งานหลังบ้านได้ทันทีด้วยอีเมล/รหัสผ่านที่ตั้งไว้</p></div>
      ) : (
        <>
          <div className="field">
            <label>ชื่อย่อวัด (slug)</label>
            <input className="control" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="เช่น wat-arun" aria-invalid={fieldErr.slug ? true : undefined} />
            <span className="hint">ใช้ได้เฉพาะ a-z, 0-9 และ - (สำหรับ URL ของวัด)</span>
            {fieldErr.slug ? <p className="error-text">{fieldErr.slug}</p> : null}
          </div>
          <div className="field">
            <label>ชื่อภาษาอังกฤษ (ไม่บังคับ)</label>
            <input className="control" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Wat Arun" />
            {fieldErr.nameEn ? <p className="error-text">{fieldErr.nameEn}</p> : null}
          </div>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "14px 0" }} />
          <div className="field">
            <label>อีเมลผู้ดูแลวัด (admin)</label>
            <input className="control" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} aria-invalid={fieldErr.adminEmail ? true : undefined} />
            <span className="hint">ค่าเริ่มต้นคืออีเมลผู้ติดต่อในใบสมัคร</span>
            {fieldErr.adminEmail ? <p className="error-text">{fieldErr.adminEmail}</p> : null}
          </div>
          <div className="field">
            <label>ชื่อผู้ดูแล (ไม่บังคับ)</label>
            <input className="control" value={adminDisplayName} onChange={(e) => setAdminDisplayName(e.target.value)} placeholder="ผู้ดูแลวัด" />
          </div>
          <div className="field">
            <label>รหัสผ่านผู้ดูแล (เริ่มต้น)</label>
            <input className="control" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="อย่างน้อย 8 ตัว" aria-invalid={fieldErr.adminPassword ? true : undefined} />
            {fieldErr.adminPassword ? <p className="error-text">{fieldErr.adminPassword}</p> : null}
          </div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
        </>
      )}
    </Modal>
  );
}

function RejectModal({ api, token, application, onClose, onDone, onUnauthorized }: ModalProps): ReactElement {
  const [reason, setReason] = useState("");
  const [fieldErr, setFieldErr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      await api.rejectApplication(token, application.id, result.data.reason);
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
      title="ปฏิเสธใบสมัคร"
      sub={`${application.templeNameTh} · ${application.contactEmail}`}
      onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="danger" disabled={busy} onClick={() => void save()}>{busy ? "กำลังปฏิเสธ…" : "ยืนยันปฏิเสธ"}</Button></>}
    >
      <div className="field">
        <label>เหตุผล (บันทึกไว้ตรวจสอบย้อนหลัง)</label>
        <input className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ข้อมูลไม่ครบถ้วน" aria-invalid={fieldErr ? true : undefined} />
        {fieldErr ? <p className="error-text">{fieldErr}</p> : null}
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </Modal>
  );
}
