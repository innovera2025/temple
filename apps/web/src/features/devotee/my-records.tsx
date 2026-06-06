import { ReactElement, useEffect, useState } from "react";
import { DONATION_METHOD_LABELS_TH, type DonationMethod, formatSatang } from "@wat/shared";
import { Badge } from "../../design-system";
import {
  DevoteeApi,
  DevoteeDonationRecord,
  DevoteeReceiptRecord,
  devoteeErrorMessage,
} from "./devotee-auth";

export interface MyRecordsProps {
  api: DevoteeApi;
  token: string;
  onUnauthorized: () => void;
}

function methodLabel(method: string): string {
  return DONATION_METHOD_LABELS_TH[method as DonationMethod] ?? method;
}

function statusBadge(status: string): ReactElement {
  if (status === "issued") return <Badge kind="reconciled">ออกแล้ว</Badge>;
  if (status === "confirmed") return <Badge kind="credit">สำเร็จ</Badge>;
  if (status === "cancelled" || status === "voided") return <Badge kind="void">ยกเลิก</Badge>;
  return <Badge kind="neutral">{status}</Badge>;
}

export function MyRecords({ api, token, onUnauthorized }: MyRecordsProps): ReactElement {
  const [donations, setDonations] = useState<DevoteeDonationRecord[] | null>(null);
  const [receipts, setReceipts] = useState<DevoteeReceiptRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    function handle(err: unknown): void {
      if (cancelled) return;
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        onUnauthorized();
        return;
      }
      setError(devoteeErrorMessage(err));
    }
    api.myDonations(token).then((rows) => !cancelled && setDonations(rows)).catch(handle);
    api.myReceipts(token).then((rows) => !cancelled && setReceipts(rows)).catch(handle);
    return () => {
      cancelled = true;
    };
  }, [api, token, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <h1>ประวัติการทำบุญของฉัน</h1>
          <p className="page-sub">รายการบริจาคและใบอนุโมทนาของคุณจากทุกวัดในระบบ</p>
        </div>
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <section className="devotee-records-section">
        <h2>รายการบริจาค</h2>
        {donations === null && !error ? <p className="muted">กำลังโหลด…</p> : null}
        {donations !== null && donations.length === 0 ? (
          <div className="empty-state card"><p>ยังไม่มีรายการบริจาค</p></div>
        ) : null}
        {donations !== null && donations.length > 0 ? (
          <div className="t-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>วัด</th>
                  <th>ช่องทาง</th>
                  <th className="num">จำนวน (บาท)</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.donationDate}</td>
                    <td>{row.templeNameTh}</td>
                    <td>{methodLabel(row.method)}</td>
                    <td className="num tnum">{formatSatang(row.amountSatang)}</td>
                    <td>{statusBadge(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="devotee-records-section">
        <h2>ใบอนุโมทนา</h2>
        {receipts === null && !error ? <p className="muted">กำลังโหลด…</p> : null}
        {receipts !== null && receipts.length === 0 ? (
          <div className="empty-state card"><p>ยังไม่มีใบอนุโมทนา</p></div>
        ) : null}
        {receipts !== null && receipts.length > 0 ? (
          <div className="t-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>วัด</th>
                  <th>วันที่</th>
                  <th className="num">จำนวน (บาท)</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.receiptNo}</td>
                    <td>{row.templeNameTh}</td>
                    <td>{row.donationDate}</td>
                    <td className="num tnum">{formatSatang(row.amountSatang)}</td>
                    <td>{statusBadge(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
