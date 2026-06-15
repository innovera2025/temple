import { ReactElement, useEffect, useState } from "react";
import { formatSatang } from "@wat/shared";
import { Icon, type IconName } from "../../layout/icons";
import { DevoteePage } from "./devotee-shell";
import { DevoteeQuickActions } from "./temple-page";
import {
  DevoteeApi,
  DevoteeCeremonyRecord,
  DevoteeDonationRecord,
  DevoteeItemLoanRecord,
  DevoteeReceiptRecord,
  devoteeErrorMessage,
} from "./devotee-auth";

export interface DevoteeHomeProps {
  api: DevoteeApi;
  token: string;
  displayName: string;
  activeTempleName: string | null;
  onGoto: (page: DevoteePage) => void;
  onUnauthorized: () => void;
}

interface Summary {
  donations: DevoteeDonationRecord[];
  receipts: DevoteeReceiptRecord[];
  ceremonies: DevoteeCeremonyRecord[];
  loans: DevoteeItemLoanRecord[];
}

function Kpi({ label, icon, value, foot }: { label: string; icon: IconName; value: string; foot?: string }): ReactElement {
  return (
    <div className="kpi">
      <div className="k-label">
        <Icon name={icon} size={15} style={{ color: "var(--ink-3)" }} />
        {label}
      </div>
      <div className="k-value tnum">{value}</div>
      {foot ? <div className="k-foot"><span>{foot}</span></div> : null}
    </div>
  );
}

/** ญาติโยม home: a personal summary (KPIs), quick actions, and recent merit — the lay-home of the design. */
export function DevoteeHome({ api, token, displayName, activeTempleName, onGoto, onUnauthorized }: DevoteeHomeProps): ReactElement {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    Promise.all([api.myDonations(token), api.myReceipts(token), api.myCeremonies(token), api.myItemLoans(token)])
      .then(([donations, receipts, ceremonies, loans]) => {
        if (!cancelled) setData({ donations, receipts, ceremonies, loans });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err && typeof err === "object" && "status" in err && err.status === 401) {
          onUnauthorized();
          return;
        }
        setError(devoteeErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, onUnauthorized]);

  const loading = data === null && !error;
  const totalDonated =
    data?.donations.reduce((sum, d) => sum + BigInt(d.amountSatang || "0"), 0n) ?? 0n;
  const pendingCeremonies = data?.ceremonies.filter((c) => c.status === "requested").length ?? 0;
  const activeLoans = data?.loans.filter((l) => l.status === "borrowed").length ?? 0;
  const recent = (data?.donations ?? []).slice(0, 5);
  const v = (n: number): string => (loading ? "…" : String(n));

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">หน้าหลัก</div>
          <h1>สวัสดี {displayName}</h1>
          <p className="desc">ขออนุโมทนาบุญ — นี่คือสรุปการร่วมบุญและรายการของคุณ</p>
        </div>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        <Kpi label="ยอดร่วมบุญรวม" icon="donation" value={loading ? "…" : `${formatSatang(totalDonated.toString())} บาท`} foot={`${v(data?.donations.length ?? 0)} ครั้ง`} />
        <Kpi label="ใบอนุโมทนา" icon="receipt" value={v(data?.receipts.length ?? 0)} foot="ใบ" />
        <Kpi label="คำขอจองพิธี" icon="event" value={v(data?.ceremonies.length ?? 0)} foot={`รอยืนยัน ${v(pendingCeremonies)}`} />
        <Kpi label="รายการยืมของ" icon="box" value={v(data?.loans.length ?? 0)} foot={`กำลังยืม ${v(activeLoans)}`} />
      </div>

      <div className="card devotee-active-temple" style={{ marginBottom: 18 }}>
        <Icon name="building" size={18} />
        <span className="devotee-active-temple-text">
          {activeTempleName ? <>กำลังทำบุญกับ: <b>{activeTempleName}</b></> : "ยังไม่ได้เลือกวัด — เลือกวัดเพื่อเริ่มทำบุญ"}
        </span>
        <button type="button" className="link-btn" onClick={() => onGoto("picker")}>
          {activeTempleName ? "เปลี่ยนวัด" : "ไปเลือกวัด"}
        </button>
      </div>

      <DevoteeQuickActions onGoto={onGoto} />

      <div className="card" style={{ marginTop: 4 }}>
        <div className="card-head">
          <div><h3>ร่วมบุญล่าสุด</h3><div className="sub">การบริจาคล่าสุดของคุณ</div></div>
          <button type="button" className="link-btn" onClick={() => onGoto("donations")}>ดูทั้งหมด</button>
        </div>
        <div className="t-scroll">
          <table className="tbl">
            <thead><tr><th>วันที่</th><th>วัด</th><th className="num">จำนวน (บาท)</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 20 }}>กำลังโหลด…</td></tr>
              ) : recent.length === 0 ? (
                <tr><td colSpan={3} className="muted" style={{ textAlign: "center", padding: 20 }}>ยังไม่มีรายการร่วมบุญ</td></tr>
              ) : (
                recent.map((d) => (
                  <tr key={d.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{d.donationDate}</td>
                    <td>{d.templeNameTh}</td>
                    <td className="num tnum">{formatSatang(d.amountSatang)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
