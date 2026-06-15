import { ReactElement, useEffect, useState } from "react";
import { Badge, Card } from "../../design-system";
import { AuditLogRecord, platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";

const ACTION_LABELS_TH: Record<string, string> = {
  "platform_auth.login": "เข้าสู่ระบบ",
  "application.approved": "อนุมัติใบสมัครวัด",
  "application.rejected": "ปฏิเสธใบสมัครวัด",
  "temple.suspended": "ระงับวัด",
  "temple.resumed": "เปิดใช้งานวัดอีกครั้ง",
  "platform_user.disabled": "ปิดบัญชีผู้ใช้แพลตฟอร์ม",
  "platform_user.enabled": "เปิดบัญชีผู้ใช้แพลตฟอร์ม",
  "break_glass.opened": "เปิดสิทธิ์เข้าถึงข้อมูลวัด",
  "break_glass.revoked": "ยกเลิกสิทธิ์เข้าถึงข้อมูลวัด",
  "break_glass.accessed": "เข้าดูข้อมูลวัด (break-glass)",
  "tenant_directory.listed": "ดูรายชื่อผู้ใช้วัด",
};

/** Badge tone by the kind of action (destructive/sensitive vs routine). */
function actionBadge(action: string): ReactElement {
  const label = ACTION_LABELS_TH[action] ?? action;
  if (action.startsWith("break_glass") || action.endsWith(".suspended") || action.endsWith(".disabled") || action.endsWith(".rejected")) {
    return <Badge kind="void" dot>{label}</Badge>;
  }
  if (action.endsWith(".approved") || action.endsWith(".enabled") || action.endsWith(".resumed")) {
    return <Badge kind="credit" dot>{label}</Badge>;
  }
  return <Badge kind="neutral" dot>{label}</Badge>;
}

function detailOf(log: AuditLogRecord): string {
  const m = log.metadata ?? {};
  const parts: string[] = [];
  if (typeof m.reason === "string" && m.reason) parts.push(`เหตุผล: ${m.reason}`);
  if (typeof m.tenantId === "string" && m.tenantId) parts.push(`วัด: ${m.tenantId}`);
  if (log.entityId) parts.push(`#${log.entityId.slice(0, 8)}`);
  if (typeof m.ip === "string" && m.ip) parts.push(`IP ${m.ip}`);
  return parts.join(" · ");
}

/** Read-only platform-plane audit trail (ประวัติการใช้งาน) — every approve/reject,
 *  suspend/resume, break-glass, and user enable/disable, newest first. */
export function PlatformAuditView({ api, token, onUnauthorized }: PlatformViewProps): ReactElement {
  const [logs, setLogs] = useState<AuditLogRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    api
      .listAuditLogs(token)
      .then((r) => !cancelled && setLogs(r))
      .catch((err) => {
        if (cancelled || on401(err, onUnauthorized)) return;
        setError(platformErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">ระบบ</div>
          <h1>ประวัติการใช้งาน</h1>
          <p className="desc">บันทึกการดำเนินการของทีมแพลตฟอร์มทั้งหมด — อนุมัติ/ปฏิเสธ ระงับวัด เข้าถึงข้อมูล และจัดการบัญชี (ลบไม่ได้)</p>
        </div>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <Card>
        <div className="card-head">
          <div><h3>รายการล่าสุด</h3><div className="sub">เรียงจากล่าสุด · สูงสุด 200 รายการ</div></div>
          {logs ? <Badge kind="neutral" sq>{logs.length} รายการ</Badge> : null}
        </div>
        <div className="t-scroll">
          <table className="tbl">
            <thead>
              <tr><th>เวลา</th><th>ผู้ดำเนินการ</th><th>การกระทำ</th><th>รายละเอียด</th></tr>
            </thead>
            <tbody>
              {!logs ? (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>ยังไม่มีบันทึกการใช้งาน</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{log.createdAt.replace("T", " ").slice(0, 16)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{log.actorEmail ?? "—"}</td>
                    <td>{actionBadge(log.action)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{detailOf(log)}</td>
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
