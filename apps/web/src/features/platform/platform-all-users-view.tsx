import { ReactElement, useEffect, useMemo, useState } from "react";
import { MIN_PASSWORD_LENGTH, PLATFORM_ROLE_LABELS_TH, TENANT_ROLE_LABELS_TH } from "@wat/shared";
import { Badge, Button, Card, Modal } from "../../design-system";
import { platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";

type Kind = "platform" | "tenant" | "devotee";

interface UserRow {
  kind: Kind;
  id: string;
  email: string;
  displayName: string;
  meta: string;
  isActive: boolean;
}

const KIND_LABELS: Record<Kind, string> = { platform: "แพลตฟอร์ม", tenant: "เจ้าหน้าที่วัด", devotee: "ญาติโยม" };
const KIND_BADGE: Record<Kind, "reconciled" | "pending" | "credit"> = { platform: "reconciled", tenant: "pending", devotee: "credit" };
const FILTERS: Array<{ value: "" | Kind; label: string }> = [
  { value: "", label: "ทั้งหมด" },
  { value: "platform", label: "แพลตฟอร์ม" },
  { value: "tenant", label: "เจ้าหน้าที่วัด" },
  { value: "devotee", label: "ญาติโยม" },
];
const LIMITS = [25, 50, 100];

/** Every account that can sign into the system, in one place: Innovera team,
 *  temple staff, and devotees — search, filter, and manage (reset password,
 *  enable/disable for platform + devotee accounts). Temple-staff enable/disable
 *  stays with the temple; the platform owner can still reset their password. */
export function PlatformAllUsersView({ api, token, canWrite, onUnauthorized }: PlatformViewProps): ReactElement {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);

  // Manage modal state
  const [manage, setManage] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalErr, setModalErr] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    Promise.allSettled([api.listPlatformUsers(token), api.listTenantUsers(token), api.listDevotees(token)])
      .then(([pu, tu, dv]) => {
        if (cancelled) return;
        if ([pu, tu, dv].some((r) => r.status === "rejected" && on401((r as PromiseRejectedResult).reason, onUnauthorized))) return;
        const out: UserRow[] = [];
        if (pu.status === "fulfilled") for (const u of pu.value) out.push({ kind: "platform", id: u.id, email: u.email, displayName: u.displayName, meta: PLATFORM_ROLE_LABELS_TH[u.platformRole] ?? u.platformRole, isActive: u.isActive });
        if (tu.status === "fulfilled") for (const u of tu.value) out.push({ kind: "tenant", id: u.id, email: u.email, displayName: u.displayName, meta: `${TENANT_ROLE_LABELS_TH[u.role] ?? u.role} · วัด ${u.tenantId.slice(0, 8)}`, isActive: u.isActive });
        if (dv.status === "fulfilled") for (const u of dv.value) out.push({ kind: "devotee", id: u.id, email: u.email, displayName: u.displayName, meta: "ญาติโยม", isActive: u.isActive });
        setRows(out);
        const failed = [pu, tu, dv].filter((r) => r.status === "rejected");
        if (failed.length > 0) setError(platformErrorMessage((failed[0] as PromiseRejectedResult).reason));
      })
      .catch((err) => {
        if (!cancelled && !on401(err, onUnauthorized)) setError(platformErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, reloadKey, onUnauthorized]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => (!kind || r.kind === kind) && (!term || r.email.toLowerCase().includes(term) || r.displayName.toLowerCase().includes(term)),
    );
  }, [rows, kind, query]);
  const visible = filtered.slice(0, limit);

  function openManage(row: UserRow): void {
    setManage(row);
    setNewPassword("");
    setModalErr("");
    setDoneMsg("");
  }

  async function run(fn: () => Promise<unknown>, okMsg: string): Promise<void> {
    setBusy(true);
    setModalErr("");
    setDoneMsg("");
    try {
      await fn();
      setDoneMsg(okMsg);
      reload();
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setModalErr(platformErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(): Promise<void> {
    if (!manage) return;
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setModalErr(`รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
      return;
    }
    const id = manage.id;
    const call =
      manage.kind === "platform" ? () => api.resetPlatformUserPassword(token, id, newPassword)
      : manage.kind === "tenant" ? () => api.resetTenantUserPassword(token, id, newPassword)
      : () => api.resetDevoteePassword(token, id, newPassword);
    await run(call, "ตั้งรหัสผ่านชั่วคราวใหม่แล้ว — เซสชันเดิมถูกตัด ผู้ใช้ต้องเข้าสู่ระบบด้วยรหัสใหม่");
    setNewPassword("");
  }

  async function toggleActive(): Promise<void> {
    if (!manage || manage.kind === "tenant") return;
    const id = manage.id;
    const active = manage.isActive;
    const call =
      manage.kind === "platform"
        ? () => (active ? api.disablePlatformUser(token, id) : api.enablePlatformUser(token, id))
        : () => (active ? api.disableDevotee(token, id) : api.enableDevotee(token, id));
    await run(call, active ? "ปิดบัญชีแล้ว" : "เปิดบัญชีแล้ว");
    setManage((m) => (m ? { ...m, isActive: !active } : m));
  }

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">จัดการ</div>
          <h1>ผู้ใช้ทั้งหมด</h1>
          <p className="desc">ทุกบัญชีที่เข้าใช้งานระบบ — ทีมแพลตฟอร์ม เจ้าหน้าที่วัด และญาติโยม</p>
        </div>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <Card>
        <div className="card-head">
          <div className="seg" role="tablist" aria-label="กรองประเภทผู้ใช้">
            {FILTERS.map((f) => (
              <button key={f.value || "all"} type="button" role="tab" aria-selected={kind === f.value} className={kind === f.value ? "active" : ""} onClick={() => setKind(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <input className="control" style={{ maxWidth: 240 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาอีเมล / ชื่อ" aria-label="ค้นหาผู้ใช้" />
        </div>
        <div className="t-scroll">
          <table className="tbl">
            <thead>
              <tr><th>ประเภท</th><th>ชื่อ</th><th>อีเมล</th><th>บทบาท / สังกัด</th><th>สถานะ</th><th /></tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>ไม่พบผู้ใช้</td></tr>
              ) : (
                visible.map((r) => (
                  <tr key={`${r.kind}:${r.id}`}>
                    <td><Badge kind={KIND_BADGE[r.kind]} sq>{KIND_LABELS[r.kind]}</Badge></td>
                    <td>{r.displayName}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.email}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{r.meta}</td>
                    <td>{r.isActive ? <Badge kind="credit" dot>ใช้งาน</Badge> : <Badge kind="void" dot>ปิดใช้งาน</Badge>}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {canWrite ? <Button variant="secondary" size="sm" onClick={() => openManage(r)}>จัดการ</Button> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {rows ? (
          <div className="between" style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              แสดง {visible.length} จาก {filtered.length} บัญชี (ทั้งหมด {rows.length} · ใช้งานอยู่ {rows.filter((r) => r.isActive).length})
            </p>
            <label className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
              แสดงต่อหน้า
              <select className="control" style={{ width: 90 }} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
                <option value={100000}>ทั้งหมด</option>
              </select>
            </label>
          </div>
        ) : null}
      </Card>

      {manage ? (
        <Modal
          title="จัดการผู้ใช้"
          sub={`${manage.displayName} · ${KIND_LABELS[manage.kind]}`}
          onClose={() => setManage(null)}
          footer={<Button variant="secondary" onClick={() => setManage(null)}>ปิด</Button>}
        >
          <dl className="dl" style={{ marginBottom: 16 }}>
            <dt>อีเมล</dt><dd className="mono" style={{ fontSize: 13 }}>{manage.email}</dd>
            <dt>บทบาท / สังกัด</dt><dd>{manage.meta}</dd>
            <dt>สถานะ</dt><dd>{manage.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</dd>
          </dl>

          {doneMsg ? <div className="auth-success" role="status"><p>{doneMsg}</p></div> : null}
          {modalErr ? <p className="auth-error" role="alert">{modalErr}</p> : null}

          <div className="field">
            <label htmlFor="reset-pw">ตั้งรหัสผ่านชั่วคราวใหม่</label>
            <input
              id="reset-pw"
              className="control"
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
              autoComplete="off"
            />
            <p className="hint">ผู้ใช้จะถูกตัดเซสชันและต้องเข้าสู่ระบบใหม่ด้วยรหัสนี้ แล้วเปลี่ยนเองภายหลัง</p>
          </div>
          <Button variant="primary" disabled={busy} onClick={() => void resetPassword()}>
            {busy ? "กำลังบันทึก…" : "รีเซ็ตรหัสผ่าน"}
          </Button>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            {manage.kind === "tenant" ? (
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>การเปิด/ปิดบัญชีเจ้าหน้าที่วัด จัดการที่หน้าผู้ใช้ของวัดนั้น</p>
            ) : (
              <Button variant={manage.isActive ? "danger" : "secondary"} disabled={busy} onClick={() => void toggleActive()}>
                {manage.isActive ? "ปิดใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
              </Button>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
