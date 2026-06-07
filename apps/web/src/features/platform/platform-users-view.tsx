import { ReactElement, useEffect, useState } from "react";
import { PLATFORM_ROLE_LABELS_TH, type PlatformRole } from "@wat/shared";
import { Badge, Button, Card } from "../../design-system";
import { PlatformUserRecord, platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";

export function PlatformUsersView({ api, token, canWrite, onUnauthorized }: PlatformViewProps): ReactElement {
  const [rows, setRows] = useState<PlatformUserRecord[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    api
      .listPlatformUsers(token)
      .then((r) => !cancelled && setRows(r))
      .catch((err) => {
        if (cancelled || on401(err, onUnauthorized)) return;
        setError(platformErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, reloadKey, onUnauthorized]);

  async function toggle(u: PlatformUserRecord): Promise<void> {
    setBusyId(u.id);
    setError("");
    try {
      if (u.isActive) await api.disablePlatformUser(token, u.id);
      else await api.enablePlatformUser(token, u.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setError(platformErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">จัดการ</div>
          <h1>ผู้ใช้แพลตฟอร์ม</h1>
          <p className="desc">ทีมงาน Innovera (ผู้ดูแลระบบสูงสุด / ทีมสนับสนุน) — เปิดหรือปิดการใช้งานบัญชี</p>
        </div>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <Card>
        <div className="t-scroll">
          <table className="tbl">
            <thead>
              <tr><th>อีเมล</th><th>ชื่อ</th><th>บทบาท</th><th>สถานะ</th><th /></tr>
            </thead>
            <tbody>
              {!rows ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>ไม่มีผู้ใช้แพลตฟอร์ม</td></tr>
              ) : (
                rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.displayName}</td>
                    <td className="muted">{PLATFORM_ROLE_LABELS_TH[u.platformRole as PlatformRole] ?? u.platformRole}</td>
                    <td>{u.isActive ? <Badge kind="credit" dot>ใช้งาน</Badge> : <Badge kind="void" dot>ปิดใช้งาน</Badge>}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {canWrite ? (
                        <Button variant={u.isActive ? "tertiary" : "primary"} size="sm" disabled={busyId === u.id} onClick={() => void toggle(u)}>
                          {busyId === u.id ? "…" : u.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                        </Button>
                      ) : null}
                    </td>
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
