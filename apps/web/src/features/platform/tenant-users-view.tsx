import { ReactElement, useEffect, useState } from "react";
import { TENANT_ROLE_LABELS_TH, type TenantRole } from "@wat/shared";
import { Badge, Card } from "../../design-system";
import { TenantUserRecord, TenantUsersFilter, platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";

const ROLE_FILTERS: Array<{ value: "" | TenantRole; label: string }> = [
  { value: "", label: "ทุกบทบาท" },
  { value: "admin", label: "ผู้ดูแลวัด" },
  { value: "finance", label: "การเงิน" },
  { value: "staff", label: "เจ้าหน้าที่" },
];

export function TenantUsersView({ api, token, onUnauthorized }: PlatformViewProps): ReactElement {
  const [role, setRole] = useState<"" | TenantRole>("");
  const [email, setEmail] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [rows, setRows] = useState<TenantUserRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    const filter: TenantUsersFilter = {
      ...(role ? { role } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    };
    api
      .listTenantUsers(token, filter)
      .then((r) => !cancelled && setRows(r))
      .catch((err) => {
        if (cancelled || on401(err, onUnauthorized)) return;
        setError(platformErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, role, email, activeOnly, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">จัดการ</div>
          <h1>ผู้ใช้วัดทั้งหมด</h1>
          <p className="desc">ไดเรกทอรีผู้ใช้งานของทุกวัดในระบบ (ผู้ดูแล/การเงิน/เจ้าหน้าที่) — ค้นหาและตรวจสอบข้ามวัด</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div className="seg" role="tablist" aria-label="กรองบทบาท">
          {ROLE_FILTERS.map((f) => (
            <button key={f.value || "all"} type="button" role="tab" aria-selected={role === f.value} className={role === f.value ? "active" : ""} onClick={() => setRole(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="control" style={{ maxWidth: 240 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ค้นหาอีเมล…" aria-label="ค้นหาอีเมล" />
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> เฉพาะที่ใช้งานอยู่
        </label>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <Card>
        <div className="t-scroll">
          <table className="tbl">
            <thead>
              <tr><th>อีเมล</th><th>ชื่อ</th><th>บทบาท</th><th>วัด (tenant)</th><th>สถานะ</th></tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>ไม่พบผู้ใช้ตามเงื่อนไข</td></tr>
              ) : (
                rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.displayName}</td>
                    <td className="muted">{TENANT_ROLE_LABELS_TH[u.role as TenantRole] ?? u.role}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{u.tenantId}</td>
                    <td>{u.isActive ? <Badge kind="credit" dot>ใช้งาน</Badge> : <Badge kind="void" dot>ปิดใช้งาน</Badge>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
