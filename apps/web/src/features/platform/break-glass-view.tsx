import { ReactElement, useEffect, useState } from "react";
import { BREAK_GLASS_DEFAULT_TTL_MINUTES, formatSatang, validateBreakGlassOpen } from "@wat/shared";
import { Badge, Button, Card, Modal } from "../../design-system";
import { BreakGlassGrantRecord, TenantSnapshot, platformErrorMessage } from "./platform-auth";
import { PlatformViewProps, on401 } from "./platform-common";

/**
 * Break-glass: a time-boxed, audited grant to read a single tenant's data snapshot.
 * Both super_admin and support may use it (backend enforces), so no canWrite gate here.
 */
export function BreakGlassView({ api, token, onUnauthorized }: PlatformViewProps): ReactElement {
  const [grants, setGrants] = useState<BreakGlassGrantRecord[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);

  const [tenantId, setTenantId] = useState("");
  const [reason, setReason] = useState("");
  const [ttl, setTtl] = useState(String(BREAK_GLASS_DEFAULT_TTL_MINUTES));
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<TenantSnapshot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGrants(null);
    setError("");
    api
      .listGrants(token)
      .then((r) => !cancelled && setGrants(r))
      .catch((err) => {
        if (cancelled || on401(err, onUnauthorized)) return;
        setError(platformErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, reloadKey, onUnauthorized]);

  async function open(): Promise<void> {
    setFieldErr({});
    setError("");
    const result = validateBreakGlassOpen({ tenantId: tenantId.trim(), reason: reason.trim(), ttlMinutes: Number(ttl) });
    if (!result.success) {
      setFieldErr(Object.fromEntries(result.errors.map((e) => [e.field, e.message])));
      return;
    }
    setBusy(true);
    try {
      await api.openBreakGlass(token, result.data);
      setReason("");
      reload();
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setError(platformErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    setBusyId(id);
    setError("");
    try {
      await api.revokeGrant(token, id);
      reload();
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setError(platformErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function viewSnapshot(id: string): Promise<void> {
    setBusyId(id);
    setError("");
    try {
      setSnapshot(await api.tenantSnapshot(token, id));
    } catch (err) {
      if (on401(err, onUnauthorized)) return;
      setError(platformErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const isActive = (g: BreakGlassGrantRecord): boolean => !g.revokedAt && new Date(g.expiresAt).getTime() > Date.now();

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">เครื่องมือ</div>
          <h1>เข้าถึงข้อมูลวัด (break-glass)</h1>
          <p className="desc">เปิดสิทธิ์ชั่วคราวเพื่อดูสรุปข้อมูลของวัดหนึ่ง ๆ — มีกำหนดเวลาและบันทึกการเข้าถึงเสมอ</p>
        </div>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <Card style={{ marginBottom: 16 }}>
        <div className="card-head"><div><h3>เปิดสิทธิ์เข้าถึงใหม่</h3><div className="sub">ระบุรหัสวัด (tenantId) + เหตุผล + ระยะเวลา</div></div></div>
        <div className="form-grid">
          <div className="field"><label>รหัสวัด (tenantId)</label><input className="control" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="uuid ของวัด" aria-invalid={fieldErr.tenantId ? true : undefined} />{fieldErr.tenantId ? <p className="error-text">{fieldErr.tenantId}</p> : null}</div>
          <div className="field"><label>ระยะเวลา (นาที)</label><input className="control tnum" value={ttl} onChange={(e) => setTtl(e.target.value.replace(/[^0-9]/g, ""))} aria-invalid={fieldErr.ttlMinutes ? true : undefined} />{fieldErr.ttlMinutes ? <p className="error-text">{fieldErr.ttlMinutes}</p> : null}</div>
        </div>
        <div className="field"><label>เหตุผล (บันทึกตรวจสอบ)</label><input className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ตรวจสอบปัญหาที่วัดแจ้ง" aria-invalid={fieldErr.reason ? true : undefined} />{fieldErr.reason ? <p className="error-text">{fieldErr.reason}</p> : null}</div>
        <Button variant="primary" disabled={busy} onClick={() => void open()}>{busy ? "กำลังเปิดสิทธิ์…" : "เปิดสิทธิ์เข้าถึง"}</Button>
      </Card>

      <Card>
        <div className="card-head"><div><h3>สิทธิ์เข้าถึงที่มีอยู่</h3><div className="sub">เรียงจากล่าสุด</div></div></div>
        <div className="t-scroll">
          <table className="tbl">
            <thead><tr><th>รหัสวัด</th><th>เหตุผล</th><th>หมดอายุ</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {!grants ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : grants.length === 0 ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>ยังไม่มีสิทธิ์เข้าถึง</td></tr>
              ) : (
                grants.map((g) => (
                  <tr key={g.id}>
                    <td className="mono muted" style={{ fontSize: 12 }}>{g.tenantId}</td>
                    <td>{g.reason}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{g.expiresAt.replace("T", " ").slice(0, 16)}</td>
                    <td>{g.revokedAt ? <Badge kind="neutral" dot>ยกเลิกแล้ว</Badge> : isActive(g) ? <Badge kind="credit" dot>ใช้งานได้</Badge> : <Badge kind="void" dot>หมดอายุ</Badge>}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {isActive(g) ? (
                        <>
                          <Button variant="secondary" size="sm" disabled={busyId === g.id} onClick={() => void viewSnapshot(g.id)}>ดูข้อมูล</Button>{" "}
                          <Button variant="tertiary" size="sm" disabled={busyId === g.id} onClick={() => void revoke(g.id)}>ยกเลิก</Button>
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

      {snapshot ? (
        <Modal title="สรุปข้อมูลวัด" sub={`${snapshot.tenant.nameTh} · ${snapshot.tenant.slug}`} onClose={() => setSnapshot(null)} footer={<Button variant="secondary" onClick={() => setSnapshot(null)}>ปิด</Button>}>
          <dl className="devotee-info-list">
            <div className="devotee-info-row"><dt>สถานะวัด</dt><dd>{snapshot.tenant.status}</dd></div>
            <div className="devotee-info-row"><dt>ผู้บริจาค</dt><dd className="tnum">{snapshot.counts.donors}</dd></div>
            <div className="devotee-info-row"><dt>การบริจาค</dt><dd className="tnum">{snapshot.counts.donations}</dd></div>
            <div className="devotee-info-row"><dt>ใบอนุโมทนา</dt><dd className="tnum">{snapshot.counts.receipts}</dd></div>
            <div className="devotee-info-row"><dt>รายการบัญชี</dt><dd className="tnum">{snapshot.counts.ledgerEntries}</dd></div>
            <div className="devotee-info-row"><dt>ยอดบริจาครวม</dt><dd className="tnum">{formatSatang(snapshot.donationTotalSatang)} บาท</dd></div>
          </dl>
          {snapshot.recentReceipts.length > 0 ? (
            <>
              <h4 style={{ margin: "12px 0 6px" }}>ใบอนุโมทนาล่าสุด</h4>
              <ul className="muted" style={{ paddingLeft: 18, margin: 0 }}>
                {snapshot.recentReceipts.map((r) => (
                  <li key={r.receiptNo}>{r.receiptNo} · {r.issuedAt.slice(0, 10)} · {r.status}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
