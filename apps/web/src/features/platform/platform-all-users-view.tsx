import { ReactElement, useEffect, useMemo, useState } from "react";
import { PLATFORM_ROLE_LABELS_TH, TENANT_ROLE_LABELS_TH } from "@wat/shared";
import { Badge, Button, Card } from "../../design-system";
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

const KIND_LABELS: Record<Kind, string> = {
  platform: "แพลตฟอร์ม",
  tenant: "เจ้าหน้าที่วัด",
  devotee: "ญาติโยม",
};
const KIND_BADGE: Record<Kind, "reconciled" | "pending" | "credit"> = {
  platform: "reconciled",
  tenant: "pending",
  devotee: "credit",
};
const FILTERS: Array<{ value: "" | Kind; label: string }> = [
  { value: "", label: "ทั้งหมด" },
  { value: "platform", label: "แพลตฟอร์ม" },
  { value: "tenant", label: "เจ้าหน้าที่วัด" },
  { value: "devotee", label: "ญาติโยม" },
];

/** Every account that can sign into the system, in one place: Innovera team,
 *  temple staff, and devotees. Toggle is available for platform + devotee
 *  accounts (the platform owner's to manage); temple staff are read-only here
 *  (managed by their temple, shown on หน้าผู้ใช้วัด). */
export function PlatformAllUsersView({ api, token, canWrite, onUnauthorized }: PlatformViewProps): ReactElement {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    Promise.allSettled([api.listPlatformUsers(token), api.listTenantUsers(token), api.listDevotees(token)])
      .then(([pu, tu, dv]) => {
        if (cancelled) return;
        if ([pu, tu, dv].some((r) => r.status === "rejected" && on401((r as PromiseRejectedResult).reason, onUnauthorized))) return;
        const out: UserRow[] = [];
        if (pu.status === "fulfilled") {
          for (const u of pu.value) out.push({ kind: "platform", id: u.id, email: u.email, displayName: u.displayName, meta: PLATFORM_ROLE_LABELS_TH[u.platformRole] ?? u.platformRole, isActive: u.isActive });
        }
        if (tu.status === "fulfilled") {
          for (const u of tu.value) out.push({ kind: "tenant", id: u.id, email: u.email, displayName: u.displayName, meta: `${TENANT_ROLE_LABELS_TH[u.role] ?? u.role} · วัด ${u.tenantId.slice(0, 8)}`, isActive: u.isActive });
        }
        if (dv.status === "fulfilled") {
          for (const u of dv.value) out.push({ kind: "devotee", id: u.id, email: u.email, displayName: u.displayName, meta: "ญาติโยม", isActive: u.isActive });
        }
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

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => (!kind || r.kind === kind) && (!term || r.email.toLowerCase().includes(term) || r.displayName.toLowerCase().includes(term)),
    );
  }, [rows, kind, query]);

  async function toggle(row: UserRow): Promise<void> {
    if (row.kind === "tenant") return; // managed by the temple, not here
    setBusyId(row.id);
    setError("");
    try {
      if (row.kind === "platform") {
        await (row.isActive ? api.disablePlatformUser(token, row.id) : api.enablePlatformUser(token, row.id));
      } else {
        await (row.isActive ? api.disableDevotee(token, row.id) : api.enableDevotee(token, row.id));
      }
      reload();
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setError(platformErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = (rows ?? []).filter((r) => r.isActive).length;

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
          <div className="auth-tabs" role="tablist">
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
                      {r.kind === "tenant" ? (
                        <span className="muted" style={{ fontSize: 11 }}>จัดการที่วัด</span>
                      ) : canWrite ? (
                        <Button variant={r.isActive ? "tertiary" : "secondary"} size="sm" disabled={busyId === r.id} onClick={() => void toggle(r)}>
                          {r.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {rows ? <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>ทั้งหมด {rows.length} บัญชี · ใช้งานอยู่ {activeCount}</p> : null}
      </Card>
    </div>
  );
}
