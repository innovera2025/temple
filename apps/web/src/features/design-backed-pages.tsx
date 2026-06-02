import { type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, SearchBox, Toolbar } from "../design-system";
import { Icon, type IconName } from "../layout/icons";
import type { PageId, TempleRole } from "../layout/nav";
import { type DashboardApi, type DashboardView, displayBaht, methodLabel, statusLabel } from "./dashboard/dashboard";
import { type LedgerApi, type LedgerEntryView, type LedgerSummaryView } from "./ledger/ledger";
import {
  type CeremoniesApi,
  type Ceremony,
  CEREMONY_TYPE_OPTIONS,
  ceremonyStatusLabel,
  ceremonyTypeLabel,
} from "./ceremonies/ceremonies";

/*
 * Design-backed temple-admin pages, ported faithfully from the design source of
 * truth (artifacts/user-provided/.../temple-admin/{screens-1,screens-2,screens-3}.jsx
 * + ds.css). These are static / client-side demo pages over the design's demo data
 * (data.jsx) — they do NOT call the API (temple + inventory are the API-backed pages
 * in page-content.tsx). The design's prototype `auditor` role is intentionally not
 * shown (the product role model is admin/finance/staff — see layout/nav.ts).
 */

const baht = (n: number): string => `฿${n.toLocaleString("th-TH")}`;

function Money({ value, kind }: { value: number; kind?: "in" | "ex" }): ReactElement {
  const cls = kind === "in" ? "credit" : kind === "ex" ? "debit" : "";
  return <span className={`money ${cls} tnum`.trim()}>{baht(value)}</span>;
}

function PageHead({ eyebrow, title, desc, actions }: { eyebrow: string; title: string; desc: string; actions?: ReactNode }): ReactElement {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="desc">{desc}</p>
      </div>
      {actions ? <div className="head-actions">{actions}</div> : null}
    </div>
  );
}

interface Delta {
  dir: "up" | "down";
  text: string;
}
function KPI({ label, icon, value, foot, delta, tone }: { label: string; icon?: IconName; value: string; foot?: string; delta?: Delta; tone?: string }): ReactElement {
  return (
    <div className="kpi">
      <div className="k-label">
        {icon ? <Icon name={icon} size={15} style={{ color: "var(--ink-3)" }} /> : null}
        {label}
      </div>
      <div className="k-value tnum" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      {delta || foot ? (
        <div className="k-foot">
          {delta ? <span className={`k-delta ${delta.dir}`}>{delta.dir === "up" ? "▲" : "▼"} {delta.text}</span> : null}
          {foot ? <span>{foot}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Table({ children }: { children: ReactNode }): ReactElement {
  return <div className="t-scroll"><table className="tbl">{children}</table></div>;
}

// ---- demo data (subset of the design's data.jsx) ----------------------------
const MONTHLY = [
  { m: "ม.ค.", in: 142, ex: 98 }, { m: "ก.พ.", in: 156, ex: 104 }, { m: "มี.ค.", in: 188, ex: 121 },
  { m: "เม.ย.", in: 171, ex: 96 }, { m: "พ.ค.", in: 210, ex: 138 }, { m: "มิ.ย.", in: 96, ex: 60 },
];
const FUNDS = [
  { name: "กองทุนบูรณะอุโบสถ", raised: 1248000, goal: 2000000 },
  { name: "กองทุนภัตตาหารพระสงฆ์", raised: 156000, goal: 200000 },
  { name: "กองทุนการศึกษาสามเณร", raised: 84000, goal: 200000 },
];
const UPCOMING = [
  { day: "12", title: "ทอดผ้าป่าสามัคคี บูรณะอุโบสถ", info: "09:00 · ศาลาการเปรียญ" },
  { day: "08", title: "ทำบุญตักบาตรวันพระ", info: "07:00 · ลานธรรม" },
  { day: "28", title: "พิธีอุปสมบทหมู่ ๙ รูป", info: "06:00 · อุโบสถ" },
];

// ============ 1. DASHBOARD ============
function IncomeExpenseChart(): ReactElement {
  const max = Math.max(...MONTHLY.map((m) => Math.max(m.in, m.ex)));
  return (
    <div>
      <div className="bars">
        {MONTHLY.map((m) => (
          <div className="bcol" key={m.m} style={{ flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
            <div className="bseg in" style={{ flex: 1, height: `${(m.in / max) * 100}%` }} />
            <div className="bseg ex" style={{ flex: 1, height: `${(m.ex / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="bars-x">{MONTHLY.map((m) => <span key={m.m}>{m.m}</span>)}</div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--ink-2)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--accent)" }} />รายรับ</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--debit)" }} />รายจ่าย</span>
        <span className="muted" style={{ marginLeft: "auto" }}>หน่วย: พันบาท</span>
      </div>
    </div>
  );
}

export function DesignDashboard({ api, goto }: { api?: DashboardApi; goto?: (page: PageId) => void }): ReactElement {
  // Real data from GET /dashboard. The 6-month chart, fund progress and upcoming events
  // have no API source yet, so those cards stay demo and are tagged "ตัวอย่าง" (honest).
  const [view, setView] = useState<DashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!api) return;
    let active = true;
    api.get().then(
      (value) => { if (active) setView(value); },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api]);

  const fin = view?.financial ?? null;
  const loading = !view && !error;
  const money = (value: string | undefined): string => (fin ? displayBaht(value ?? "0") : loading ? "…" : "—");
  const queueTasks: Array<{ icon: IconName; label: string; to: PageId; kind: "pending" | "reconciled"; count: number | null }> = [
    { icon: "receipt", label: "รอออกใบอนุโมทนาบัตร", to: "donations", kind: "pending", count: view?.awaitingReceiptCount ?? null },
    { icon: "ledger", label: "รายการรอกระทบยอด", to: "ledger", kind: "reconciled", count: view?.awaitingReconciliationCount ?? null },
  ];

  return (
    <div className="content-wrap">
      <PageHead eyebrow="ภาพรวม" title="แดชบอร์ด" desc="สรุปสถานะการเงิน การบริจาค และงานที่ต้องดำเนินการของวัด"
        actions={<>
          <Button variant="secondary" icon={<Icon name="download" size={15} />}>ส่งออกสรุป</Button>
          <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={() => goto?.("donations")}>บันทึกการบริจาค</Button>
        </>} />

      {error ? (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>
          โหลดข้อมูลแดชบอร์ดไม่สำเร็จ: {error}
        </div>
      ) : null}

      <div className="grid g-4" style={{ marginBottom: fin === null && view ? 8 : 16 }}>
        <KPI label="รับบริจาคเดือนนี้" icon="donation" value={money(fin?.incomeSatang)} foot={view ? `เดือน ${view.month}` : undefined} />
        <KPI label="รายจ่ายเดือนนี้" icon="ledger" value={money(fin?.expenseSatang)} foot={view ? `เดือน ${view.month}` : undefined} />
        <KPI label="ยอดคงเหลือทุกกองทุน" icon="building" value={money(fin?.balanceSatang)} foot={view ? `เดือน ${view.month}` : undefined} />
        <KPI label="ผู้บริจาคใหม่เดือนนี้" icon="donors" value={view ? String(view.newDonorsThisMonth) : loading ? "…" : "—"} foot="ราย" />
      </div>
      {fin === null && view ? (
        <p className="muted" style={{ marginBottom: 16, fontSize: 12.5 }}>* ข้อมูลการเงินแสดงเฉพาะผู้ดูแลวัดและฝ่ายการเงิน</p>
      ) : null}

      <div className="split-wide" style={{ marginBottom: 16 }}>
        <Card>
          <div className="card-head"><div><h3>รายรับ-รายจ่าย ๖ เดือนล่าสุด</h3><div className="sub">เปรียบเทียบแนวโน้ม</div></div>
            <Badge kind="neutral">ตัวอย่าง</Badge></div>
          <div className="card-pad"><IncomeExpenseChart /></div>
        </Card>
        <Card>
          <div className="card-head"><h3>งานที่ต้องดำเนินการ</h3></div>
          <div>
            {queueTasks.map((t, i) => (
              <button key={t.label} type="button" onClick={() => goto?.(t.to)} className="row clickable-row"
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "13px 18px", border: 0, borderBottom: i < queueTasks.length - 1 ? "1px solid var(--border)" : 0, background: "transparent", cursor: "pointer" }}>
                <span className="av" style={{ background: "var(--surface-3)", color: "var(--ink-2)" }}><Icon name={t.icon} size={17} /></span>
                <span style={{ flex: 1, fontSize: 13.5 }}>{t.label}</span>
                {t.count != null ? <Badge kind={t.kind}>{t.count}</Badge> : <span className="muted" style={{ fontSize: 12 }}>…</span>}
                <Icon name="chevR" size={15} style={{ color: "var(--ink-3)" }} />
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="split-wide">
        <Card>
          <div className="card-head"><div><h3>การบริจาคล่าสุด</h3><div className="sub">รายการที่บันทึกเข้าระบบ</div></div>
            <Button variant="tertiary" size="sm" icon={<Icon name="chevR" size={13} />} onClick={() => goto?.("donations")}>ดูทั้งหมด</Button></div>
          <Table>
            <thead><tr><th>วันที่</th><th>ผู้บริจาค</th><th>ช่องทาง</th><th className="num">จำนวน</th><th>สถานะ</th></tr></thead>
            <tbody>
              {!view ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : view.recentDonations.length === 0 ? (
                <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: "20px" }}>ยังไม่มีรายการบริจาคล่าสุด</td></tr>
              ) : (
                view.recentDonations.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => goto?.("donations")}>
                    <td>{d.donationDate}</td><td>{d.donorName}</td><td className="muted">{methodLabel(d.method)}</td>
                    <td className="num"><span className="money credit tnum">{displayBaht(d.amountSatang)}</span></td>
                    <td><Badge kind={d.status === "confirmed" ? "credit" : "pending"} dot>{statusLabel(d.status)}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        <div className="stack" style={{ gap: 16 }}>
          <Card>
            <div className="card-head"><h3>ความคืบหน้ากองทุน</h3><Badge kind="neutral">ตัวอย่าง</Badge></div>
            <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {FUNDS.map((f) => {
                const pct = Math.round((f.raised / f.goal) * 100);
                return (
                  <div key={f.name}>
                    <div className="between" style={{ marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</span><span className="muted tnum" style={{ fontSize: 12 }}>{pct}%</span></div>
                    <div className="prog"><i style={{ width: `${pct}%` }} /></div>
                    <div className="muted tnum" style={{ fontSize: 11.5, marginTop: 5 }}>{baht(f.raised)} / {baht(f.goal)}</div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card>
            <div className="card-head"><h3>กิจกรรมใกล้ถึง</h3><Badge kind="neutral">ตัวอย่าง</Badge></div>
            <div>
              {UPCOMING.map((e, i) => (
                <div key={e.title} style={{ display: "flex", gap: 12, padding: "12px 18px", borderBottom: i < UPCOMING.length - 1 ? "1px solid var(--border)" : 0, alignItems: "center" }}>
                  <div style={{ textAlign: "center", width: 42 }}><div className="tnum" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1 }}>{e.day}</div><div className="muted" style={{ fontSize: 11 }}>มิ.ย.</div></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div><div className="muted" style={{ fontSize: 12 }}>{e.info}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============ 2. DONATION INTAKE ============
const PRESETS = [100, 500, 1000, 2000, 5000, 10000];
const CHANNELS = ["เงินสด", "โอนธนาคาร", "พร้อมเพย์ / QR", "บัตรเครดิต", "เช็คธนาคาร"];

export function DesignDonations(): ReactElement {
  const [dtype, setDtype] = useState("บุคคล");
  const [fund, setFund] = useState(FUNDS[0]?.name ?? "");
  const [channel, setChannel] = useState("พร้อมเพย์ / QR");
  const [amount, setAmount] = useState("");
  const [issue, setIssue] = useState(true);
  const amt = parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0;
  const anon = dtype === "ไม่ประสงค์ออกนาม";

  return (
    <div className="content-wrap">
      <PageHead eyebrow="การบริจาค" title="บันทึกการบริจาค" desc="กรอกข้อมูลผู้บริจาคและจำนวนเงิน ระบบจะออกใบอนุโมทนาบัตรและบันทึกเข้าบัญชีรายรับโดยอัตโนมัติ" />
      <div className="split">
        <div>
          <Card pad style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 14 }}>ข้อมูลผู้บริจาค</h3>
            <div className="field"><span className="label">ประเภทผู้บริจาค</span>
              <div className="seg">{["บุคคล", "นิติบุคคล", "ไม่ประสงค์ออกนาม"].map((t) => (
                <button type="button" key={t} className={dtype === t ? "active" : ""} onClick={() => setDtype(t)}>{t}</button>
              ))}</div>
            </div>
            {!anon ? (
              <div className="form-grid">
                <label className="field full"><span className="label">{dtype === "นิติบุคคล" ? "ชื่อนิติบุคคล" : "ชื่อ-นามสกุล"}<span className="req"> *</span></span><input className="control" placeholder={dtype === "นิติบุคคล" ? "เช่น บริษัท ... จำกัด" : "เช่น คุณวิภา รัตนากร"} /></label>
                {dtype === "นิติบุคคล" ? <label className="field"><span className="label">เลขประจำตัวผู้เสียภาษี<span className="req"> *</span></span><input className="control tnum" placeholder="0-0000-00000-00-0" /></label> : null}
                <label className="field"><span className="label">เบอร์โทรศัพท์</span><input className="control tnum" placeholder="08x-xxx-xxxx" /></label>
                <label className="field"><span className="label">อีเมล</span><input className="control" placeholder="name@example.com" /></label>
                <label className="field full"><span className="label">ที่อยู่</span><span className="hint">ใช้สำหรับออกใบอนุโมทนาบัตรและลดหย่อนภาษี</span><textarea className="control" placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" /></label>
              </div>
            ) : null}
          </Card>

          <Card pad style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 14 }}>รายละเอียดการบริจาค</h3>
            <label className="field"><span className="label">กองทุน / วัตถุประสงค์</span><select className="control" value={fund} onChange={(e) => setFund(e.target.value)}>{FUNDS.map((f) => <option key={f.name}>{f.name}</option>)}</select></label>
            <div className="field"><span className="label">จำนวนเงิน<span className="req"> *</span></span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>{PRESETS.map((p) => <button type="button" key={p} className={`chip ${amt === p ? "active" : ""}`} onClick={() => setAmount(String(p))}>{baht(p)}</button>)}</div>
              <div className="input-prefix" style={{ maxWidth: 240 }}><span className="pfx">฿</span><input className="control tnum" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" /></div>
            </div>
            <div className="form-grid">
              <label className="field"><span className="label">ช่องทางการรับเงิน</span><select className="control" value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="field"><span className="label">วันที่รับบริจาค</span><input className="control tnum" defaultValue="2569-06-04" /></label>
            </div>
            <label className="field full"><span className="label">หมายเหตุ</span><textarea className="control" placeholder="บันทึกเพิ่มเติม (ถ้ามี)" style={{ minHeight: 64 }} /></label>
            <label className="opt" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={issue} onChange={(e) => setIssue(e.target.checked)} style={{ marginTop: 2 }} />
              <span><span className="o-title">ออกใบอนุโมทนาบัตรทันที</span><span className="o-desc" style={{ display: "block" }}>สร้างเอกสารและส่งให้ผู้บริจาคทางอีเมล</span></span>
            </label>
          </Card>

          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="primary" size="lg" icon={<Icon name="check" size={15} />}>บันทึกการบริจาค</Button>
            <Button variant="secondary" size="lg">บันทึกร่าง</Button>
          </div>
        </div>

        <div style={{ position: "sticky", top: 84 }}>
          <Card>
            <div className="card-head"><h3>สรุปรายการ</h3></div>
            <div className="card-pad">
              <div style={{ textAlign: "center", padding: "4px 0 16px", borderBottom: "1px dashed var(--border-2)", marginBottom: 16 }}>
                <div className="muted" style={{ fontSize: 12.5 }}>จำนวนเงินบริจาค</div>
                <div className="tnum" style={{ fontSize: 34, fontWeight: 600, color: "var(--accent)", lineHeight: 1.2 }}>{baht(amt)}</div>
              </div>
              {([["ผู้บริจาค", anon ? "ผู้ไม่ประสงค์ออกนาม" : "—"], ["ประเภท", anon ? "ไม่ระบุ" : dtype], ["กองทุน", fund], ["ช่องทาง", channel], ["วันที่", "๔ มิ.ย. ๒๕๖๙"], ["ใบอนุโมทนา", issue ? "ออกทันที" : "ยังไม่ออก"]] as Array<[string, string]>).map(([k, v]) => (
                <div className="between" key={k} style={{ padding: "7px 0", fontSize: 13.5 }}><span className="muted">{k}</span><span style={{ fontWeight: 500, textAlign: "right", maxWidth: 180 }}>{v}</span></div>
              ))}
            </div>
          </Card>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 14px", marginTop: 12, background: "var(--accent-tint-2)", border: "1px solid var(--accent-line)", borderRadius: "var(--r)", fontSize: 12.5, color: "var(--ink-2)" }}>
            <Icon name="info" size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
            <span>รายการนี้จะถูกบันทึกเข้าบัญชี <b>รายรับ</b> และลงในบันทึกการใช้งานโดยอัตโนมัติ</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 3. DONOR PROFILE ============
const DONOR_HIST = [
  { id: "RC-2569-0142", date: "๔ มิ.ย. ๒๕๖๙", fund: "กองทุนบูรณะอุโบสถ", amount: 5000 },
  { id: "RC-2569-0098", date: "๑๘ เม.ย. ๒๕๖๙", fund: "กองทุนบูรณะอุโบสถ", amount: 20000 },
  { id: "RC-2568-0512", date: "๓๑ ธ.ค. ๒๕๖๘", fund: "ทำบุญทั่วไป", amount: 3000 },
  { id: "RC-2568-0388", date: "๙ ต.ค. ๒๕๖๘", fund: "กองทุนภัตตาหารพระสงฆ์", amount: 10500 },
  { id: "RC-2568-0201", date: "๑๕ ก.ค. ๒๕๖๘", fund: "กองทุนบูรณะอุโบสถ", amount: 10000 },
];

export function DesignDonors({ canWrite, goto }: { canWrite: boolean; goto?: (page: PageId) => void }): ReactElement {
  return (
    <div className="content-wrap">
      <button type="button" onClick={() => goto?.("donors")} className="btn btn-tertiary btn-sm" style={{ marginBottom: 14, paddingLeft: 0 }}><Icon name="chevL" size={15} />ทะเบียนผู้บริจาค</button>
      <div className="split">
        <div>
          <Card pad style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="av lg">ว</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}><h2>คุณวิภา รัตนากร</h2><Badge kind="neutral">บุคคล</Badge></div>
                <div className="mono muted" style={{ fontSize: 12, marginTop: 3 }}>DNR-00118</div>
                <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}><Badge kind="accent">ผู้อุปถัมภ์</Badge><Badge kind="accent">บูรณะอุโบสถ</Badge></div>
              </div>
              {canWrite ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="secondary" size="sm" icon={<Icon name="edit" size={14} />}>แก้ไข</Button>
                  <Button variant="primary" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => goto?.("donations")}>บันทึกบริจาค</Button>
                </div>
              ) : null}
            </div>
          </Card>

          <div className="grid g-3" style={{ marginBottom: 16 }}>
            <KPI label="ยอดบริจาคสะสม" icon="donation" value="฿48,500" />
            <KPI label="จำนวนครั้ง" icon="receipt" value="9 ครั้ง" />
            <KPI label="บริจาคล่าสุด" icon="clock" value="๔ มิ.ย. ๒๕๖๙" />
          </div>

          <Card>
            <div className="card-head"><div><h3>ประวัติการบริจาค</h3><div className="sub">เรียงจากล่าสุด</div></div>
              <Button variant="tertiary" size="sm" icon={<Icon name="download" size={14} />}>ส่งออก</Button></div>
            <Table>
              <thead><tr><th>เลขที่ใบเสร็จ</th><th>วันที่</th><th>กองทุน</th><th className="num">จำนวน</th><th>สถานะ</th><th /></tr></thead>
              <tbody>{DONOR_HIST.map((h) => (
                <tr key={h.id} className="clickable" onClick={() => goto?.("receipt")}>
                  <td className="mono">{h.id}</td><td>{h.date}</td><td className="muted">{h.fund}</td>
                  <td className="num"><Money value={h.amount} kind="in" /></td>
                  <td><Badge kind="credit" dot>ออกใบแล้ว</Badge></td>
                  <td className="num"><Icon name="chevR" size={15} style={{ color: "var(--ink-3)" }} /></td>
                </tr>
              ))}</tbody>
            </Table>
          </Card>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Card>
            <div className="card-head"><h3>ข้อมูลติดต่อ</h3></div>
            <div className="card-pad">
              <dl className="dl" style={{ gridTemplateColumns: "92px 1fr" }}>
                <dt>เบอร์โทร</dt><dd>081-234-5678</dd>
                <dt>อีเมล</dt><dd style={{ wordBreak: "break-all" }}>wipha@example.com</dd>
                <dt>ที่อยู่</dt><dd style={{ fontWeight: 400, fontSize: 13 }}>112/4 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200</dd>
                <dt>ผู้บริจาคตั้งแต่</dt><dd>๒ พ.ค. ๒๕๖๖</dd>
              </dl>
            </div>
          </Card>
          <Card>
            <div className="card-head"><h3>เอกสารที่ออก</h3></div>
            <div>
              {DONOR_HIST.slice(0, 3).map((h, i, a) => (
                <button key={h.id} type="button" onClick={() => goto?.("receipt")} style={{ display: "flex", gap: 11, alignItems: "center", width: "100%", textAlign: "left", padding: "11px 18px", borderBottom: i < a.length - 1 ? "1px solid var(--border)" : 0, background: "transparent", border: "none", cursor: "pointer" }}>
                  <span className="av" style={{ background: "var(--surface-3)", color: "var(--ink-2)" }}><Icon name="receipt" size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>ใบอนุโมทนา {h.id}</span><span className="muted" style={{ fontSize: 12 }}>{h.date}</span></span>
                  <Icon name="download" size={15} style={{ color: "var(--ink-3)" }} />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============ 4. RECEIPT / ANUMODANA ============
const RECEIPTS = [
  { no: "อ.๒๕๖๙/๐๑๔๒", id: "RC-2569-0142", donor: "คุณวิภา รัตนากร", amount: 5000, fund: "กองทุนบูรณะอุโบสถ", date: "๔ มิถุนายน ๒๕๖๙", bahtText: "ห้าพันบาทถ้วน", addr: "112/4 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200" },
  { no: "อ.๒๕๖๙/๐๑๔๑", id: "RC-2569-0141", donor: "ครอบครัวสุขใจ", amount: 12000, fund: "กองทุนบูรณะอุโบสถ", date: "๓ มิถุนายน ๒๕๖๙", bahtText: "หนึ่งหมื่นสองพันบาทถ้วน", addr: "45 หมู่ 3 ต.ช้างเผือก อ.เมือง จ.เชียงใหม่" },
  { no: "อ.๒๕๖๙/๐๑๓๙", id: "RC-2569-0139", donor: "บริษัท ดีดีพัฒนา จำกัด", amount: 50000, fund: "กองทุนบูรณะอุโบสถ", date: "๓๐ พฤษภาคม ๒๕๖๙", bahtText: "ห้าหมื่นบาทถ้วน", addr: "อาคารดีดี ชั้น 12 ถ.สาทร กรุงเทพฯ" },
  { no: "อ.๒๕๖๙/๐๑๓๘", id: "RC-2569-0138", donor: "คุณธีรพงษ์ ศรีนคร", amount: 2500, fund: "ทำบุญทั่วไป", date: "๒ มิถุนายน ๒๕๖๙", bahtText: "สองพันห้าร้อยบาทถ้วน", addr: "9 ซ.วัดเกต ต.วัดเกต อ.เมือง จ.เชียงใหม่" },
];

export function DesignReceipt(): ReactElement {
  const [sel, setSel] = useState(RECEIPTS[0]);
  if (!sel) return <div className="content-wrap" />;
  return (
    <div className="content-wrap">
      <PageHead eyebrow="การบริจาค" title="ใบอนุโมทนาบัตร" desc="ดูตัวอย่าง พิมพ์ หรือส่งใบอนุโมทนาบัตรให้ผู้บริจาค รูปแบบเอกสารทางการของวัด"
        actions={<>
          <Button variant="secondary" icon={<Icon name="mail" size={15} />}>ส่งอีเมล</Button>
          <Button variant="secondary" icon={<Icon name="download" size={15} />}>ดาวน์โหลด PDF</Button>
          <Button variant="primary" icon={<Icon name="print" size={15} />}>พิมพ์</Button>
        </>} />
      <div className="split">
        <div className="doc">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div className="doc-seal"><Icon name="lotus" size={30} /></div>
              <div><div style={{ fontSize: 19, fontWeight: 600 }}>วัดธรรมสถิตวนาราม</div><div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>๑๒๓ หมู่ ๔ ต.ในเมือง อ.เมือง จ.เชียงใหม่ ๕๐๐๐๐ · โทร. ๐๕๓-๑๒๓-๔๕๖๗</div></div>
            </div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, color: "var(--ink-3)" }}>เลขที่</div><div style={{ fontSize: 15, fontWeight: 600 }}>{sel.no}</div></div>
          </div>
          <div style={{ textAlign: "center", margin: "18px 0 24px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "var(--accent)" }}>ใบอนุโมทนาบัตร</div>
            <div style={{ width: 64, height: 2, background: "var(--accent-line)", margin: "10px auto" }} />
            <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>ออกให้ ณ วันที่ {sel.date}</div>
          </div>
          <div style={{ fontSize: 16, lineHeight: 2, textAlign: "center" }}>ขออนุโมทนาบุญแด่<br /><span style={{ fontSize: 22, fontWeight: 600 }}>{sel.donor}</span><br /><span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{sel.addr}</span></div>
          <div style={{ margin: "24px 0", padding: "18px 22px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>ได้บริจาคทรัพย์เพื่อ</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{sel.fund}</div></div>
              <div style={{ textAlign: "right" }}><div className="tnum" style={{ fontSize: 30, fontWeight: 700, color: "var(--accent)" }}>{baht(sel.amount)}</div><div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>({sel.bahtText})</div></div>
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 15, lineHeight: 1.9 }}>ขออำนาจคุณพระศรีรัตนตรัยและสิ่งศักดิ์สิทธิ์ทั้งหลาย<br />จงดลบันดาลให้ท่านและครอบครัว ประสบแต่ความสุขความเจริญ เทอญ</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 36 }}>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>อ้างอิงใบเสร็จ <span className="mono">{sel.id}</span><br />เอกสารนี้ออกโดยระบบอิเล็กทรอนิกส์</div>
            <div style={{ textAlign: "center" }}><div style={{ borderBottom: "1px solid var(--ink-3)", width: 200, marginBottom: 8, height: 34 }} /><div style={{ fontFamily: "var(--font-serif)", fontSize: 14 }}>พระอธิการสมหวัง สุจิตฺโต</div><div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>เจ้าอาวาส</div></div>
          </div>
        </div>
        <div>
          <Card>
            <div className="card-head"><h3>ใบที่ออกล่าสุด</h3></div>
            <div>
              {RECEIPTS.map((r, i, a) => (
                <button key={r.id} type="button" onClick={() => setSel(r)} style={{ display: "flex", gap: 11, alignItems: "center", width: "100%", textAlign: "left", padding: "12px 18px", borderBottom: i < a.length - 1 ? "1px solid var(--border)" : 0, background: sel.id === r.id ? "var(--accent-tint)" : "transparent", border: "none", cursor: "pointer" }}>
                  <span className="av" style={sel.id === r.id ? {} : { background: "var(--surface-3)", color: "var(--ink-2)" }}><Icon name="receipt" size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{r.no}</span><span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{r.donor}</span></span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--credit)" }}>{baht(r.amount)}</span>
                </button>
              ))}
            </div>
          </Card>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 14px", marginTop: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", fontSize: 12.5, color: "var(--ink-2)" }}>
            <Icon name="info" size={16} style={{ color: "var(--reconciled)", flexShrink: 0, marginTop: 1 }} />
            <span>ใบอนุโมทนาบัตรของนิติบุคคลสามารถใช้ลดหย่อนภาษีได้ ระบบจะแนบเลขประจำตัวผู้เสียภาษีให้อัตโนมัติ</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 5. LEDGER ============
const LEDGER_STATUS: Record<string, { label: string; cls: "reconciled" | "neutral" | "pending" | "void" }> = {
  reconciled: { label: "กระทบยอดแล้ว", cls: "reconciled" }, posted: { label: "บันทึกแล้ว", cls: "neutral" }, pending: { label: "รอตรวจสอบ", cls: "pending" }, void: { label: "ยกเลิก", cls: "void" },
};

// Map a real ledger entry to the design row + a display status the filters understand.
function ledgerDisplayStatus(e: LedgerEntryView): "reconciled" | "posted" | "pending" | "void" {
  if (e.status === "voided") return "void";
  if (e.reconciledAt) return "reconciled";
  if (e.status === "posted") return "posted";
  return "pending"; // draft
}

export function DesignLedger({ api, today }: { api?: LedgerApi; today?: string }): ReactElement {
  const [entries, setEntries] = useState<LedgerEntryView[] | null>(null);
  const [summary, setSummary] = useState<LedgerSummaryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    if (!api) return;
    let active = true;
    Promise.all([api.listEntries(), api.summary(today ? { month: today.slice(0, 7) } : undefined)]).then(
      ([es, sm]) => { if (active) { setEntries(es); setSummary(sm); } },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, today]);

  const rows = useMemo(() => (entries ?? []).map((e) => ({
    id: e.entryNo,
    date: e.entryDate,
    account: e.accountNameTh,
    desc: e.description ?? "—",
    ref: e.payee ?? e.entryNo,
    amountSatang: e.amountSatang,
    kind: e.direction === "income" ? "in" : e.direction === "expense" ? "ex" : "",
    status: ledgerDisplayStatus(e),
  })), [entries]);
  const filtered = useMemo(() => rows.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (status !== "all" && r.status !== status) return false;
    if (q && !(r.desc.includes(q) || r.ref.includes(q) || r.account.includes(q))) return false;
    return true;
  }), [rows, q, kind, status]);

  const money = (value: string | undefined): string => (summary ? displayBaht(value ?? "0") : "…");
  const netShownSatang = filtered.reduce((acc, r) => (r.status === "void" ? acc : r.kind === "in" ? acc + Number(r.amountSatang) : r.kind === "ex" ? acc - Number(r.amountSatang) : acc), 0);

  return (
    <div className="content-wrap">
      <PageHead eyebrow="การเงิน" title="บัญชีรายรับ-รายจ่าย" desc="สมุดบัญชีของวัด บันทึกและกระทบยอดรายการเงินเข้า-ออกทุกประเภท"
        actions={<><Button variant="secondary" icon={<Icon name="download" size={15} />}>ส่งออก</Button><Button variant="primary" icon={<Icon name="plus" size={15} />}>เพิ่มรายการ</Button></>} />
      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดข้อมูลบัญชีไม่สำเร็จ: {error}</div> : null}
      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <KPI label="รายรับรวม (เดือนนี้)" value={money(summary?.incomeSatang)} tone="credit" />
        <KPI label="รายจ่ายรวม (เดือนนี้)" value={money(summary?.expenseSatang)} tone="debit" />
        <KPI label="คงเหลือสุทธิ" value={money(summary?.balanceSatang)} />
      </div>
      <Card>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="ค้นหารายการ / เอกสารอ้างอิง" />
          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />
          <div className="seg">{([["all", "ทั้งหมด"], ["in", "รายรับ"], ["ex", "รายจ่าย"]] as Array<[string, string]>).map(([k, l]) => <button key={k} type="button" className={kind === k ? "active" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
          {([["all", "สถานะทั้งหมด"], ["reconciled", "กระทบยอดแล้ว"], ["pending", "รอตรวจสอบ"], ["posted", "บันทึกแล้ว"], ["void", "ยกเลิก"]] as Array<[string, string]>).map(([k, l]) => <button key={k} type="button" className={`chip ${status === k ? "active" : ""}`} onClick={() => setStatus(k)}>{l}</button>)}
          <div style={{ marginLeft: "auto" }} className="muted">{filtered.length} รายการ</div>
        </Toolbar>
        <Table>
          <thead><tr><th>รหัส</th><th>วันที่</th><th>หมวดบัญชี</th><th>รายละเอียด</th><th className="num">รายรับ</th><th className="num">รายจ่าย</th><th>สถานะ</th><th /></tr></thead>
          <tbody>
            {!entries ? (
              <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: "20px" }}>ไม่พบรายการบัญชี</td></tr>
            ) : (
              filtered.map((r) => {
                const sm = LEDGER_STATUS[r.status] ?? { label: r.status, cls: "neutral" as const };
                const voided = r.status === "void";
                return (
                  <tr key={r.id} style={voided ? { opacity: 0.55 } : undefined}>
                    <td className="mono">{r.id}</td><td style={{ whiteSpace: "nowrap" }}>{r.date}</td><td>{r.account}</td>
                    <td><div style={{ textDecoration: voided ? "line-through" : "none" }}>{r.desc}</div><div className="mono muted" style={{ fontSize: 11 }}>{r.ref}</div></td>
                    <td className="num">{r.kind === "in" ? <span className="money credit tnum">{displayBaht(r.amountSatang)}</span> : <span className="muted">—</span>}</td>
                    <td className="num">{r.kind === "ex" ? <span className="money debit tnum">{displayBaht(r.amountSatang)}</span> : <span className="muted">—</span>}</td>
                    <td><Badge kind={sm.cls} dot>{sm.label}</Badge></td>
                    <td className="num" />
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
        <div className="t-foot"><span>แสดง {filtered.length} จาก {rows.length} รายการ</span><span>ยอดสุทธิที่แสดง: <b className="tnum" style={{ color: "var(--ink)" }}>{summary ? displayBaht(String(netShownSatang)) : "…"}</b></span></div>
      </Card>
    </div>
  );
}

// ============ 6. EVENT / CEREMONY BOOKING ============
// The month calendar has no API source yet, so it stays a demo grid (tagged ตัวอย่าง).
const DEMO_EVENT_DAYS = new Set([7, 8, 12, 19]);

function ceremonyStatusKind(status: string): "credit" | "pending" | "void" {
  return status === "confirmed" ? "credit" : status === "cancelled" ? "void" : "pending";
}

export function DesignEvents({ api }: { api?: CeremoniesApi }): ReactElement {
  const [items, setItems] = useState<Ceremony[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("all");
  useEffect(() => {
    if (!api) return;
    let active = true;
    api.list().then(
      (rows) => { if (active) setItems(rows); },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api]);
  const filtered = (items ?? []).filter((e) => type === "all" || e.ceremonyType === type);
  const eventDays = DEMO_EVENT_DAYS;
  return (
    <div className="content-wrap">
      <PageHead eyebrow="งานวัด" title="กิจกรรมและพิธี" desc="จองและจัดการกิจกรรม งานบุญ พิธีอุปสมบท ฌาปนกิจ และการปฏิบัติธรรม"
        actions={<Button variant="primary" icon={<Icon name="plus" size={15} />}>จองกิจกรรม</Button>} />
      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดข้อมูลกิจกรรมไม่สำเร็จ: {error}</div> : null}
      <div className="split">
        <Card>
          <Toolbar>
            <div className="seg">
              <button type="button" className={type === "all" ? "active" : ""} onClick={() => setType("all")}>ทั้งหมด</button>
              {CEREMONY_TYPE_OPTIONS.map((t) => <button key={t.value} type="button" className={type === t.value ? "active" : ""} onClick={() => setType(t.value)}>{t.label}</button>)}
            </div>
            <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} กิจกรรม</span>
          </Toolbar>
          <Table>
            <thead><tr><th>กิจกรรม</th><th>ประเภท</th><th>วันที่ / เวลา</th><th>สถานที่</th><th className="num">นิมนต์พระ</th><th>สถานะ</th></tr></thead>
            <tbody>
              {!items ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "20px" }}>ยังไม่มีกิจกรรม</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id}>
                    <td><div style={{ fontWeight: 500 }}>{e.title}</div><div className="mono muted" style={{ fontSize: 11 }}>{e.requesterName ?? "—"}</div></td>
                    <td><Badge kind="accent">{ceremonyTypeLabel(e.ceremonyType)}</Badge></td>
                    <td style={{ whiteSpace: "nowrap" }}>{e.ceremonyDate}<div className="muted" style={{ fontSize: 12 }}>{e.timeNote ?? ""}</div></td>
                    <td>{e.location ?? "—"}</td><td className="num tnum">{e.monkCount ?? "—"}</td>
                    <td><Badge kind={ceremonyStatusKind(e.status)} dot>{ceremonyStatusLabel(e.status)}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
        <Card>
          <div className="card-head"><h3>มิถุนายน ๒๕๖๙</h3><Badge kind="neutral">ตัวอย่าง</Badge></div>
          <div className="card-pad">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
              {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--ink-3)", fontWeight: 600, padding: "4px 0" }}>{d}</div>)}
              <div />
              {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => {
                const hasEvent = eventDays.has(d);
                const today = d === 4;
                return (
                  <div key={d} style={{ aspectRatio: "1", borderRadius: "var(--r-xs)", border: "1px solid", borderColor: today ? "var(--accent)" : "transparent", background: hasEvent ? "var(--accent-tint-2)" : "var(--surface-2)", padding: 4, display: "flex", flexDirection: "column" }}>
                    <span className="tnum" style={{ fontSize: 11.5, fontWeight: today ? 700 : 500, color: today ? "var(--accent)" : "var(--ink-2)" }}>{d}</span>
                    {hasEvent ? <div style={{ marginTop: "auto", display: "flex", gap: 2 }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} /></div> : null}
                  </div>
                );
              })}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />วันที่มีกิจกรรม</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============ 7. MONK & STAFF ============
const PEOPLE = [
  { id: "M-001", kind: "พระภิกษุ", chaya: "พระอธิการสมหวัง สุจิตฺโต", name: "สมหวัง รุ่งเรือง", role: "เจ้าอาวาส", vassa: 34, kuti: "กุฏิเจ้าอาวาส", status: "จำพรรษา", tel: "08x-xxx-xxxx" },
  { id: "M-002", kind: "พระภิกษุ", chaya: "พระมหาวิชัย ปญฺญาวโร", name: "วิชัย ใจดี", role: "รองเจ้าอาวาส", vassa: 22, kuti: "กุฏิ ๑", status: "จำพรรษา", tel: "08x-xxx-xxxx" },
  { id: "M-003", kind: "พระภิกษุ", chaya: "พระสุริยา ธมฺมโชโต", name: "สุริยา แสงธรรม", role: "พระวิทยากร", vassa: 11, kuti: "กุฏิ ๒", status: "จำพรรษา", tel: "08x-xxx-xxxx" },
  { id: "M-004", kind: "สามเณร", chaya: "สามเณรพงศกร", name: "พงศกร ใจเย็น", role: "สามเณร", vassa: 2, kuti: "กุฏิสามเณร ๑", status: "จำพรรษา", tel: "—" },
  { id: "S-101", kind: "เจ้าหน้าที่", chaya: "นายประยูร พงษ์ศักดิ์", name: "ประยูร พงษ์ศักดิ์", role: "ไวยาวัจกร", vassa: null, kuti: "—", status: "ปฏิบัติงาน", tel: "081-234-5678" },
  { id: "S-102", kind: "เจ้าหน้าที่", chaya: "นางสาวศิริพร อินทรา", name: "ศิริพร อินทรา", role: "เจ้าหน้าที่การเงิน", vassa: null, kuti: "—", status: "ปฏิบัติงาน", tel: "089-111-2233" },
  { id: "S-103", kind: "เจ้าหน้าที่", chaya: "นางบุญมา ใจเอื้อ", name: "บุญมา ใจเอื้อ", role: "แม่ครัว", vassa: null, kuti: "—", status: "ปฏิบัติงาน", tel: "092-345-6789" },
];

export function DesignPeople(): ReactElement {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const monkCount = PEOPLE.filter((p) => p.kind === "พระภิกษุ" || p.kind === "สามเณร").length;
  const staffCount = PEOPLE.filter((p) => p.kind === "เจ้าหน้าที่").length;
  const filtered = PEOPLE.filter((p) => {
    if (kind === "monk" && !(p.kind === "พระภิกษุ" || p.kind === "สามเณร")) return false;
    if (kind === "staff" && p.kind !== "เจ้าหน้าที่") return false;
    if (q && !(p.chaya.includes(q) || p.name.includes(q) || p.role.includes(q))) return false;
    return true;
  });
  return (
    <div className="content-wrap">
      <PageHead eyebrow="งานวัด" title="พระสงฆ์และเจ้าหน้าที่" desc="ทะเบียนพระภิกษุ สามเณร และเจ้าหน้าที่ของวัด พร้อมประวัติและข้อมูลติดต่อ"
        actions={<Button variant="primary" icon={<Icon name="plus" size={15} />}>เพิ่มบุคลากร</Button>} />
      <Card>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="ค้นหาฉายา ชื่อ หรือตำแหน่ง" />
          <div className="seg" style={{ marginLeft: 4 }}>
            <button type="button" className={kind === "all" ? "active" : ""} onClick={() => setKind("all")}>ทั้งหมด</button>
            <button type="button" className={kind === "monk" ? "active" : ""} onClick={() => setKind("monk")}>พระ-เณร ({monkCount})</button>
            <button type="button" className={kind === "staff" ? "active" : ""} onClick={() => setKind("staff")}>เจ้าหน้าที่ ({staffCount})</button>
          </div>
        </Toolbar>
        <Table>
          <thead><tr><th>ฉายา / ชื่อ</th><th>ประเภท</th><th>ตำแหน่ง</th><th>พรรษา</th><th>สังกัด/ติดต่อ</th><th>สถานะ</th><th /></tr></thead>
          <tbody>{filtered.map((p) => (
            <tr key={p.id} className="clickable">
              <td><div className="row" style={{ gap: 10 }}>
                <span className={`av ${p.kind === "เจ้าหน้าที่" ? "blue" : ""}`.trim()}>{p.chaya.replace(/^(นาย|นางสาว|นาง|พระ|สามเณร)\s?/, "").charAt(0)}</span>
                <span><span style={{ display: "block", fontWeight: 500 }}>{p.chaya}</span>{p.name !== p.chaya ? <span className="muted" style={{ fontSize: 12 }}>{p.name}</span> : null}</span>
              </div></td>
              <td><Badge kind={p.kind === "เจ้าหน้าที่" ? "reconciled" : "accent"}>{p.kind}</Badge></td>
              <td>{p.role}</td>
              <td className="tnum">{p.vassa != null ? `${p.vassa} พรรษา` : <span className="muted">—</span>}</td>
              <td className="muted">{p.kind === "เจ้าหน้าที่" ? p.tel : p.kuti}</td>
              <td><Badge kind="credit" dot>{p.status}</Badge></td>
              <td className="num"><Icon name="chevR" size={15} style={{ color: "var(--ink-3)" }} /></td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>
    </div>
  );
}

// ============ 8. REPORTS / EXPORT ============
const REPORTS: Array<{ id: string; icon: IconName; name: string; desc: string }> = [
  { id: "donations", icon: "donation", name: "รายงานการบริจาค", desc: "สรุปการบริจาคแยกตามกองทุน ช่องทาง และช่วงเวลา" },
  { id: "ledger", icon: "ledger", name: "งบรายรับ-รายจ่าย", desc: "งบการเงินของวัด แยกหมวดบัญชี พร้อมยอดคงเหลือ" },
  { id: "donors", icon: "donors", name: "รายงานผู้บริจาค", desc: "รายชื่อผู้บริจาค ยอดสะสม และความถี่" },
  { id: "tax", icon: "receipt", name: "รายงานเพื่อลดหย่อนภาษี", desc: "สรุปใบอนุโมทนาบัตรของนิติบุคคลและบุคคล" },
  { id: "events", icon: "event", name: "รายงานกิจกรรม", desc: "สรุปกิจกรรมและพิธีที่จัดในช่วงเวลา" },
  { id: "fund", icon: "building", name: "รายงานความคืบหน้ากองทุน", desc: "ยอดระดมทุนเทียบเป้าหมายแต่ละกองทุน" },
];

export function DesignReports(): ReactElement {
  const [sel, setSel] = useState("donations");
  const [fmt, setFmt] = useState("pdf");
  const cur = REPORTS.find((r) => r.id === sel) ?? REPORTS[0];
  if (!cur) return <div className="content-wrap" />;
  return (
    <div className="content-wrap">
      <PageHead eyebrow="รายงาน" title="รายงานและส่งออกข้อมูล" desc="สร้างและส่งออกรายงานการเงิน การบริจาค และกิจกรรม สำหรับการตรวจสอบและจัดเก็บ" />
      <div className="split">
        <div className="grid g-2">
          {REPORTS.map((r) => {
            const active = sel === r.id;
            return (
              <button key={r.id} type="button" className="card" onClick={() => setSel(r.id)} style={{ textAlign: "left", padding: 18, cursor: "pointer", borderColor: active ? "var(--accent)" : "var(--border)", background: active ? "var(--accent-tint-2)" : "var(--surface)", boxShadow: active ? "0 0 0 1px var(--accent) inset" : "none" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span className="av" style={{ background: active ? "var(--accent)" : "var(--surface-3)", color: active ? "#fff" : "var(--ink-2)" }}><Icon name={r.icon} size={18} /></span>
                  {active ? <Icon name="checkCircle" size={18} style={{ color: "var(--accent)" }} /> : null}
                </div>
                <div style={{ fontWeight: 600, marginTop: 11 }}>{r.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{r.desc}</div>
              </button>
            );
          })}
        </div>
        <div style={{ position: "sticky", top: 84 }}>
          <Card>
            <div className="card-head"><h3>ตั้งค่ารายงาน</h3></div>
            <div className="card-pad">
              <label className="field"><span className="label">รายงานที่เลือก</span><div className="control" style={{ display: "flex", alignItems: "center", background: "var(--surface-2)" }}>{cur.name}</div></label>
              <label className="field"><span className="label">ช่วงเวลา</span><div style={{ display: "flex", gap: 8, alignItems: "center" }}><input className="control tnum" defaultValue="2569-05-01" /><span className="muted">ถึง</span><input className="control tnum" defaultValue="2569-06-04" /></div></label>
              <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap" }}>{["เดือนนี้", "ไตรมาสนี้", "ปีนี้ (พ.ศ.)"].map((p) => <button key={p} type="button" className="chip">{p}</button>)}</div>
              <div className="field"><span className="label">รูปแบบไฟล์</span>
                <div className="opt-row">{([["pdf", "PDF", "เหมาะสำหรับพิมพ์และจัดเก็บ"], ["xlsx", "Excel (.xlsx)", "เปิดแก้ไขและคำนวณต่อได้"], ["csv", "CSV", "นำเข้าระบบอื่น"]] as Array<[string, string, string]>).map(([k, t, d]) => (
                  <label key={k} className={`opt ${fmt === k ? "sel" : ""}`} onClick={() => setFmt(k)}>
                    <input type="radio" checked={fmt === k} readOnly style={{ marginTop: 2 }} />
                    <span><span className="o-title">{t}</span><span className="o-desc" style={{ display: "block" }}>{d}</span></span>
                  </label>
                ))}</div>
              </div>
              <Button variant="primary" className="btn-block" icon={<Icon name="download" size={15} />}>สร้างและดาวน์โหลด</Button>
              <div className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: "center" }}>การสร้างรายงานจะถูกบันทึกในบันทึกการใช้งาน</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============ 9. ROLES & PERMISSIONS ============
// Product role model = admin/finance/staff (the design's prototype `auditor` is omitted).
const ROLE_DEFS = [
  { key: "admin", name: "ผู้ดูแลระบบ", desc: "เข้าถึงและจัดการทุกส่วน" },
  { key: "finance", name: "เจ้าหน้าที่การเงิน", desc: "บันทึกบริจาค บัญชี ออกใบอนุโมทนา" },
  { key: "staff", name: "เจ้าหน้าที่ทั่วไป", desc: "งานทะเบียน กิจกรรม สมาชิก" },
];
const ROLE_TAG: Record<string, "accent" | "reconciled" | "pending"> = { admin: "accent", finance: "reconciled", staff: "pending" };
const SEED_USERS = [
  { id: "U-01", name: "ประยูร พงษ์ศักดิ์", email: "prayoon@wat.local", role: "admin", status: "active", last: "วันนี้ 08:45" },
  { id: "U-02", name: "พระอธิการสมหวัง สุจิตฺโต", email: "abbot@wat.local", role: "admin", status: "active", last: "วันนี้ 06:12" },
  { id: "U-03", name: "ศิริพร อินทรา", email: "siriporn@wat.local", role: "finance", status: "active", last: "วันนี้ 09:42" },
  { id: "U-04", name: "อนงค์ บัญชีดี", email: "anong@wat.local", role: "finance", status: "active", last: "เมื่อวาน 17:30" },
  { id: "U-05", name: "สมชาย รักษ์ดี", email: "somchai@wat.local", role: "staff", status: "active", last: "2 วันก่อน" },
  { id: "U-06", name: "บุญมา ใจเอื้อ", email: "—", role: "staff", status: "disabled", last: "3 สัปดาห์ก่อน" },
];
const PERM_MATRIX: Array<{ id: string; label: string; admin: string; finance: string; staff: string }> = [
  { id: "dash", label: "แดชบอร์ดภาพรวม", admin: "full", finance: "full", staff: "full" },
  { id: "don", label: "บันทึก/แก้ไขการบริจาค", admin: "full", finance: "full", staff: "none" },
  { id: "rcpt", label: "ออกใบอนุโมทนาบัตร", admin: "full", finance: "full", staff: "none" },
  { id: "ledg", label: "บัญชีรายรับ-รายจ่าย", admin: "full", finance: "full", staff: "none" },
  { id: "evt", label: "จัดการกิจกรรม/พิธี", admin: "full", finance: "view", staff: "edit" },
  { id: "ppl", label: "ทะเบียนพระ-เจ้าหน้าที่", admin: "full", finance: "none", staff: "edit" },
  { id: "rep", label: "รายงานและส่งออกข้อมูล", admin: "full", finance: "full", staff: "view" },
  { id: "role", label: "จัดการสิทธิ์ผู้ใช้", admin: "full", finance: "none", staff: "none" },
];
const PERM_LEVELS: Record<string, { label: string; cls: "credit" | "reconciled" | "pending" | "void" }> = { full: { label: "จัดการ", cls: "credit" }, edit: { label: "แก้ไข", cls: "reconciled" }, view: { label: "ดู", cls: "pending" }, none: { label: "—", cls: "void" } };

export function DesignRoles({ role }: { role: TempleRole }): ReactElement {
  const [tab, setTab] = useState<"users" | "perms">("users");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const roleName = (k: string): string => ROLE_DEFS.find((r) => r.key === k)?.name ?? k;
  const filtered = SEED_USERS.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (q && !(u.name.includes(q) || u.email.includes(q))) return false;
    return true;
  });
  const activeCount = SEED_USERS.filter((u) => u.status === "active").length;
  return (
    <div className="content-wrap">
      <PageHead eyebrow="ระบบ" title="สิทธิ์ผู้ใช้งาน" desc="จัดการบัญชีผู้ใช้ของวัด กำหนดบทบาทและระดับสิทธิ์การเข้าถึงแต่ละส่วนของระบบ"
        actions={role === "admin" ? (tab === "users" ? <Button variant="primary" icon={<Icon name="plus" size={15} />}>เพิ่มบัญชีผู้ใช้</Button> : <Button variant="primary" icon={<Icon name="check" size={15} />}>บันทึกการเปลี่ยนแปลง</Button>) : undefined} />
      <div className="seg" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Icon name="donors" size={14} />บัญชีผู้ใช้งาน</button>
        <button type="button" className={tab === "perms" ? "active" : ""} onClick={() => setTab("perms")}><Icon name="roles" size={14} />บทบาทและสิทธิ์</button>
      </div>

      {tab === "users" ? (
        <>
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <KPI label="บัญชีทั้งหมด" icon="donors" value={String(SEED_USERS.length)} />
            <KPI label="ใช้งานอยู่" icon="checkCircle" value={String(activeCount)} tone="credit" />
            <KPI label="ปิดใช้งาน" icon="lock" value={String(SEED_USERS.length - activeCount)} />
            <KPI label="ผู้ดูแลระบบ" icon="roles" value={String(SEED_USERS.filter((u) => u.role === "admin").length)} />
          </div>
          <Card>
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อหรืออีเมล" />
              <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />
              <button type="button" className={`chip ${roleFilter === "all" ? "active" : ""}`} onClick={() => setRoleFilter("all")}>ทุกบทบาท</button>
              {ROLE_DEFS.map((r) => <button key={r.key} type="button" className={`chip ${roleFilter === r.key ? "active" : ""}`} onClick={() => setRoleFilter(r.key)}>{r.name}</button>)}
              <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} บัญชี</span>
            </Toolbar>
            <Table>
              <thead><tr><th>ชื่อ-นามสกุล</th><th>อีเมล</th><th>บทบาท</th><th>เข้าระบบล่าสุด</th><th>สถานะ</th><th /></tr></thead>
              <tbody>{filtered.map((u) => (
                <tr key={u.id} style={u.status === "disabled" ? { opacity: 0.6 } : undefined}>
                  <td><div className="row" style={{ gap: 10 }}><span className={`av ${u.role === "finance" ? "blue" : u.role === "staff" ? "green" : ""}`.trim()}>{u.name.replace(/^(นาย|นางสาว|นาง|พระ)\s?/, "").charAt(0)}</span><span style={{ fontWeight: 500 }}>{u.name}</span></div></td>
                  <td className="muted" style={{ fontSize: 13 }}>{u.email}</td>
                  <td><Badge kind={ROLE_TAG[u.role]} dot>{roleName(u.role)}</Badge></td>
                  <td className="muted" style={{ fontSize: 13 }}>{u.last}</td>
                  <td><Badge kind={u.status === "active" ? "credit" : "void"} dot>{u.status === "active" ? "ใช้งาน" : "ปิดใช้งาน"}</Badge></td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {role === "admin" ? <><Button variant="tertiary" size="sm" icon={<Icon name="edit" size={14} />}>แก้ไข</Button><Button variant="tertiary" size="sm">{u.status === "active" ? "ปิด" : "เปิด"}</Button></> : null}
                  </td>
                </tr>
              ))}</tbody>
            </Table>
            <div className="t-foot"><span>แสดง {filtered.length} จาก {SEED_USERS.length} บัญชี</span><span className="row" style={{ gap: 6 }}><Icon name="info" size={13} />ปิดใช้งานแทนการลบ เพื่อรักษาประวัติการทำรายการ</span></div>
          </Card>
        </>
      ) : (
        <>
          <div className="grid g-3" style={{ marginBottom: 16 }}>
            {ROLE_DEFS.map((r) => (
              <div className="kpi" key={r.key}>
                <div className="k-label"><Icon name="roles" size={15} style={{ color: "var(--ink-3)" }} />{r.name}</div>
                <div className="k-value tnum" style={{ fontSize: 22 }}>{SEED_USERS.filter((u) => u.role === r.key).length} <span style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 400 }}>คน</span></div>
                <div className="k-foot">{r.desc}</div>
              </div>
            ))}
          </div>
          <Card>
            <div className="card-head"><div><h3>ตารางสิทธิ์การเข้าถึง</h3><div className="sub">— → ดู → แก้ไข → จัดการ</div></div></div>
            <Table>
              <thead><tr><th style={{ minWidth: 200 }}>ฟังก์ชัน</th>{ROLE_DEFS.map((r) => <th key={r.key} style={{ textAlign: "center" }}>{r.name}</th>)}</tr></thead>
              <tbody>{PERM_MATRIX.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 500 }}>{row.label}</td>
                  {ROLE_DEFS.map((r) => {
                    const value = row[r.key as "admin" | "finance" | "staff"];
                    const lvl = PERM_LEVELS[value] ?? { label: "—", cls: "void" as const };
                    return <td key={r.key} style={{ textAlign: "center" }}><Badge kind={lvl.cls} dot={value !== "none"}>{lvl.label}</Badge></td>;
                  })}
                </tr>
              ))}</tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

// ============ 10. AUDIT LOG ============
const AUDIT = [
  { id: "A-90412", at: "2569-06-04 09:42:11", actor: "ศิริพร อินทรา", role: "finance", action: "create", entity: "การบริจาค RC-2569-0142", detail: "บันทึกบริจาค ฿5,000 — กองทุนบูรณะอุโบสถ", ip: "10.0.2.51" },
  { id: "A-90411", at: "2569-06-04 09:40:02", actor: "ศิริพร อินทรา", role: "finance", action: "issue", entity: "ใบอนุโมทนา RC-2569-0142", detail: "ออกใบอนุโมทนาบัตรเลขที่ อ.๒๕๖๙/๐๑๔๒", ip: "10.0.2.51" },
  { id: "A-90408", at: "2569-06-04 08:15:44", actor: "ประยูร พงษ์ศักดิ์", role: "admin", action: "update", entity: "สิทธิ์ผู้ใช้", detail: "เปลี่ยนบทบาท \"บุญมา ใจเอื้อ\" → เจ้าหน้าที่ทั่วไป", ip: "10.0.2.40" },
  { id: "A-90405", at: "2569-06-03 16:21:09", actor: "ศิริพร อินทรา", role: "finance", action: "reconcile", entity: "บัญชี LG-0460", detail: "กระทบยอด ฿12,000 กับใบแจ้งยอดธนาคาร", ip: "10.0.2.51" },
  { id: "A-90402", at: "2569-06-03 14:02:55", actor: "ประยูร พงษ์ศักดิ์", role: "admin", action: "void", entity: "บัญชี LG-0451", detail: "ยกเลิกรายการค่าน้ำซ้ำ (เหตุผล: บันทึกซ้ำ)", ip: "10.0.2.40" },
  { id: "A-90399", at: "2569-06-03 11:30:18", actor: "ระบบออนไลน์", role: "system", action: "create", entity: "การบริจาค RC-2569-0137", detail: "รับบริจาคออนไลน์ ฿10,000 ผ่านบัตรเครดิต", ip: "—" },
];
const ACTION_META: Record<string, { label: string; cls: "credit" | "pending" | "accent" | "reconciled" | "debit" | "neutral" }> = {
  create: { label: "สร้าง", cls: "credit" }, update: { label: "แก้ไข", cls: "pending" }, issue: { label: "ออกเอกสาร", cls: "accent" }, reconcile: { label: "กระทบยอด", cls: "reconciled" }, void: { label: "ยกเลิก", cls: "debit" }, login: { label: "เข้าระบบ", cls: "neutral" }, export: { label: "ส่งออก", cls: "reconciled" },
};

export function DesignAudit(): ReactElement {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const filtered = AUDIT.filter((l) => {
    if (action !== "all" && l.action !== action) return false;
    if (q && !(l.actor.includes(q) || l.entity.includes(q) || l.detail.includes(q))) return false;
    return true;
  });
  return (
    <div className="content-wrap">
      <PageHead eyebrow="ระบบ" title="บันทึกการใช้งาน" desc="บันทึกทุกการกระทำสำคัญในระบบ — ใครทำอะไร เมื่อไร เพื่อการตรวจสอบและความโปร่งใส ข้อมูลนี้ลบไม่ได้"
        actions={<Button variant="secondary" icon={<Icon name="download" size={15} />}>ส่งออกบันทึก</Button>} />
      <Card>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="ค้นหาผู้ใช้ รายการ หรือรายละเอียด" />
          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />
          <button type="button" className={`chip ${action === "all" ? "active" : ""}`} onClick={() => setAction("all")}>ทั้งหมด</button>
          {Object.entries(ACTION_META).map(([k, m]) => <button key={k} type="button" className={`chip ${action === k ? "active" : ""}`} onClick={() => setAction(k)}>{m.label}</button>)}
          <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} รายการ</span>
        </Toolbar>
        <Table>
          <thead><tr><th>เวลา</th><th>ผู้ใช้งาน</th><th>การกระทำ</th><th>รายการ / รายละเอียด</th><th>IP</th></tr></thead>
          <tbody>{filtered.map((l) => {
            const m = ACTION_META[l.action] ?? { label: l.action, cls: "neutral" as const };
            return (
              <tr key={l.id}>
                <td className="mono" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{l.at}</td>
                <td><div className="row" style={{ gap: 9 }}>
                  <span className={`av ${l.role === "finance" ? "blue" : l.role === "staff" ? "green" : ""}`.trim()} style={l.role === "system" ? { background: "var(--surface-3)", color: "var(--ink-3)" } : undefined}>{l.actor.charAt(0)}</span>
                  <span><span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{l.actor}</span><span className="muted" style={{ fontSize: 11.5 }}>{l.role}</span></span>
                </div></td>
                <td><Badge kind={m.cls} dot>{m.label}</Badge></td>
                <td><div style={{ fontWeight: 500 }}>{l.entity}</div><div className="muted" style={{ fontSize: 12.5 }}>{l.detail}</div></td>
                <td className="mono muted" style={{ fontSize: 12 }}>{l.ip}</td>
              </tr>
            );
          })}</tbody>
        </Table>
        <div className="t-foot"><span>แสดง {filtered.length} จาก {AUDIT.length} รายการ</span><span className="row" style={{ gap: 6 }}><Icon name="lock" size={13} />บันทึกนี้ไม่สามารถแก้ไขหรือลบได้</span></div>
      </Card>
    </div>
  );
}

export function DesignSystemShowcase(): ReactElement {
  return (
    <div className="content-wrap">
      <PageHead eyebrow="ระบบ" title="ระบบออกแบบ" desc="คอมโพเนนต์พื้นฐานที่ port จาก design artifact: btn btn-primary, badge, card, table, form" />
      <Card pad>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn btn-primary">btn btn-primary</button>
          <button className="btn btn-secondary">btn btn-secondary</button>
          <button className="btn btn-tertiary">btn btn-tertiary</button>
          <Badge kind="credit" dot>รายรับ</Badge>
          <Badge kind="pending" dot>รอตรวจสอบ</Badge>
        </div>
      </Card>
    </div>
  );
}
