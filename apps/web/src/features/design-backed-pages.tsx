import { type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";
import { type FieldError, bahtText, formatSatang } from "@wat/shared";
import { Badge, Button, Card, Modal, SearchBox, Toast, Toolbar } from "../design-system";
import { Icon, type IconName } from "../layout/icons";
import type { PageId, TempleRole } from "../layout/nav";
import { type DashboardApi, type DashboardView, displayBaht, methodLabel, statusLabel } from "./dashboard/dashboard";
import {
  type LedgerAccountView,
  type LedgerApi,
  type LedgerEntryView,
  type LedgerFormValues,
  type LedgerSummaryView,
  accountOptionLabel,
  directionLabel,
  emptyLedgerForm,
  postableAccounts,
  validateLedgerEntryForm,
} from "./ledger/ledger";
import {
  type CeremoniesApi,
  type Ceremony,
  type CeremonyStatus,
  type CeremonyType,
  type CreateCeremonyInput,
  type HallView,
  CEREMONY_FORM_SECTIONS,
  CEREMONY_STATUS_OPTIONS,
  CEREMONY_TYPE_OPTIONS,
  ceremonyStatusLabel,
  ceremonyTypeLabel,
} from "./ceremonies/ceremonies";
import {
  type CreatePersonnelInput,
  type Personnel,
  type PersonnelApi,
  type PersonnelType,
  PERSONNEL_FORM_SECTIONS,
  PERSONNEL_TYPE_OPTIONS,
  personnelStatusLabel,
  personnelTypeLabel,
} from "./personnel/personnel";
import { type CreateUserInput, type TenantUser, type UpdateUserInput, type UsersApi, ROLE_OPTIONS, roleLabel } from "./users/users";
import { type CreateDonorInput, type DonorRecord, type DonorsApi, donorTypeLabel } from "./donors/donors";
import {
  type DonationFormValues,
  type DonationsApi,
  type DonationView,
  DONATION_METHOD_OPTIONS,
  emptyDonationForm,
  firstError,
  validateDonationForm,
} from "./donations/donations";
import { type ReceiptsApi, type ReceiptView, receiptStatusLabel } from "./receipts/receipts";
import { type ReportsApi, type ReportType, downloadCsv, reportFilename } from "./reports/reports";
import { type AuditApi, type AuditLogView } from "./audit/audit";
import { type TempleApi, type TempleProfile } from "./temple/temple";

/*
 * Design-backed temple-admin pages, ported faithfully from the design source of
 * truth (artifacts/user-provided/.../temple-admin/{screens-1,screens-2,screens-3}.jsx
 * + ds.css). These are static / client-side demo pages over the design's demo data
 * (data.jsx) — they do NOT call the API (temple + inventory are the API-backed pages
 * in page-content.tsx). The design's prototype `auditor` role is intentionally not
 * shown (the product role model is admin/finance/staff — see layout/nav.ts).
 */

const baht = (n: number): string => `฿${n.toLocaleString("th-TH")}`;

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
          <Button variant="secondary" icon={<Icon name="download" size={15} />} disabled title="เร็ว ๆ นี้">ส่งออกสรุป</Button>
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

export function DesignDonations({ api, donorsApi, receiptsApi, canWrite = true, today }: { api?: DonationsApi; donorsApi?: DonorsApi; receiptsApi?: ReceiptsApi; canWrite?: boolean; today?: string }): ReactElement {
  const [form, setForm] = useState<DonationFormValues>(() => emptyDonationForm(today ?? "2569-06-04"));
  const [donors, setDonors] = useState<DonorRecord[]>([]);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recent, setRecent] = useState<DonationView[] | null>(null);
  const [receipts, setReceipts] = useState<ReceiptView[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [voidTarget, setVoidTarget] = useState<DonationView | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidErr, setVoidErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!donorsApi) return;
    let active = true;
    donorsApi.list().then((rows) => { if (active) setDonors(rows); }, () => undefined);
    return () => { active = false; };
  }, [donorsApi]);

  useEffect(() => {
    if (!api) return;
    let active = true;
    Promise.all([api.list(), receiptsApi ? receiptsApi.list() : Promise.resolve([])]).then(
      ([dons, rcs]) => { if (active) { setRecent((dons ?? []).slice(0, 10)); setReceipts(rcs ?? []); } },
      () => { if (active) setRecent([]); },
    );
    return () => { active = false; };
  }, [api, receiptsApi, reloadKey]);

  const amt = Number(form.amountBaht) || 0;
  const set = (patch: Partial<DonationFormValues>): void => setForm((f) => ({ ...f, ...patch }));
  const selectedDonor = donors.find((d) => d.id === form.donorId);
  const amountError = firstError(errors, "amountSatang") ?? firstError(errors, "amountBaht");
  const donorNameById = new Map(donors.map((d) => [d.id, d.displayName]));
  const issuedByDonation = new Set(receipts.filter((r) => r.status === "issued").map((r) => r.donationId));

  async function submit(): Promise<void> {
    if (!api) return;
    const result = validateDonationForm(form);
    if (!result.success) { setErrors(result.errors); return; }
    setErrors([]);
    setSaving(true);
    setSubmitError(null);
    try {
      await api.create(result.data);
      setToast("บันทึกการบริจาคแล้ว · ลงบัญชีรายรับอัตโนมัติ");
      setForm(emptyDonationForm(today ?? form.donationDate));
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function issueReceipt(donation: DonationView): Promise<void> {
    if (!receiptsApi) return;
    setActionBusy(true);
    try {
      const receipt = await receiptsApi.issue(donation.id);
      setToast(`ออกใบอนุโมทนาบัตรแล้ว · เลขที่ ${receipt.receiptNo} (พิมพ์ได้ที่หน้า “ใบอนุโมทนาบัตร”)`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "ออกใบอนุโมทนาบัตรไม่สำเร็จ");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmPledge(donation: DonationView): Promise<void> {
    if (!api) return;
    setActionBusy(true);
    try {
      await api.confirm(donation.id);
      setToast("ยืนยันรับเงินแล้ว · ลงบัญชีรายรับเรียบร้อย");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "ยืนยันรับเงินไม่สำเร็จ");
    } finally {
      setActionBusy(false);
    }
  }

  async function submitVoid(): Promise<void> {
    if (!api || !voidTarget) return;
    if (!voidReason.trim()) { setVoidErr("กรุณาระบุเหตุผลการยกเลิก"); return; }
    setActionBusy(true);
    setVoidErr(null);
    try {
      await api.void(voidTarget.id, voidReason.trim());
      setVoidTarget(null);
      setVoidReason("");
      setToast("ยกเลิกการบริจาคแล้ว · ระบบกลับรายการบัญชีและใบอนุโมทนาให้อัตโนมัติ");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setVoidErr(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="content-wrap">
      <PageHead eyebrow="การบริจาค" title="บันทึกการบริจาค" desc="กรอกข้อมูลผู้บริจาคและจำนวนเงิน ระบบจะบันทึกเข้าบัญชีรายรับของวัดโดยอัตโนมัติ" />
      <div className="split">
        <div>
          <Card pad style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 14 }}>ข้อมูลผู้บริจาค</h3>
            <label className="field"><span className="label">ผู้บริจาค</span>
              <select className="control" value={form.donorId ?? ""} onChange={(e) => set({ donorId: e.target.value })}>
                <option value="">ไม่ระบุผู้บริจาค (ไม่ประสงค์ออกนาม)</option>
                {donors.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
              </select>
              <span className="hint">เพิ่มผู้บริจาครายใหม่ได้ที่หน้า “ทะเบียนผู้บริจาค”</span>
            </label>
          </Card>

          <Card pad style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 14 }}>รายละเอียดการบริจาค</h3>
            <div className="field"><span className="label">จำนวนเงิน<span className="req"> *</span></span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>{PRESETS.map((p) => <button type="button" key={p} className={`chip ${amt === p ? "active" : ""}`} onClick={() => set({ amountBaht: String(p) })}>{baht(p)}</button>)}</div>
              <div className="input-prefix" style={{ maxWidth: 240 }}><span className="pfx">฿</span><input className="control tnum" value={form.amountBaht} onChange={(e) => set({ amountBaht: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0" /></div>
              {amountError ? <p className="error-text">{amountError}</p> : null}
            </div>
            <div className="form-grid">
              <label className="field"><span className="label">ช่องทางการรับเงิน</span><select className="control" value={form.method} onChange={(e) => set({ method: e.target.value as DonationFormValues["method"] })}>{DONATION_METHOD_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
              <label className="field"><span className="label">วันที่รับบริจาค</span><input className="control tnum" value={form.donationDate} onChange={(e) => set({ donationDate: e.target.value })} />{firstError(errors, "donationDate") ? <p className="error-text">{firstError(errors, "donationDate")}</p> : null}</label>
            </div>
            <label className="field full"><span className="label">หมายเหตุ</span><textarea className="control" value={form.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder="บันทึกเพิ่มเติม (ถ้ามี)" style={{ minHeight: 64 }} /></label>
            <div className="muted" style={{ fontSize: 12 }}>ใบอนุโมทนาบัตรออกได้ที่หน้า “ใบอนุโมทนาบัตร” หลังบันทึกการบริจาค</div>
          </Card>

          {submitError ? <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>{submitError}</div> : null}
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="primary" size="lg" icon={<Icon name="check" size={15} />} disabled={saving} onClick={() => void submit()}>{saving ? "กำลังบันทึก…" : "บันทึกการบริจาค"}</Button>
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
              {([["ผู้บริจาค", selectedDonor?.displayName ?? "ไม่ระบุ"], ["ช่องทาง", DONATION_METHOD_OPTIONS.find((m) => m.value === form.method)?.label ?? form.method], ["วันที่", form.donationDate]] as Array<[string, string]>).map(([k, v]) => (
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

      <Card style={{ marginTop: 16 }}>
        <div className="card-head"><h3>รายการบริจาคล่าสุด</h3></div>
        <Table>
          <thead><tr><th>วันที่</th><th>ผู้บริจาค</th><th style={{ textAlign: "right" }}>จำนวนเงิน</th><th>ช่องทาง</th><th>สถานะ</th><th>ใบอนุโมทนา</th><th /></tr></thead>
          <tbody>
            {!recent ? (
              <tr><td colSpan={7} className="muted" style={{ padding: 18 }}>กำลังโหลด…</td></tr>
            ) : recent.length === 0 ? (
              <tr><td colSpan={7} className="muted" style={{ padding: 18 }}>ยังไม่มีรายการบริจาค</td></tr>
            ) : recent.map((d) => {
              const hasReceipt = issuedByDonation.has(d.id);
              return (
                <tr key={d.id}>
                  <td className="tnum" style={{ whiteSpace: "nowrap" }}>{d.donationDate}</td>
                  <td>{d.donorId ? (donorNameById.get(d.donorId) ?? "—") : "ไม่ระบุผู้บริจาค"}</td>
                  <td className="tnum" style={{ textAlign: "right", fontWeight: 600 }}>{displayBaht(d.amountSatang)}</td>
                  <td>{methodLabel(d.method)}</td>
                  <td><Badge kind={d.status === "confirmed" ? "credit" : d.status === "cancelled" ? "debit" : "pending"} dot>{statusLabel(d.status)}</Badge></td>
                  <td>{hasReceipt ? <Badge kind="reconciled" dot>ออกแล้ว</Badge> : <span className="muted">ยังไม่ออก</span>}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {canWrite && d.status === "pledged" ? (
                      <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <Button variant="primary" size="sm" disabled={actionBusy} onClick={() => void confirmPledge(d)}>ยืนยันรับเงิน</Button>
                        <Button variant="danger" size="sm" disabled={actionBusy} onClick={() => { setVoidTarget(d); setVoidReason(""); setVoidErr(null); }}>ยกเลิก</Button>
                      </span>
                    ) : canWrite && d.status === "confirmed" ? (
                      <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {!hasReceipt && receiptsApi ? (
                          <Button variant="secondary" size="sm" disabled={actionBusy} onClick={() => void issueReceipt(d)}>ออกใบอนุโมทนา</Button>
                        ) : null}
                        <Button variant="danger" size="sm" disabled={actionBusy} onClick={() => { setVoidTarget(d); setVoidReason(""); setVoidErr(null); }}>ยกเลิก</Button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {voidTarget ? (
        <Modal title="ยกเลิกการบริจาค" sub={`${displayBaht(voidTarget.amountSatang)} · ${voidTarget.donationDate}`} onClose={() => setVoidTarget(null)}
          footer={<><Button variant="secondary" onClick={() => setVoidTarget(null)}>ปิด</Button><Button variant="danger" disabled={actionBusy} onClick={() => void submitVoid()}>{actionBusy ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}</Button></>}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)" }}>รายการจะไม่ถูกลบ — สถานะเปลี่ยนเป็น “ยกเลิก” พร้อมกลับรายการบัญชีรายรับและใบอนุโมทนาที่ออกไว้ และบันทึกเหตุผลลงบันทึกการใช้งาน</p>
          <div className="field"><label htmlFor="void-donation-reason">เหตุผลการยกเลิก<span className="req"> *</span></label><textarea id="void-donation-reason" className="control" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="เช่น บันทึกซ้ำ / ยอดผิด" style={{ minHeight: 64 }} /></div>
          {voidErr ? <p className="error-text">{voidErr}</p> : null}
        </Modal>
      ) : null}
      <Toast msg={toast} />
    </div>
  );
}

// ============ 3. DONOR PROFILE ============
export function DesignDonors({ api, canWrite }: { api?: DonorsApi; canWrite: boolean; goto?: (page: PageId) => void }): ReactElement {
  const [donors, setDonors] = useState<DonorRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState("person");
  const [draftPhone, setDraftPhone] = useState("");
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    setDonors(null);
    setError(null);
    api.list().then(
      (rows) => { if (active) setDonors(rows); },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, reloadKey]);

  const all = donors ?? [];
  const filtered = all.filter((d) => {
    if (type !== "all" && d.donorType !== type) return false;
    if (q && !(d.displayName.includes(q) || (d.phone ?? "").includes(q) || (d.email ?? "").includes(q))) return false;
    return true;
  });
  const num = (n: number): string => (donors ? String(n) : "…");

  async function submitCreate(): Promise<void> {
    if (!api) return;
    const name = draftName.trim();
    if (!name) { setSaveErr("กรุณากรอกชื่อผู้บริจาค"); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      await api.create({ displayName: name, donorType: draftType as "person" | "organization", phone: draftPhone.trim() || undefined } as CreateDonorInput);
      setCreating(false);
      setDraftName("");
      setDraftPhone("");
      setDraftType("person");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-wrap">
      <PageHead eyebrow="การเงินและบริจาค" title="ทะเบียนผู้บริจาค" desc="รายชื่อญาติโยมและผู้อุปถัมภ์ของวัด พร้อมข้อมูลติดต่อและประเภทผู้บริจาค"
        actions={canWrite ? <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={() => setCreating(true)}>เพิ่มผู้บริจาค</Button> : undefined} />
      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดข้อมูลผู้บริจาคไม่สำเร็จ: {error}</div> : null}
      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <KPI label="ผู้บริจาคทั้งหมด" icon="donors" value={num(all.length)} />
        <KPI label="บุคคล" icon="donors" value={num(all.filter((d) => d.donorType === "person").length)} />
        <KPI label="นิติบุคคล" icon="building" value={num(all.filter((d) => d.donorType === "organization").length)} />
      </div>
      <Card>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อ เบอร์โทร หรืออีเมล" />
          <div className="seg" style={{ marginLeft: 4 }}>
            {([["all", "ทั้งหมด"], ["person", "บุคคล"], ["organization", "นิติบุคคล"]] as Array<[string, string]>).map(([k, l]) => <button key={k} type="button" className={type === k ? "active" : ""} onClick={() => setType(k)}>{l}</button>)}
          </div>
          <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} ราย</span>
        </Toolbar>
        <Table>
          <thead><tr><th>ชื่อผู้บริจาค</th><th>ประเภท</th><th>ติดต่อ</th><th>แท็ก</th><th>เพิ่มเมื่อ</th><th /></tr></thead>
          <tbody>
            {!donors ? (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "20px" }}>ยังไม่มีผู้บริจาค</td></tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="clickable">
                  <td><div className="row" style={{ gap: 10 }}><span className={`av ${d.donorType === "organization" ? "blue" : ""}`.trim()}>{d.displayName.charAt(0)}</span><span style={{ fontWeight: 500 }}>{d.displayName}</span></div></td>
                  <td><Badge kind={d.donorType === "organization" ? "reconciled" : "neutral"}>{donorTypeLabel(d.donorType)}</Badge></td>
                  <td className="muted" style={{ fontSize: 13 }}>{d.phone ?? d.email ?? "—"}</td>
                  <td>{d.tags.length ? <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{d.tags.slice(0, 3).map((t) => <Badge key={t} kind="accent">{t}</Badge>)}</div> : <span className="muted">—</span>}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{d.createdAt.slice(0, 10)}</td>
                  <td className="num"><Icon name="chevR" size={15} style={{ color: "var(--ink-3)" }} /></td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        <div className="t-foot"><span>แสดง {filtered.length} จาก {all.length} ราย</span></div>
      </Card>

      {creating ? (
        <Modal title="เพิ่มผู้บริจาค" sub="บันทึกผู้บริจาครายใหม่เข้าทะเบียน" onClose={() => setCreating(false)}
          footer={<><Button variant="secondary" onClick={() => setCreating(false)}>ยกเลิก</Button><Button variant="primary" disabled={saving} onClick={() => void submitCreate()}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Button></>}>
          <div className="field"><label>ชื่อผู้บริจาค</label><input className="control" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="เช่น คุณวิภา รัตนากร" /></div>
          <div className="field"><label>ประเภท</label>
            <div className="seg">{([["person", "บุคคล"], ["organization", "นิติบุคคล"]] as Array<[string, string]>).map(([k, l]) => <button key={k} type="button" className={draftType === k ? "active" : ""} onClick={() => setDraftType(k)}>{l}</button>)}</div>
          </div>
          <div className="field"><label>เบอร์โทร (ไม่บังคับ)</label><input className="control" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} /></div>
          {saveErr ? <p className="error-text">{saveErr}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}

// ============ 4. RECEIPT / ANUMODANA ============
const RECEIPT_STATUS_KIND: Record<string, "credit" | "void" | "neutral"> = { issued: "credit", voided: "void", superseded: "neutral" };

// Arabic → Thai numerals (๐–๙) for the formal certificate; separators/decimals stay as-is.
function toThaiDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => "๐๑๒๓๔๕๖๗๘๙".charAt(d.charCodeAt(0) - 48));
}

/** Compose the temple address line for the certificate from profile parts. */
function templeAddressLine(p: TempleProfile | null): string {
  if (!p) return "";
  const parts = [p.addressTh, p.subdistrict ? `ต.${p.subdistrict}` : null, p.district ? `อ.${p.district}` : null, p.province ? `จ.${p.province}` : null, p.postalCode].filter(Boolean);
  const addr = parts.join(" ");
  return p.phone ? (addr ? `${addr} · โทร. ${p.phone}` : `โทร. ${p.phone}`) : addr;
}

export function DesignReceipt({ api, donationsApi, donorsApi, templeApi }: { api?: ReceiptsApi; donationsApi?: DonationsApi; donorsApi?: DonorsApi; templeApi?: TempleApi }): ReactElement {
  const [receipts, setReceipts] = useState<ReceiptView[] | null>(null);
  const [donations, setDonations] = useState<DonationView[]>([]);
  const [donors, setDonors] = useState<DonorRecord[]>([]);
  const [temple, setTemple] = useState<TempleProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [voidErr, setVoidErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    setReceipts(null);
    setError(null);
    Promise.all([
      api.list(),
      donationsApi ? donationsApi.list() : Promise.resolve([]),
      donorsApi ? donorsApi.list() : Promise.resolve([]),
      templeApi ? templeApi.get().catch(() => null) : Promise.resolve(null),
    ]).then(
      ([rcs, dons, dnrs, profile]) => { if (active) { setReceipts(rcs); setDonations(dons); setDonors(dnrs); setTemple(profile); } },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, donationsApi, donorsApi, templeApi, reloadKey]);

  const donationById = new Map(donations.map((d) => [d.id, d]));
  const donorById = new Map(donors.map((d) => [d.id, d]));
  const rows = (receipts ?? []).map((r) => {
    const don = donationById.get(r.donationId);
    const dnr = don?.donorId ? donorById.get(don.donorId) : undefined;
    return { id: r.id, receiptNo: r.receiptNo, status: r.status, issuedAt: r.issuedAt.slice(0, 10), donationId: r.donationId, amountSatang: don?.amountSatang ?? null, donorName: dnr?.displayName ?? "ไม่ระบุผู้บริจาค", address: dnr?.address ?? null };
  });
  const sel = rows.find((r) => r.id === selId) ?? rows[0] ?? null;

  async function submitVoid(): Promise<void> {
    if (!api || !sel) return;
    if (!reason.trim()) { setVoidErr("กรุณาระบุเหตุผลการยกเลิก"); return; }
    setBusy(true);
    setVoidErr(null);
    try {
      await api.void(sel.id, reason.trim());
      setVoiding(false);
      setReason("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setVoidErr(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-wrap receipt-page">
      <PageHead eyebrow="การบริจาค" title="ใบอนุโมทนาบัตร" desc="ดูตัวอย่าง พิมพ์ หรือยกเลิกใบอนุโมทนาบัตร รูปแบบเอกสารทางการของวัด"
        actions={<>
          <Button variant="secondary" icon={<Icon name="print" size={15} />} onClick={() => { if (typeof window !== "undefined") window.print(); }}>พิมพ์</Button>
          {sel && sel.status === "issued" ? <Button variant="danger" icon={<Icon name="x" size={15} />} onClick={() => setVoiding(true)}>ยกเลิกใบ</Button> : null}
        </>} />
      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดข้อมูลใบอนุโมทนาบัตรไม่สำเร็จ: {error}</div> : null}
      <div className="split">
        <div className="doc cert">
          <div className="cert-watermark" aria-hidden="true"><Icon name="lotus" size={300} /></div>

          <div className="cert-head">
            <div className="cert-temple">
              <div className="doc-seal"><Icon name="lotus" size={30} /></div>
              <div>
                <div className="cert-temple-name">{temple?.nameTh ?? "…"}</div>
                <div className="cert-temple-addr">{templeAddressLine(temple) || "กรอกที่อยู่วัดได้ที่หน้า “ข้อมูลวัด”"}</div>
              </div>
            </div>
            <div className="cert-no">
              <div className="cert-no-label">เลขที่</div>
              <div className="cert-no-val mono">{sel?.receiptNo ?? "—"}</div>
              {sel ? <div style={{ marginTop: 6 }}><Badge kind={RECEIPT_STATUS_KIND[sel.status] ?? "neutral"} dot>{receiptStatusLabel(sel.status)}</Badge></div> : null}
            </div>
          </div>

          <div className="cert-title-block">
            <h2 className="cert-title">ใบอนุโมทนาบัตร</h2>
            <div className="cert-ornament" aria-hidden="true"><span className="cert-rule" /><Icon name="lotus" size={15} /><span className="cert-rule" /></div>
            <div className="cert-issued">ออกให้ ณ วันที่ {sel?.issuedAt ?? "—"}</div>
          </div>

          <div className="cert-recipient">
            <div className="cert-recipient-lead">ขออนุโมทนาบุญแด่</div>
            <div className="cert-recipient-name">{sel?.donorName ?? "—"}</div>
            {sel?.address ? <div className="cert-recipient-addr">{sel.address}</div> : null}
          </div>

          <div className="cert-amount">
            <div className="cert-amount-label">ได้บริจาคทรัพย์เป็นจำนวน</div>
            <div className="cert-amount-baht tnum">{sel?.amountSatang ? <>{toThaiDigits(formatSatang(sel.amountSatang))}<span className="cert-amount-unit">บาท</span></> : "—"}</div>
            <div className="cert-amount-text">{sel?.amountSatang ? `(${bahtText(Number(sel.amountSatang))})` : ""}</div>
          </div>

          <div className="cert-blessing">ขออำนาจคุณพระศรีรัตนตรัยและสิ่งศักดิ์สิทธิ์ทั้งหลาย<br />จงดลบันดาลให้ท่านและครอบครัว ประสบแต่ความสุขความเจริญ เทอญ</div>

          <div className="cert-foot">
            <div className="cert-edoc">เอกสารนี้ออกโดยระบบอิเล็กทรอนิกส์</div>
            <div className="cert-sign">
              <div className="cert-sign-line" aria-hidden="true" />
              <div className="cert-sign-name">{temple?.abbotName ?? "(ลงนาม)"}</div>
              <div className="cert-sign-role">เจ้าอาวาส</div>
            </div>
          </div>
        </div>
        <div>
          <Card>
            <div className="card-head"><h3>ใบที่ออกล่าสุด</h3></div>
            <div>
              {!receipts ? (
                <div className="card-pad muted">{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</div>
              ) : rows.length === 0 ? (
                <div className="card-pad muted">ยังไม่มีใบอนุโมทนาบัตร</div>
              ) : (
                rows.map((r, i, a) => (
                  <button key={r.id} type="button" onClick={() => setSelId(r.id)} style={{ display: "flex", gap: 11, alignItems: "center", width: "100%", textAlign: "left", padding: "12px 18px", borderBottom: i < a.length - 1 ? "1px solid var(--border)" : 0, background: sel?.id === r.id ? "var(--accent-tint)" : "transparent", border: "none", cursor: "pointer" }}>
                    <span className="av" style={sel?.id === r.id ? {} : { background: "var(--surface-3)", color: "var(--ink-2)" }}><Icon name="receipt" size={16} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{r.receiptNo}</span><span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{r.donorName}</span></span>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--credit)" }}>{r.amountSatang ? displayBaht(r.amountSatang) : "—"}</span>
                  </button>
                ))
              )}
            </div>
          </Card>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 14px", marginTop: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", fontSize: 12.5, color: "var(--ink-2)" }}>
            <Icon name="info" size={16} style={{ color: "var(--reconciled)", flexShrink: 0, marginTop: 1 }} />
            <span>ใบอนุโมทนาบัตรของนิติบุคคลสามารถใช้ลดหย่อนภาษีได้ ระบบจะแนบเลขประจำตัวผู้เสียภาษีให้อัตโนมัติ</span>
          </div>
        </div>
      </div>

      {voiding && sel ? (
        <Modal title="ยกเลิกใบอนุโมทนาบัตร" sub={sel.receiptNo} onClose={() => setVoiding(false)}
          footer={<><Button variant="secondary" onClick={() => setVoiding(false)}>ปิด</Button><Button variant="danger" disabled={busy} onClick={() => void submitVoid()}>{busy ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}</Button></>}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)" }}>การยกเลิกจะบันทึกในบันทึกการใช้งาน ใบที่ยกเลิกแล้วจะออกใหม่ได้</p>
          <div className="field"><label>เหตุผลการยกเลิก</label><textarea className="control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ระบุยอดผิด" style={{ minHeight: 64 }} /></div>
          {voidErr ? <p className="error-text">{voidErr}</p> : null}
        </Modal>
      ) : null}
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

export function DesignLedger({ api, reportsApi, today, canWrite }: { api?: LedgerApi; reportsApi?: ReportsApi; today?: string; canWrite?: boolean }): ReactElement {
  const [entries, setEntries] = useState<LedgerEntryView[] | null>(null);
  const [summary, setSummary] = useState<LedgerSummaryView | null>(null);
  const [accounts, setAccounts] = useState<LedgerAccountView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<LedgerFormValues>(() => emptyLedgerForm(today ?? ""));
  const [formErrors, setFormErrors] = useState<FieldError[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    let active = true;
    Promise.all([
      api.listEntries(),
      api.summary(today ? { month: today.slice(0, 7) } : undefined),
      api.listAccounts(),
    ]).then(
      ([es, sm, accs]) => { if (active) { setEntries(es); setSummary(sm); setAccounts(accs ?? []); } },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, today, reloadKey]);

  const postable = postableAccounts(accounts);
  const amountErr = firstError(formErrors, "amountBaht") ?? firstError(formErrors, "amountSatang");

  function openCreate(): void {
    setForm(emptyLedgerForm(today ?? new Date().toISOString().slice(0, 10)));
    setFormErrors([]);
    setSaveErr(null);
    setCreating(true);
  }

  async function submitCreate(): Promise<void> {
    if (!api) return;
    const result = validateLedgerEntryForm(form);
    if (!result.success) { setFormErrors(result.errors); return; }
    setSaving(true);
    setSaveErr(null);
    try {
      await api.create(result.data);
      setCreating(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv(): Promise<void> {
    if (!reportsApi) return;
    setExporting(true);
    setError(null);
    try {
      const report = await reportsApi.get("ledger");
      downloadCsv(reportFilename("ledger", today ?? new Date().toISOString().slice(0, 10)), report.csv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งออกบัญชีไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

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
        actions={<>{reportsApi ? <Button variant="secondary" icon={<Icon name="download" size={15} />} disabled={exporting} onClick={() => void exportCsv()}>{exporting ? "กำลังส่งออก…" : "ส่งออก"}</Button> : null}{canWrite ? <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={openCreate}>เพิ่มรายการ</Button> : null}</>} />
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

      {creating ? (
        <Modal title="เพิ่มรายการบัญชี" sub="บันทึกรายรับหรือรายจ่ายของวัด" onClose={() => setCreating(false)}
          footer={<><Button variant="secondary" onClick={() => setCreating(false)}>ยกเลิก</Button><Button variant="primary" disabled={saving || postable.length === 0} onClick={() => void submitCreate()}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Button></>}>
          {postable.length === 0 ? (
            <p className="error-text">ยังไม่มีผังบัญชีสำหรับบันทึกรายการ — โปรดตั้งค่าผังบัญชีก่อน</p>
          ) : (
            <>
              <div className="field">
                <label>บัญชี/หมวด</label>
                <select className="control" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                  <option value="">เลือกบัญชี</option>
                  {postable.map((a) => <option key={a.id} value={a.id}>{accountOptionLabel(a)} ({directionLabel(a.direction)})</option>)}
                </select>
                {firstError(formErrors, "accountId") ? <p className="error-text">{firstError(formErrors, "accountId")}</p> : null}
              </div>
              <div className="field">
                <label>จำนวนเงิน (บาท)</label>
                <input className="control" inputMode="decimal" value={form.amountBaht} onChange={(e) => setForm({ ...form, amountBaht: e.target.value })} placeholder="0.00" />
                {amountErr ? <p className="error-text">{amountErr}</p> : null}
              </div>
              <div className="field">
                <label>วันที่</label>
                <input className="control" type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
                {firstError(formErrors, "entryDate") ? <p className="error-text">{firstError(formErrors, "entryDate")}</p> : null}
              </div>
              <div className="field">
                <label>ผู้รับเงิน/ผู้จ่าย (ไม่บังคับ)</label>
                <input className="control" value={form.payee ?? ""} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="ชื่อร้าน/ผู้รับเงิน" />
              </div>
              <div className="field">
                <label>รายละเอียด (ไม่บังคับ)</label>
                <textarea className="control" value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ minHeight: 64 }} />
              </div>
              {saveErr ? <p className="error-text">{saveErr}</p> : null}
            </>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

// ============ 6. EVENT / CEREMONY BOOKING ============
// The month calendar has no API source yet, so it stays a demo grid (tagged ตัวอย่าง).
const DEMO_EVENT_DAYS = new Set([7, 8, 12, 19]);

function ceremonyStatusKind(status: string): "credit" | "pending" | "void" {
  if (status === "completed") return "credit";
  if (status === "cancelled") return "void";
  return "pending"; // requested + planned
}

/** Staff status-transition buttons for a ceremony row (confirm / reject / complete). */
function ceremonyRowActions(
  e: Ceremony,
  busy: boolean,
  onChange: (id: string, next: CeremonyStatus) => void,
): ReactElement {
  const btns: { label: string; next: CeremonyStatus; variant: "primary" | "secondary" | "danger" }[] = [];
  if (e.status === "requested") {
    btns.push({ label: "ยืนยัน", next: "planned", variant: "primary" });
    btns.push({ label: "ปฏิเสธ", next: "cancelled", variant: "danger" });
  } else if (e.status === "planned") {
    btns.push({ label: "เสร็จสิ้น", next: "completed", variant: "secondary" });
    btns.push({ label: "ยกเลิก", next: "cancelled", variant: "danger" });
  }
  if (btns.length === 0) return <span className="muted">—</span>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {btns.map((b) => (
        <Button key={b.next} variant={b.variant} disabled={busy} onClick={() => onChange(e.id, b.next)}>
          {b.label}
        </Button>
      ))}
    </div>
  );
}

export function DesignEvents({ api, personnelApi, canWrite, canManageHalls }: { api?: CeremoniesApi; personnelApi?: PersonnelApi; canWrite?: boolean; canManageHalls?: boolean }): ReactElement {
  const [items, setItems] = useState<Ceremony[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<"all" | CeremonyStatus>("all");
  const [creating, setCreating] = useState(false);
  const [cType, setCType] = useState<CeremonyType>("merit");
  const [cPublic, setCPublic] = useState(false);
  const [cHallId, setCHallId] = useState("");
  const [cMonkIds, setCMonkIds] = useState<string[]>([]);
  const [halls, setHalls] = useState<HallView[]>([]);
  const [monks, setMonks] = useState<Personnel[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [managingHalls, setManagingHalls] = useState(false);
  const [hallName, setHallName] = useState("");
  const [hallCapacity, setHallCapacity] = useState("");
  const [hallErr, setHallErr] = useState<string | null>(null);
  const [hallBusy, setHallBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    let active = true;
    api.list().then(
      (rows) => { if (active) setItems(rows); },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    // typeof guard: older/partial test doubles may not implement the halls API.
    if (typeof api.listHalls === "function") {
      api.listHalls(canManageHalls === true).then(
        (rows) => { if (active) setHalls(rows ?? []); },
        () => undefined,
      );
    }
    return () => { active = false; };
  }, [api, canManageHalls, reloadKey]);
  useEffect(() => {
    if (!personnelApi) return;
    let active = true;
    // พระ/สามเณรที่ยังปฏิบัติงานอยู่ สำหรับนิมนต์
    personnelApi.list({ status: "active" }).then(
      (rows) => { if (active) setMonks(rows.filter((p) => p.personnelType === "monk" || p.personnelType === "novice")); },
      () => undefined,
    );
    return () => { active = false; };
  }, [personnelApi]);

  async function addHall(): Promise<void> {
    if (!api) return;
    const name = hallName.trim();
    if (!name) { setHallErr("กรุณาระบุชื่อศาลา"); return; }
    setHallBusy(true);
    setHallErr(null);
    try {
      const capacity = hallCapacity.trim() ? Number(hallCapacity.trim()) : null;
      await api.createHall({ name, capacity: Number.isInteger(capacity) && (capacity ?? 0) > 0 ? capacity : null });
      setHallName("");
      setHallCapacity("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setHallErr(e instanceof Error ? e.message : "เพิ่มศาลาไม่สำเร็จ");
    } finally {
      setHallBusy(false);
    }
  }

  async function toggleHall(hall: HallView): Promise<void> {
    if (!api) return;
    setHallBusy(true);
    setHallErr(null);
    try {
      await api.updateHall(hall.id, { isActive: !hall.isActive });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setHallErr(e instanceof Error ? e.message : "อัปเดตศาลาไม่สำเร็จ");
    } finally {
      setHallBusy(false);
    }
  }
  const all = items ?? [];
  const filtered = all.filter(
    (e) => (type === "all" || e.ceremonyType === type) && (status === "all" || e.status === status),
  );
  // Devotee-submitted bookings awaiting staff confirmation (the queue).
  const requestedCount = all.filter((e) => e.status === "requested").length;
  const eventDays = DEMO_EVENT_DAYS;

  // Confirm (-> planned), reject/cancel (-> cancelled), or complete a booking by
  // reusing the audited PATCH /ceremonies/:id (the server blocks setting "requested").
  async function changeStatus(id: string, next: CeremonyStatus): Promise<void> {
    if (!api?.update) return;
    setBusyId(id);
    setActionErr(null);
    try {
      await api.update(id, { status: next });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  function openCreate(): void {
    setCType("merit");
    setCPublic(false);
    setCHallId("");
    setCMonkIds([]);
    setDraft({});
    setSaveErr(null);
    setCreating(true);
  }
  async function submitCreate(): Promise<void> {
    if (!api) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await api.create({
        ceremonyType: cType,
        status: "planned",
        isPublic: cPublic,
        ...(cHallId ? { hallId: cHallId } : {}),
        ...(cMonkIds.length > 0 ? { monkPersonnelIds: cMonkIds } : {}),
        ...draft,
      } as unknown as CreateCeremonyInput);
      setCreating(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="content-wrap">
      <PageHead eyebrow="งานวัด" title="กิจกรรมและพิธี" desc="จองและจัดการกิจกรรม งานบุญ พิธีอุปสมบท ฌาปนกิจ และการปฏิบัติธรรม"
        actions={canWrite ? (
          <>
            {canManageHalls ? <Button variant="secondary" icon={<Icon name="building" size={15} />} onClick={() => { setHallErr(null); setManagingHalls(true); }}>จัดการศาลา</Button> : null}
            <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={openCreate}>จองกิจกรรม</Button>
          </>
        ) : undefined} />
      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดข้อมูลกิจกรรมไม่สำเร็จ: {error}</div> : null}
      <div className="split">
        <Card>
          {requestedCount > 0 ? (
            <div style={{ marginBottom: 12, padding: "9px 13px", borderRadius: "var(--r)", background: "var(--accent-tint-2)", border: "1px solid var(--accent-line)", color: "var(--accent)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="lotus" size={15} />
              มีคำขอจองจากญาติโยมรอยืนยัน {requestedCount} รายการ
              {status !== "requested" ? (
                <button type="button" className="link-btn" style={{ marginLeft: "auto" }} onClick={() => setStatus("requested")}>ดูคิวรอยืนยัน</button>
              ) : null}
            </div>
          ) : null}
          {actionErr ? <div className="error-text" style={{ marginBottom: 10 }} role="alert">{actionErr}</div> : null}
          <Toolbar>
            <div className="seg">
              <button type="button" className={type === "all" ? "active" : ""} onClick={() => setType("all")}>ทั้งหมด</button>
              {CEREMONY_TYPE_OPTIONS.map((t) => <button key={t.value} type="button" className={type === t.value ? "active" : ""} onClick={() => setType(t.value)}>{t.label}</button>)}
            </div>
            <div className="seg" style={{ marginLeft: 8 }} aria-label="กรองตามสถานะ">
              <button type="button" className={status === "all" ? "active" : ""} onClick={() => setStatus("all")}>ทุกสถานะ</button>
              {CEREMONY_STATUS_OPTIONS.map((s) => <button key={s.value} type="button" className={status === s.value ? "active" : ""} onClick={() => setStatus(s.value)}>{s.label}</button>)}
            </div>
            <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} กิจกรรม</span>
          </Toolbar>
          <Table>
            <thead><tr><th>กิจกรรม</th><th>ประเภท</th><th>วันที่ / เวลา</th><th>สถานที่</th><th className="num">นิมนต์พระ</th><th>สถานะ</th>{canWrite ? <th>การจัดการ</th> : null}</tr></thead>
            <tbody>
              {!items ? (
                <tr><td colSpan={canWrite ? 7 : 6} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={canWrite ? 7 : 6} className="muted" style={{ textAlign: "center", padding: "20px" }}>ยังไม่มีกิจกรรม</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id}>
                    <td><div style={{ fontWeight: 500 }}>{e.title}</div><div className="mono muted" style={{ fontSize: 11 }}>{e.requesterName ?? "—"}</div></td>
                    <td><Badge kind="accent">{ceremonyTypeLabel(e.ceremonyType)}</Badge></td>
                    <td style={{ whiteSpace: "nowrap" }}>{e.ceremonyDate}<div className="muted" style={{ fontSize: 12 }}>{e.timeNote ?? ""}</div></td>
                    <td>{e.location ?? "—"}</td><td className="num tnum">{e.monkCount ?? "—"}</td>
                    <td><Badge kind={ceremonyStatusKind(e.status)} dot>{ceremonyStatusLabel(e.status)}</Badge></td>
                    {canWrite ? <td>{ceremonyRowActions(e, busyId === e.id, changeStatus)}</td> : null}
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

      {creating ? (
        <Modal title="จองกิจกรรม / พิธี" sub="บันทึกงานบุญ พิธี หรือกิจกรรมใหม่" onClose={() => setCreating(false)}
          footer={<><Button variant="secondary" onClick={() => setCreating(false)}>ยกเลิก</Button><Button variant="primary" disabled={saving} onClick={() => void submitCreate()}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Button></>}>
          <div className="field"><label>ประเภทงาน</label>
            <select className="control" value={cType} onChange={(e) => setCType(e.target.value as CeremonyType)}>
              {CEREMONY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field"><label>จองศาลา/สถานที่ของวัด</label>
            <select className="control" value={cHallId} onChange={(e) => setCHallId(e.target.value)}>
              <option value="">ไม่จองศาลา (ระบุสถานที่เองด้านล่าง)</option>
              {halls.filter((h) => h.isActive).map((h) => (
                <option key={h.id} value={h.id}>{h.name}{h.capacity ? ` (จุ ${h.capacity})` : ""}</option>
              ))}
            </select>
            <span className="hint">ระบบกันจองชน: ศาลาเดียวกันรับได้วันละ 1 งาน หากชนจะแจ้งชื่องานที่จองไว้</span>
          </div>
          {monks.length > 0 ? (
            <div className="field"><label>นิมนต์พระจากทะเบียน ({cMonkIds.length} รูป)</label>
              <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "6px 10px" }}>
                {monks.map((m) => (
                  <label key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={cMonkIds.includes(m.id)}
                      onChange={(e) => setCMonkIds((ids) => e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id))}
                    />
                    <span>{m.displayName}{m.rank ? ` · ${m.rank}` : ""}</span>
                  </label>
                ))}
              </div>
              <span className="hint">ระบบกันตารางพระชน: พระหนึ่งรูปรับนิมนต์ได้วันละ 1 งาน</span>
            </div>
          ) : null}
          {CEREMONY_FORM_SECTIONS.flatMap((section) => section.fields).map((f) => (
            <div className="field" key={f.key as string}>
              <label>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea className="control" style={{ minHeight: 56 }} value={draft[f.key as string] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key as string]: e.target.value })} />
              ) : (
                <input className="control" type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "numeric" : undefined} value={draft[f.key as string] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key as string]: e.target.value })} />
              )}
            </div>
          ))}
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={cPublic} onChange={(e) => setCPublic(e.target.checked)} />
            <span>เผยแพร่กิจกรรมนี้สู่หน้าสาธารณะ (ให้ญาติโยมทั่วไปเห็น)</span>
          </label>
          {saveErr ? <p className="error-text">{saveErr}</p> : null}
        </Modal>
      ) : null}

      {managingHalls ? (
        <Modal title="จัดการศาลา/สถานที่ของวัด" sub="ทะเบียนศาลาที่ใช้รับจองงานพิธี" onClose={() => setManagingHalls(false)}
          footer={<Button variant="secondary" onClick={() => setManagingHalls(false)}>ปิด</Button>}>
          <div>
            {halls.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>ยังไม่มีศาลาในทะเบียน — เพิ่มด้านล่าง</p>
            ) : (
              halls.map((h) => (
                <div key={h.id} className="between" style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13.5 }}>
                  <span>
                    <span style={{ fontWeight: 600 }}>{h.name}</span>
                    {h.capacity ? <span className="muted"> · จุ {h.capacity}</span> : null}
                    {!h.isActive ? <Badge kind="void">ปิดใช้งาน</Badge> : null}
                  </span>
                  <Button variant="secondary" size="sm" disabled={hallBusy} onClick={() => void toggleHall(h)}>
                    {h.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                  </Button>
                </div>
              ))
            )}
            <div className="form-grid" style={{ marginTop: 14 }}>
              <label className="field"><span className="label">ชื่อศาลาใหม่</span><input className="control" value={hallName} onChange={(e) => setHallName(e.target.value)} placeholder="เช่น ศาลาการเปรียญ" /></label>
              <label className="field"><span className="label">ความจุ (คน ไม่บังคับ)</span><input className="control tnum" inputMode="numeric" value={hallCapacity} onChange={(e) => setHallCapacity(e.target.value.replace(/[^0-9]/g, ""))} /></label>
            </div>
            {hallErr ? <p className="error-text">{hallErr}</p> : null}
            <Button variant="primary" disabled={hallBusy} onClick={() => void addHall()}>{hallBusy ? "กำลังบันทึก…" : "เพิ่มศาลา"}</Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

// ============ 7. MONK & STAFF ============
function isMonkish(type: string): boolean {
  return type === "monk" || type === "novice";
}

export function DesignPeople({ api, canWrite }: { api?: PersonnelApi; canWrite?: boolean }): ReactElement {
  const [people, setPeople] = useState<Personnel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pType, setPType] = useState<PersonnelType>("monk");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  useEffect(() => {
    if (!api) return;
    let active = true;
    api.list().then(
      (rows) => { if (active) setPeople(rows); },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, reloadKey]);

  function openCreate(): void {
    setPType("monk");
    setDraft({});
    setSaveErr(null);
    setCreating(true);
  }
  async function submitCreate(): Promise<void> {
    if (!api) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await api.create({ personnelType: pType, status: "active", ...draft } as unknown as CreatePersonnelInput);
      setCreating(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const all = people ?? [];
  const monkCount = all.filter((p) => isMonkish(p.personnelType)).length;
  const staffCount = all.filter((p) => p.personnelType === "staff").length;
  const filtered = all.filter((p) => {
    if (kind === "monk" && !isMonkish(p.personnelType)) return false;
    if (kind === "staff" && p.personnelType !== "staff") return false;
    const chaya = p.dharmaName ?? p.displayName;
    if (q && !(chaya.includes(q) || p.displayName.includes(q) || (p.position ?? "").includes(q))) return false;
    return true;
  });
  const countLabel = (n: number): string => (people ? ` (${n})` : "");

  return (
    <div className="content-wrap">
      <PageHead eyebrow="งานวัด" title="พระสงฆ์และเจ้าหน้าที่" desc="ทะเบียนพระภิกษุ สามเณร และเจ้าหน้าที่ของวัด พร้อมประวัติและข้อมูลติดต่อ"
        actions={canWrite ? <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={openCreate}>เพิ่มบุคลากร</Button> : undefined} />
      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดข้อมูลบุคลากรไม่สำเร็จ: {error}</div> : null}
      <Card>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="ค้นหาฉายา ชื่อ หรือตำแหน่ง" />
          <div className="seg" style={{ marginLeft: 4 }}>
            <button type="button" className={kind === "all" ? "active" : ""} onClick={() => setKind("all")}>ทั้งหมด</button>
            <button type="button" className={kind === "monk" ? "active" : ""} onClick={() => setKind("monk")}>พระ-เณร{countLabel(monkCount)}</button>
            <button type="button" className={kind === "staff" ? "active" : ""} onClick={() => setKind("staff")}>เจ้าหน้าที่{countLabel(staffCount)}</button>
          </div>
        </Toolbar>
        <Table>
          <thead><tr><th>ฉายา / ชื่อ</th><th>ประเภท</th><th>ตำแหน่ง</th><th>พรรษา</th><th>ติดต่อ</th><th>สถานะ</th><th /></tr></thead>
          <tbody>
            {!people ? (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: "20px" }}>ยังไม่มีบุคลากร</td></tr>
            ) : (
              filtered.map((p) => {
                const staff = p.personnelType === "staff";
                const chaya = p.dharmaName ?? p.displayName;
                const secular = p.secularName ?? (staff ? null : p.displayName);
                return (
                  <tr key={p.id} className="clickable">
                    <td><div className="row" style={{ gap: 10 }}>
                      <span className={`av ${staff ? "blue" : ""}`.trim()}>{chaya.replace(/^(นาย|นางสาว|นาง|พระ|สามเณร)\s?/, "").charAt(0)}</span>
                      <span><span style={{ display: "block", fontWeight: 500 }}>{chaya}</span>{secular && secular !== chaya ? <span className="muted" style={{ fontSize: 12 }}>{secular}</span> : null}</span>
                    </div></td>
                    <td><Badge kind={staff ? "reconciled" : "accent"}>{personnelTypeLabel(p.personnelType)}</Badge></td>
                    <td>{p.position ?? p.rank ?? <span className="muted">—</span>}</td>
                    <td className="tnum">{p.phansaCount != null ? `${p.phansaCount} พรรษา` : <span className="muted">—</span>}</td>
                    <td className="muted">{p.phone ?? "—"}</td>
                    <td><Badge kind="credit" dot>{personnelStatusLabel(p.status)}</Badge></td>
                    <td className="num"><Icon name="chevR" size={15} style={{ color: "var(--ink-3)" }} /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>

      {creating ? (
        <Modal title="เพิ่มบุคลากร" sub="บันทึกพระภิกษุ สามเณร หรือเจ้าหน้าที่ใหม่" onClose={() => setCreating(false)}
          footer={<><Button variant="secondary" onClick={() => setCreating(false)}>ยกเลิก</Button><Button variant="primary" disabled={saving} onClick={() => void submitCreate()}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Button></>}>
          <div className="field"><label>ประเภท</label>
            <select className="control" value={pType} onChange={(e) => setPType(e.target.value as PersonnelType)}>
              {PERSONNEL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {PERSONNEL_FORM_SECTIONS.flatMap((section) => section.fields).map((f) => (
            <div className="field" key={f.key as string}>
              <label>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea className="control" style={{ minHeight: 56 }} value={draft[f.key as string] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key as string]: e.target.value })} />
              ) : (
                <input className="control" type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "numeric" : undefined} value={draft[f.key as string] ?? ""} onChange={(e) => setDraft({ ...draft, [f.key as string]: e.target.value })} />
              )}
            </div>
          ))}
          {saveErr ? <p className="error-text">{saveErr}</p> : null}
        </Modal>
      ) : null}
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

// Design report cards -> real ReportType (donations/receipts/ledger). The remaining design
// reports (donors/events/fund) have no export endpoint yet and are flagged unsupported.
const REPORT_TYPE_BY_ID: Record<string, ReportType | undefined> = { donations: "donations", ledger: "ledger", tax: "receipts" };

export function DesignReports({ api, today }: { api?: ReportsApi; today?: string }): ReactElement {
  const todayIso = today ?? "2026-06-04";
  const [sel, setSel] = useState("donations");
  const [fmt, setFmt] = useState("csv");
  const [dateFrom, setDateFrom] = useState(`${todayIso.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(todayIso);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cur = REPORTS.find((r) => r.id === sel) ?? REPORTS[0];
  const reportType = REPORT_TYPE_BY_ID[sel];
  if (!cur) return <div className="content-wrap" />;

  async function generate(): Promise<void> {
    if (!api) return;
    setResult(null);
    setError(null);
    if (!reportType) { setError("รายงานนี้ยังไม่พร้อมส่งออก (ยังไม่มีปลายทางข้อมูล)"); return; }
    if (fmt !== "csv") { setError("ขณะนี้รองรับการส่งออกเป็น CSV เท่านั้น"); return; }
    setBusy(true);
    try {
      const report = await api.get(reportType, { dateFrom, dateTo });
      downloadCsv(reportFilename(reportType, todayIso), report.csv);
      setResult(`สร้างรายงานแล้ว ${report.count} รายการ — ดาวน์โหลด CSV เรียบร้อย`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างรายงานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-wrap">
      <PageHead eyebrow="รายงาน" title="รายงานและส่งออกข้อมูล" desc="สร้างและส่งออกรายงานการเงิน การบริจาค และกิจกรรม สำหรับการตรวจสอบและจัดเก็บ" />
      <div className="split">
        <div className="grid g-2">
          {REPORTS.map((r) => {
            const active = sel === r.id;
            const ready = REPORT_TYPE_BY_ID[r.id] !== undefined;
            return (
              <button key={r.id} type="button" className="card" onClick={() => setSel(r.id)} style={{ textAlign: "left", padding: 18, cursor: "pointer", borderColor: active ? "var(--accent)" : "var(--border)", background: active ? "var(--accent-tint-2)" : "var(--surface)", boxShadow: active ? "0 0 0 1px var(--accent) inset" : "none" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span className="av" style={{ background: active ? "var(--accent)" : "var(--surface-3)", color: active ? "#fff" : "var(--ink-2)" }}><Icon name={r.icon} size={18} /></span>
                  {active ? <Icon name="checkCircle" size={18} style={{ color: "var(--accent)" }} /> : !ready ? <Badge kind="neutral">เร็ว ๆ นี้</Badge> : null}
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
              <label className="field"><span className="label">ช่วงเวลา</span><div style={{ display: "flex", gap: 8, alignItems: "center" }}><input className="control tnum" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /><span className="muted">ถึง</span><input className="control tnum" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div></label>
              <div className="field"><span className="label">รูปแบบไฟล์</span>
                {/* Only formats that actually work are offered — PDF/Excel come back when implemented. */}
                <div className="opt-row">{([["csv", "CSV", "เปิดได้ใน Excel และนำเข้าระบบอื่นได้"]] as Array<[string, string, string]>).map(([k, t, d]) => (
                  <label key={k} className={`opt ${fmt === k ? "sel" : ""}`} onClick={() => setFmt(k)}>
                    <input type="radio" checked={fmt === k} readOnly style={{ marginTop: 2 }} />
                    <span><span className="o-title">{t}</span><span className="o-desc" style={{ display: "block" }}>{d}</span></span>
                  </label>
                ))}</div>
                <span className="hint">PDF และ Excel (.xlsx) จะเพิ่มในรุ่นถัดไป</span>
              </div>
              <Button variant="primary" className="btn-block" icon={<Icon name="download" size={15} />} disabled={busy} onClick={() => void generate()}>{busy ? "กำลังสร้าง…" : "สร้างและดาวน์โหลด"}</Button>
              {result ? <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--credit)", textAlign: "center" }}>{result}</p> : null}
              {error ? <p className="error-text" style={{ textAlign: "center" }}>{error}</p> : null}
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

export function DesignRoles({ role, api }: { role: TempleRole; api?: UsersApi }): ReactElement {
  const [tab, setTab] = useState<"users" | "perms">("users");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [users, setUsers] = useState<TenantUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<{ kind: "create" } | { kind: "edit"; user: TenantUser } | null>(null);
  const [form, setForm] = useState<{ email: string; displayName: string; role: TempleRole; password: string; isActive: boolean }>({ email: "", displayName: "", role: "staff", password: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const canManage = role === "admin";
  useEffect(() => {
    if (!api) return;
    let active = true;
    api.list().then(
      (rows) => { if (active) setUsers(rows); },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, reloadKey]);

  function openCreate(): void {
    setForm({ email: "", displayName: "", role: "staff", password: "", isActive: true });
    setSaveErr(null);
    setModal({ kind: "create" });
  }
  function openEdit(user: TenantUser): void {
    setForm({ email: user.email, displayName: user.displayName, role: user.role, password: "", isActive: user.isActive });
    setSaveErr(null);
    setModal({ kind: "edit", user });
  }
  async function submitUser(): Promise<void> {
    if (!api || !modal) return;
    setSaving(true);
    setSaveErr(null);
    try {
      if (modal.kind === "create") {
        const payload: CreateUserInput = { email: form.email.trim(), displayName: form.displayName.trim(), role: form.role, password: form.password };
        await api.create(payload);
      } else {
        const patch: UpdateUserInput = { displayName: form.displayName.trim(), role: form.role, isActive: form.isActive };
        if (form.password.trim() !== "") patch.password = form.password;
        await api.update(modal.user.id, patch);
      }
      setModal(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  const all = users ?? [];
  const filtered = all.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (q && !(u.displayName.includes(q) || u.email.includes(q))) return false;
    return true;
  });
  const activeCount = all.filter((u) => u.isActive).length;
  const num = (n: number): string => (users ? String(n) : "…");
  return (
    <div className="content-wrap">
      <PageHead eyebrow="ระบบ" title="สิทธิ์ผู้ใช้งาน" desc="จัดการบัญชีผู้ใช้ของวัด กำหนดบทบาทและระดับสิทธิ์การเข้าถึงแต่ละส่วนของระบบ"
        actions={canManage ? (tab === "users" ? <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={openCreate}>เพิ่มบัญชีผู้ใช้</Button> : <Button variant="primary" icon={<Icon name="check" size={15} />} disabled title="ตารางสิทธิ์เป็นค่ามาตรฐานของระบบ">บันทึกการเปลี่ยนแปลง</Button>) : undefined} />
      <div className="seg" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Icon name="donors" size={14} />บัญชีผู้ใช้งาน</button>
        <button type="button" className={tab === "perms" ? "active" : ""} onClick={() => setTab("perms")}><Icon name="roles" size={14} />บทบาทและสิทธิ์</button>
      </div>

      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดข้อมูลผู้ใช้ไม่สำเร็จ: {error}</div> : null}
      {tab === "users" ? (
        <>
          <div className="grid g-4" style={{ marginBottom: 16 }}>
            <KPI label="บัญชีทั้งหมด" icon="donors" value={num(all.length)} />
            <KPI label="ใช้งานอยู่" icon="checkCircle" value={num(activeCount)} tone="credit" />
            <KPI label="ปิดใช้งาน" icon="lock" value={num(all.length - activeCount)} />
            <KPI label="ผู้ดูแลระบบ" icon="roles" value={num(all.filter((u) => u.role === "admin").length)} />
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
              <thead><tr><th>ชื่อ-นามสกุล</th><th>อีเมล</th><th>บทบาท</th><th>เพิ่มเมื่อ</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {!users ? (
                  <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดข้อมูลไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "20px" }}>ไม่พบบัญชีผู้ใช้</td></tr>
                ) : (
                  filtered.map((u) => (
                    <tr key={u.id} style={!u.isActive ? { opacity: 0.6 } : undefined}>
                      <td><div className="row" style={{ gap: 10 }}><span className={`av ${u.role === "finance" ? "blue" : u.role === "staff" ? "green" : ""}`.trim()}>{u.displayName.replace(/^(นาย|นางสาว|นาง|พระ)\s?/, "").charAt(0)}</span><span style={{ fontWeight: 500 }}>{u.displayName}</span></div></td>
                      <td className="muted" style={{ fontSize: 13 }}>{u.email}</td>
                      <td><Badge kind={ROLE_TAG[u.role]} dot>{roleLabel(u.role)}</Badge></td>
                      <td className="muted" style={{ fontSize: 13 }}>{u.createdAt.slice(0, 10)}</td>
                      <td><Badge kind={u.isActive ? "credit" : "void"} dot>{u.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</Badge></td>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>{canManage ? <Button variant="tertiary" size="sm" onClick={() => openEdit(u)}>แก้ไข</Button> : null}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
            <div className="t-foot"><span>แสดง {filtered.length} จาก {all.length} บัญชี</span><span className="row" style={{ gap: 6 }}><Icon name="info" size={13} />ปิดใช้งานแทนการลบ เพื่อรักษาประวัติการทำรายการ</span></div>
          </Card>
        </>
      ) : (
        <>
          <div className="grid g-3" style={{ marginBottom: 16 }}>
            {ROLE_DEFS.map((r) => (
              <div className="kpi" key={r.key}>
                <div className="k-label"><Icon name="roles" size={15} style={{ color: "var(--ink-3)" }} />{r.name}</div>
                <div className="k-value tnum" style={{ fontSize: 22 }}>{users ? all.filter((u) => u.role === r.key).length : "…"} <span style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 400 }}>คน</span></div>
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

      {modal ? (
        <Modal
          title={modal.kind === "create" ? "เพิ่มบัญชีผู้ใช้" : "แก้ไขบัญชีผู้ใช้"}
          sub={modal.kind === "edit" ? modal.user.email : "สร้างบัญชีผู้ใช้งานใหม่ของวัด"}
          onClose={() => setModal(null)}
          footer={<><Button variant="secondary" onClick={() => setModal(null)}>ยกเลิก</Button><Button variant="primary" disabled={saving} onClick={() => void submitUser()}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Button></>}
        >
          {modal.kind === "create" ? (
            <div className="field"><label>อีเมล</label><input className="control" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@wat.local" /></div>
          ) : (
            <div className="field"><label>อีเมล</label><input className="control" value={form.email} disabled /><span className="hint">อีเมลแก้ไขไม่ได้</span></div>
          )}
          <div className="field"><label>ชื่อ-นามสกุล</label><input className="control" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="ชื่อ-นามสกุล" /></div>
          <div className="field"><label>บทบาท</label>
            <select className="control" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as TempleRole })}>
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field"><label>รหัสผ่าน</label><input className="control" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={modal.kind === "edit" ? "เว้นว่างถ้าไม่เปลี่ยน" : "อย่างน้อย 8 ตัวอักษร"} /></div>
          {modal.kind === "edit" ? (
            <label className="row" style={{ gap: 8, cursor: "pointer", fontSize: 13 }}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />เปิดใช้งานบัญชี</label>
          ) : null}
          {saveErr ? <p className="error-text">{saveErr}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}

// ============ 10. AUDIT LOG ============
// Real audit actions are namespaced ("donation:void"); chips filter by family
// prefix and the verb after ":" picks the badge.
const AUDIT_FAMILIES: Array<{ prefix: string; label: string }> = [
  { prefix: "donation", label: "การบริจาค" },
  { prefix: "receipt", label: "ใบอนุโมทนา" },
  { prefix: "ledger", label: "บัญชี" },
  { prefix: "attachment", label: "ไฟล์แนบ" },
  { prefix: "user", label: "ผู้ใช้" },
  { prefix: "period", label: "งวดบัญชี" },
];
const AUDIT_VERB_META: Record<string, { label: string; cls: "credit" | "pending" | "accent" | "reconciled" | "debit" | "neutral" }> = {
  create: { label: "สร้าง", cls: "credit" }, post: { label: "ลงบัญชี", cls: "credit" }, update: { label: "แก้ไข", cls: "pending" },
  issue: { label: "ออกเอกสาร", cls: "accent" }, reissue: { label: "ออกใหม่", cls: "accent" }, reconcile: { label: "กระทบยอด", cls: "reconciled" },
  unreconcile: { label: "ยกเลิกกระทบยอด", cls: "pending" }, void: { label: "ยกเลิก", cls: "debit" }, cancel: { label: "ยกเลิก", cls: "debit" },
  delete: { label: "ลบ", cls: "debit" }, close: { label: "ปิดงวด", cls: "reconciled" }, export: { label: "ส่งออก", cls: "reconciled" },
};
const AUDIT_ENTITY_LABELS: Record<string, string> = {
  donation: "การบริจาค", receipt: "ใบอนุโมทนาบัตร", ledger_entry: "รายการบัญชี", attachment: "ไฟล์แนบ",
  user: "ผู้ใช้", reconciliation_period: "งวดบัญชี", report: "รายงาน", donor: "ผู้บริจาค",
  ceremony: "งานพิธี", personnel: "บุคลากร", borrowable_item: "ของวัด", item_loan: "การยืมของ",
};
const AUDIT_ROLE_LABELS: Record<string, string> = { admin: "ผู้ดูแลระบบ", finance: "ฝ่ายการเงิน", staff: "เจ้าหน้าที่" };

function auditVerbMeta(action: string): { label: string; cls: "credit" | "pending" | "accent" | "reconciled" | "debit" | "neutral" } {
  const verb = action.includes(":") ? action.slice(action.indexOf(":") + 1) : action;
  return AUDIT_VERB_META[verb] ?? { label: verb, cls: "neutral" };
}

const AUDIT_PAGE_SIZE = 50;

export function DesignAudit({ api }: { api?: AuditApi }): ReactElement {
  const [q, setQ] = useState("");
  const [family, setFamily] = useState("all");
  const [logs, setLogs] = useState<AuditLogView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!api) return;
    let active = true;
    setLogs(null);
    setError(null);
    api.list({
      ...(family !== "all" ? { actionPrefix: `${family}:` } : {}),
      take: AUDIT_PAGE_SIZE,
      skip: page * AUDIT_PAGE_SIZE,
    }).then(
      (rows) => { if (active) setLogs(rows); },
      (err: unknown) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, family, page]);

  const filtered = (logs ?? []).filter((l) => {
    if (!q) return true;
    const hay = `${l.actorName ?? ""} ${l.action} ${l.entityType} ${l.reason ?? ""}`;
    return hay.includes(q);
  });

  return (
    <div className="content-wrap">
      <PageHead eyebrow="ระบบ" title="บันทึกการใช้งาน" desc="บันทึกทุกการกระทำสำคัญในระบบ — ใครทำอะไร เมื่อไร เพื่อการตรวจสอบและความโปร่งใส ข้อมูลนี้ลบไม่ได้" />
      {error ? <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>โหลดบันทึกการใช้งานไม่สำเร็จ: {error}</div> : null}
      <Card>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="ค้นหาผู้ใช้ การกระทำ หรือเหตุผล" />
          <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />
          <button type="button" className={`chip ${family === "all" ? "active" : ""}`} onClick={() => { setFamily("all"); setPage(0); }}>ทั้งหมด</button>
          {AUDIT_FAMILIES.map((f) => <button key={f.prefix} type="button" className={`chip ${family === f.prefix ? "active" : ""}`} onClick={() => { setFamily(f.prefix); setPage(0); }}>{f.label}</button>)}
          <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} รายการ</span>
        </Toolbar>
        <Table>
          <thead><tr><th>เวลา</th><th>ผู้ใช้งาน</th><th>การกระทำ</th><th>รายการ / เหตุผล</th><th>IP</th></tr></thead>
          <tbody>
            {!logs ? (
              <tr><td colSpan={5} className="muted" style={{ padding: 18 }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="muted" style={{ padding: 18 }}>ยังไม่มีบันทึกการใช้งานในหมวดนี้</td></tr>
            ) : filtered.map((l) => {
              const m = auditVerbMeta(l.action);
              const actorName = l.actorName ?? (l.actorType === "devotee" ? "ญาติโยม (พอร์ทัล)" : "ระบบ");
              const roleLabel = l.actorRole ? (AUDIT_ROLE_LABELS[l.actorRole] ?? l.actorRole) : l.actorType === "devotee" ? "พอร์ทัลญาติโยม" : "—";
              return (
                <tr key={l.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{l.createdAt.slice(0, 19).replace("T", " ")}</td>
                  <td><div className="row" style={{ gap: 9 }}>
                    <span className={`av ${l.actorRole === "finance" ? "blue" : l.actorRole === "staff" ? "green" : ""}`.trim()} style={!l.actorName ? { background: "var(--surface-3)", color: "var(--ink-3)" } : undefined}>{actorName.charAt(0)}</span>
                    <span><span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{actorName}</span><span className="muted" style={{ fontSize: 11.5 }}>{roleLabel}</span></span>
                  </div></td>
                  <td><Badge kind={m.cls} dot>{m.label}</Badge></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{AUDIT_ENTITY_LABELS[l.entityType] ?? l.entityType}{l.entityId ? <span className="mono muted" style={{ fontSize: 11.5 }}> · {l.entityId.slice(0, 8)}</span> : null}</div>
                    {l.reason ? <div className="muted" style={{ fontSize: 12.5 }}>เหตุผล: {l.reason}</div> : null}
                  </td>
                  <td className="mono muted" style={{ fontSize: 12 }}>{l.ip ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <div className="t-foot">
          <span className="row" style={{ gap: 8 }}>
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>ก่อนหน้า</Button>
            <span>หน้า {page + 1}</span>
            <Button variant="secondary" size="sm" disabled={!logs || logs.length < AUDIT_PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
          </span>
          <span className="row" style={{ gap: 6 }}><Icon name="lock" size={13} />บันทึกนี้ไม่สามารถแก้ไขหรือลบได้</span>
        </div>
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
