import { ReactElement, useEffect, useState } from "react";
import { APPLICATION_STATUS_LABELS_TH, TEMPLE_STATUS_LABELS_TH, type TempleStatus } from "@wat/shared";
import { Badge, Card } from "../../design-system";
import { Icon, type IconName } from "../../layout/icons";
import { ApplicationRecord, TempleRecord, platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";
import { PlatformPage } from "./platform-shell";

export interface PlatformDashboardProps extends PlatformViewProps {
  onGoto: (page: PlatformPage) => void;
}

function Kpi({ label, icon, value, foot, tone }: { label: string; icon: IconName; value: string; foot?: string; tone?: string }): ReactElement {
  return (
    <div className="kpi">
      <div className="k-label">
        <Icon name={icon} size={15} style={{ color: "var(--ink-3)" }} />
        {label}
      </div>
      <div className="k-value tnum" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {foot ? <div className="k-foot"><span>{foot}</span></div> : null}
    </div>
  );
}

const STATUS_BARS: { key: TempleStatus; color: string }[] = [
  { key: "active", color: "var(--credit)" },
  { key: "suspended", color: "var(--void)" },
  { key: "archived", color: "var(--neutral)" },
];

/** Innovera platform overview — KPIs, temple-status proportions, and the pending-application queue. */
export function PlatformDashboard({ api, token, onGoto, onUnauthorized }: PlatformDashboardProps): ReactElement {
  const [temples, setTemples] = useState<TempleRecord[] | null>(null);
  const [apps, setApps] = useState<ApplicationRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([api.listTemples(token), api.listApplications(token)])
      .then(([t, a]) => {
        if (cancelled) return;
        setTemples(t);
        setApps(a);
      })
      .catch((err) => {
        if (cancelled || on401(err, onUnauthorized)) return;
        setError(platformErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, onUnauthorized]);

  const loading = temples === null && !error;
  const count = (s: TempleStatus): number => (temples ?? []).filter((t) => t.status === s).length;
  const total = temples?.length ?? 0;
  const pendingApps = (apps ?? []).filter((a) => a.status === "pending");
  const v = (n: number): string => (loading ? "…" : String(n));

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">ภาพรวม</div>
          <h1>แดชบอร์ดแพลตฟอร์ม</h1>
          <p className="desc">สรุปจำนวนวัด สถานะ และใบสมัครที่รอการอนุมัติทั้งระบบ</p>
        </div>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <Kpi label="วัดทั้งหมด" icon="building" value={v(total)} foot="ในระบบ" />
        <Kpi label="วัดที่ใช้งาน" icon="checkCircle" value={v(count("active"))} foot="active" tone="credit" />
        <Kpi label="ใบสมัครรอตรวจสอบ" icon="file" value={v(pendingApps.length)} foot="pending" tone="pending" />
        <Kpi label="วัดที่ถูกระงับ" icon="lock" value={v(count("suspended"))} foot="suspended" tone="void" />
      </div>

      <div className="split-wide">
        <Card>
          <div className="card-head">
            <div><h3>ใบสมัครรอตรวจสอบ</h3><div className="sub">เรียงจากล่าสุด</div></div>
            <button type="button" className="link-btn" onClick={() => onGoto("applications")}>ดูทั้งหมด</button>
          </div>
          <div className="t-scroll">
            <table className="tbl">
              <thead><tr><th>วัด</th><th>อีเมลติดต่อ</th><th>ยื่นเมื่อ</th><th>สถานะ</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>กำลังโหลด…</td></tr>
                ) : pendingApps.length === 0 ? (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 20 }}>ไม่มีใบสมัครที่รอตรวจสอบ</td></tr>
                ) : (
                  pendingApps.slice(0, 6).map((a) => (
                    <tr key={a.id}>
                      <td>{a.templeNameTh}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{a.contactEmail}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{a.createdAt.slice(0, 10)}</td>
                      <td><Badge kind="pending" dot>{APPLICATION_STATUS_LABELS_TH.pending}</Badge></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="card-head"><div><h3>สัดส่วนสถานะวัด</h3><div className="sub">จากทั้งหมด {v(total)} วัด</div></div></div>
          <div className="card-pad">
            <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--void-tint)", marginBottom: 14 }}>
              {STATUS_BARS.map((b) =>
                total > 0 ? (
                  <div key={b.key} style={{ width: `${(count(b.key) / total) * 100}%`, background: b.color }} title={TEMPLE_STATUS_LABELS_TH[b.key]} />
                ) : null,
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {STATUS_BARS.map((b) => (
                <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                  <span style={{ flex: 1, color: "var(--ink-2)" }}>{TEMPLE_STATUS_LABELS_TH[b.key]}</span>
                  <span className="tnum" style={{ fontWeight: 600 }}>{v(count(b.key))}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
