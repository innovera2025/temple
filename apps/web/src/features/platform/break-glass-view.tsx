import { ReactElement, useEffect, useState } from "react";
import { BREAK_GLASS_DEFAULT_TTL_MINUTES, formatSatang, validateBreakGlassOpen } from "@wat/shared";
import { Badge, Button, Card, Modal } from "../../design-system";
import { Icon } from "../../layout/icons";
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

  const isActive = (g: BreakGlassGrantRecord): boolean =>
    !g.revokedAt && new Date(g.expiresAt).getTime() > Date.now();

  /** Minutes remaining for an active grant, rounded down. */
  const minutesLeft = (g: BreakGlassGrantRecord): number =>
    Math.max(0, Math.floor((new Date(g.expiresAt).getTime() - Date.now()) / 60000));

  return (
    <div className="content-wrap">

      {/* ── Page header ── */}
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Icon name="lock" size={13} />
            เครื่องมือแพลตฟอร์ม
          </div>
          <h1>เข้าถึงข้อมูลวัด (Break-glass)</h1>
          <p className="desc">
            เปิดสิทธิ์ชั่วคราวสำหรับอ่านข้อมูลสรุปของวัดหนึ่ง ๆ
            — กำหนดเวลาอัตโนมัติ และทุกการเข้าถึงถูกบันทึกใน Audit log เสมอ
          </p>
        </div>
      </div>

      {/* ── Caution banner ── */}
      <div className="bg-caution-banner" role="note" aria-label="คำเตือนการเข้าถึงข้อมูล">
        <span className="bg-caution-icon">
          <Icon name="alert" size={20} />
        </span>
        <div className="bg-caution-body">
          <p className="bg-caution-title">การกระทำนี้ถูกบันทึกและตรวจสอบได้ทุกครั้ง</p>
          <p className="bg-caution-text">
            สิทธิ์ที่เปิดจะหมดอายุโดยอัตโนมัติตามเวลาที่กำหนด
            คุณไม่สามารถแก้ไขหรือลบข้อมูลใด ๆ ของวัดผ่านเครื่องมือนี้ได้
            ข้อมูล tenantId ผู้เปิดสิทธิ์ เหตุผล และเวลาทุกรายการจะถูกจัดเก็บใน Audit log ถาวร
          </p>
          <div className="bg-caution-pills">
            <span className="bg-caution-pill"><Icon name="clock" size={11} />มีกำหนดเวลา</span>
            <span className="bg-caution-pill"><Icon name="eye" size={11} />อ่านอย่างเดียว</span>
            <span className="bg-caution-pill"><Icon name="audit" size={11} />บันทึก Audit log ทันที</span>
            <span className="bg-caution-pill"><Icon name="lock" size={11} />ยกเลิกได้ทุกเมื่อ</span>
          </div>
        </div>
      </div>

      {/* ── Global error ── */}
      {error ? (
        <p
          className="auth-error"
          role="alert"
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}
        >
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : null}

      {/* ── Open new grant card ── */}
      <Card className="bg-open-card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <h3>เปิดสิทธิ์เข้าถึงใหม่</h3>
            <div className="sub">ระบุรหัสวัด · เหตุผล · ระยะเวลา — บันทึกลง Audit log ทันทีที่ยืนยัน</div>
          </div>
          <span className="bg-caution-pill" style={{ flexShrink: 0 }}>
            <Icon name="lock" size={11} />
            สิทธิ์อ่านเท่านั้น
          </span>
        </div>

        <div style={{ padding: "18px 18px 0" }}>
          <div className="form-grid" style={{ marginBottom: 0 }}>
            <div className="field">
              <label htmlFor="bg-tenant-id">
                รหัสวัด <span className="muted" style={{ fontWeight: 400 }}>(tenantId)</span>
              </label>
              <input
                id="bg-tenant-id"
                className="control mono"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={fieldErr.tenantId ? true : undefined}
              />
              {fieldErr.tenantId ? <p className="error-text">{fieldErr.tenantId}</p> : null}
            </div>

            <div className="field">
              <label htmlFor="bg-ttl">
                ระยะเวลา <span className="muted" style={{ fontWeight: 400 }}>(นาที)</span>
              </label>
              <input
                id="bg-ttl"
                className="control tnum"
                value={ttl}
                onChange={(e) => setTtl(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                aria-invalid={fieldErr.ttlMinutes ? true : undefined}
              />
              {fieldErr.ttlMinutes ? (
                <p className="error-text">{fieldErr.ttlMinutes}</p>
              ) : (
                <p className="bg-hint">
                  <Icon name="clock" size={11} />
                  หมดอายุอัตโนมัติหลัง {ttl || "?"} นาที
                </p>
              )}
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="bg-reason">
              เหตุผล <span className="muted" style={{ fontWeight: 400 }}>(บันทึกตรวจสอบ — จำเป็น)</span>
            </label>
            <input
              id="bg-reason"
              className="control"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ตรวจสอบปัญหาที่วัดแจ้งมาทาง support ticket #1234"
              aria-invalid={fieldErr.reason ? true : undefined}
            />
            {fieldErr.reason ? <p className="error-text">{fieldErr.reason}</p> : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderTop: "1px solid var(--border)",
            marginTop: 6,
          }}
        >
          <p className="bg-hint" style={{ margin: 0 }}>
            <Icon name="info" size={11} />
            การดำเนินการนี้จะถูกบันทึกพร้อมชื่อบัญชีของคุณทันที
          </p>
          <Button
            variant="danger"
            size="md"
            icon={<Icon name="lock" size={14} />}
            disabled={busy}
            onClick={() => void open()}
          >
            {busy ? "กำลังเปิดสิทธิ์…" : "เปิดสิทธิ์เข้าถึง"}
          </Button>
        </div>
      </Card>

      {/* ── Existing grants table ── */}
      <Card>
        <div className="card-head">
          <div>
            <h3>สิทธิ์เข้าถึงที่มีอยู่</h3>
            <div className="sub">เรียงจากล่าสุด — สิทธิ์ที่ใช้งานได้แสดงเวลาคงเหลือ</div>
          </div>
          {grants && grants.filter(isActive).length > 0 ? (
            <Badge kind="pending" dot sq>
              {grants.filter(isActive).length} รายการ ใช้งานอยู่
            </Badge>
          ) : null}
        </div>

        <div className="t-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>รหัสวัด</th>
                <th>เหตุผล</th>
                <th>เวลาคงเหลือ / หมดอายุ</th>
                <th>สถานะ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!grants ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "28px 14px" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Icon name="clock" size={15} />
                      {error ? "โหลดไม่สำเร็จ — กรุณาลองใหม่" : "กำลังโหลด…"}
                    </span>
                  </td>
                </tr>
              ) : grants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "28px 14px" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Icon name="checkCircle" size={15} />
                      ยังไม่มีสิทธิ์เข้าถึงที่บันทึกไว้
                    </span>
                  </td>
                </tr>
              ) : (
                grants.map((g) => {
                  const active = isActive(g);
                  const minsLeft = active ? minutesLeft(g) : 0;
                  return (
                    <tr key={g.id} style={active ? { background: "var(--danger-tint)" } : undefined}>
                      <td>
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                          {g.tenantId}
                        </span>
                      </td>
                      <td style={{ maxWidth: 260, color: "var(--ink-2)", fontSize: 13 }}>
                        {g.reason}
                      </td>
                      <td className="bg-exp-cell">
                        {active ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span className="bg-ttl-chip">
                              <Icon name="clock" size={11} />
                              เหลือ ~{minsLeft} นาที
                            </span>
                            <span className="muted" style={{ fontSize: 11 }}>
                              ถึง {g.expiresAt.replace("T", " ").slice(0, 16)}
                            </span>
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {g.expiresAt.replace("T", " ").slice(0, 16)}
                          </span>
                        )}
                      </td>
                      <td>
                        {g.revokedAt ? (
                          <Badge kind="neutral" dot>ยกเลิกแล้ว</Badge>
                        ) : active ? (
                          <Badge kind="pending" dot>ใช้งานได้</Badge>
                        ) : (
                          <Badge kind="void" dot>หมดอายุ</Badge>
                        )}
                      </td>
                      <td>
                        {active ? (
                          <div className="bg-row-actions">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Icon name="eye" size={12} />}
                              disabled={busyId === g.id}
                              onClick={() => void viewSnapshot(g.id)}
                            >
                              ดูข้อมูล
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              icon={<Icon name="x" size={12} />}
                              disabled={busyId === g.id}
                              onClick={() => void revoke(g.id)}
                            >
                              ยกเลิกสิทธิ์
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Snapshot modal ── */}
      {snapshot ? (
        <Modal
          title={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="building" size={16} />
              สรุปข้อมูลวัด
            </span>
          }
          sub={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="mono" style={{ fontSize: 12 }}>{snapshot.tenant.nameTh}</span>
              <span className="muted">·</span>
              <span className="mono muted" style={{ fontSize: 11 }}>{snapshot.tenant.slug}</span>
            </span>
          }
          onClose={() => setSnapshot(null)}
          footer={
            <Button variant="secondary" onClick={() => setSnapshot(null)}>
              ปิด
            </Button>
          }
        >
          <dl className="bg-snapshot-dl">
            <dt>สถานะวัด</dt>
            <dd>{snapshot.tenant.status}</dd>
            <dt>ผู้บริจาค</dt>
            <dd className="tnum">{snapshot.counts.donors.toLocaleString()} ราย</dd>
            <dt>การบริจาค</dt>
            <dd className="tnum">{snapshot.counts.donations.toLocaleString()} รายการ</dd>
            <dt>ใบอนุโมทนา</dt>
            <dd className="tnum">{snapshot.counts.receipts.toLocaleString()} ใบ</dd>
            <dt>รายการบัญชี</dt>
            <dd className="tnum">{snapshot.counts.ledgerEntries.toLocaleString()} รายการ</dd>
            <dt>ยอดบริจาครวม</dt>
            <dd className="tnum money credit">{formatSatang(snapshot.donationTotalSatang)} บาท</dd>
          </dl>

          {snapshot.recentReceipts.length > 0 ? (
            <>
              <p className="bg-snapshot-receipts-head">
                <Icon name="receipt" size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
                ใบอนุโมทนาล่าสุด
              </p>
              <ul className="bg-snapshot-receipt-list">
                {snapshot.recentReceipts.map((r) => (
                  <li key={r.receiptNo}>
                    <span className="mono" style={{ fontSize: 12 }}>{r.receiptNo}</span>
                    <span className="muted">·</span>
                    <span className="tnum" style={{ fontSize: 12 }}>{r.issuedAt.slice(0, 10)}</span>
                    <span className="muted">·</span>
                    <Badge kind={r.status === "issued" ? "credit" : "void"} sq>{r.status}</Badge>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div
            style={{
              marginTop: 16,
              padding: "9px 12px",
              background: "var(--danger-tint)",
              border: "1px solid rgba(176,57,44,0.18)",
              borderRadius: "var(--r)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--danger)",
            }}
          >
            <Icon name="audit" size={13} />
            การเข้าถึงครั้งนี้ถูกบันทึกใน Audit log เรียบร้อยแล้ว
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
