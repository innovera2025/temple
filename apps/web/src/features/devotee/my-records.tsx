import { ReactElement, useEffect, useState } from "react";
import {
  CEREMONY_STATUS_LABELS_TH,
  CEREMONY_TYPE_LABELS_TH,
  type CeremonyStatus,
  type CeremonyType,
  DONATION_METHOD_LABELS_TH,
  type DonationMethod,
  LOAN_STATUS_LABELS_TH,
  type LoanStatus,
  formatSatang,
} from "@wat/shared";
import { Badge, Button, Modal } from "../../design-system";
import {
  DevoteeApi,
  DevoteeCeremonyRecord,
  DevoteeDonationRecord,
  DevoteeItemLoanRecord,
  DevoteeReceiptRecord,
  ReceiptPreview,
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

function ceremonyTypeLabel(type: string): string {
  return CEREMONY_TYPE_LABELS_TH[type as CeremonyType] ?? type;
}

function ceremonyStatusBadge(status: string): ReactElement {
  const label = CEREMONY_STATUS_LABELS_TH[status as CeremonyStatus] ?? status;
  if (status === "requested") return <Badge kind="pending">{label}</Badge>;
  if (status === "planned") return <Badge kind="accent">{label}</Badge>;
  if (status === "completed") return <Badge kind="reconciled">{label}</Badge>;
  if (status === "cancelled") return <Badge kind="void">{label}</Badge>;
  return <Badge kind="neutral">{label}</Badge>;
}

function loanStatusBadge(status: string): ReactElement {
  const label = LOAN_STATUS_LABELS_TH[status as LoanStatus] ?? status;
  if (status === "requested") return <Badge kind="pending">{label}</Badge>;
  if (status === "borrowed") return <Badge kind="accent">{label}</Badge>;
  if (status === "returned") return <Badge kind="reconciled">{label}</Badge>;
  if (status === "cancelled") return <Badge kind="void">{label}</Badge>;
  return <Badge kind="neutral">{label}</Badge>;
}

/** Shared 401 handler factory for the per-page loaders. */
function makeHandler(cancelledRef: { current: boolean }, onUnauthorized: () => void, setError: (m: string) => void) {
  return (err: unknown): void => {
    if (cancelledRef.current) return;
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
      onUnauthorized();
      return;
    }
    setError(devoteeErrorMessage(err));
  };
}

export function MyDonations({ api, token, onUnauthorized }: MyRecordsProps): ReactElement {
  const [donations, setDonations] = useState<DevoteeDonationRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const cancelledRef = { current: false };
    const handle = makeHandler(cancelledRef, onUnauthorized, setError);
    api.myDonations(token).then((rows) => !cancelledRef.current && setDonations(rows)).catch(handle);
    return () => {
      cancelledRef.current = true;
    };
  }, [api, token, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <h1>การบริจาคของฉัน</h1>
          <p className="page-sub">รายการบริจาคของคุณจากทุกวัดในระบบ</p>
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
    </div>
  );
}

export function MyReceipts({ api, token, onUnauthorized }: MyRecordsProps): ReactElement {
  const [receipts, setReceipts] = useState<DevoteeReceiptRecord[] | null>(null);
  const [error, setError] = useState("");
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [doc, setDoc] = useState<ReceiptPreview | null>(null);

  async function openReceipt(receiptId: string): Promise<void> {
    setDocBusy(receiptId);
    try {
      setDoc(await api.getReceiptDocument(token, receiptId));
    } catch (err) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        onUnauthorized();
        return;
      }
      setError(devoteeErrorMessage(err));
    } finally {
      setDocBusy(null);
    }
  }

  useEffect(() => {
    const cancelledRef = { current: false };
    const handle = makeHandler(cancelledRef, onUnauthorized, setError);
    api.myReceipts(token).then((rows) => !cancelledRef.current && setReceipts(rows)).catch(handle);
    return () => {
      cancelledRef.current = true;
    };
  }, [api, token, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <h1>ใบอนุโมทนาของฉัน</h1>
          <p className="page-sub">ใบอนุโมทนาบัตรจากการบริจาคของคุณ — เปิดดูและพิมพ์ได้</p>
        </div>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
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
                  <th>เอกสาร</th>
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
                    <td>
                      <Button variant="secondary" disabled={docBusy === row.id} onClick={() => void openReceipt(row.id)}>
                        {docBusy === row.id ? "กำลังเปิด…" : "ดู / พิมพ์"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {doc ? (
        <Modal
          title="ใบอนุโมทนาบุญ"
          sub={`เลขที่ ${doc.receiptNo}`}
          onClose={() => setDoc(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDoc(null)}>ปิด</Button>
              <Button variant="primary" onClick={() => window.print()}>พิมพ์</Button>
            </>
          }
        >
          <div className="devotee-receipt-doc">
            <div className="devotee-receipt-temple">{doc.templeNameTh}</div>
            {doc.templeNameEn ? <div className="muted">{doc.templeNameEn}</div> : null}
            {doc.templeAddressTh ? <div className="muted devotee-receipt-addr">{doc.templeAddressTh}</div> : null}
            {doc.templeReceiptHeaderTh ? <p className="devotee-receipt-header">{doc.templeReceiptHeaderTh}</p> : null}
            <dl className="devotee-info-list devotee-receipt-rows">
              <div className="devotee-info-row"><dt>เลขที่</dt><dd>{doc.receiptNo}</dd></div>
              <div className="devotee-info-row"><dt>วันที่</dt><dd>{doc.donationDate}</dd></div>
              <div className="devotee-info-row"><dt>ผู้บริจาค</dt><dd>{doc.donorName}</dd></div>
              <div className="devotee-info-row"><dt>จำนวนเงิน</dt><dd className="tnum">{formatSatang(doc.amountSatang)} บาท</dd></div>
              <div className="devotee-info-row"><dt>ตัวอักษร</dt><dd>{doc.amountText}</dd></div>
            </dl>
            {doc.templeReceiptFooterTh ? <p className="devotee-receipt-footer muted">{doc.templeReceiptFooterTh}</p> : null}
            {doc.status !== "issued" ? <p className="auth-error">สถานะ: {doc.status === "voided" ? "ยกเลิกแล้ว" : doc.status}</p> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function MyCeremonies({ api, token, onUnauthorized }: MyRecordsProps): ReactElement {
  const [ceremonies, setCeremonies] = useState<DevoteeCeremonyRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const cancelledRef = { current: false };
    const handle = makeHandler(cancelledRef, onUnauthorized, setError);
    api.myCeremonies(token).then((rows) => !cancelledRef.current && setCeremonies(rows)).catch(handle);
    return () => {
      cancelledRef.current = true;
    };
  }, [api, token, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <h1>การจองพิธีของฉัน</h1>
          <p className="page-sub">คำขอจองพิธี / นิมนต์พระ ของคุณจากทุกวัดในระบบ</p>
        </div>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <section className="devotee-records-section">
        <h2>การจองพิธี / นิมนต์พระ</h2>
        {ceremonies === null && !error ? <p className="muted">กำลังโหลด…</p> : null}
        {ceremonies !== null && ceremonies.length === 0 ? (
          <div className="empty-state card"><p>ยังไม่มีการจองพิธี</p></div>
        ) : null}
        {ceremonies !== null && ceremonies.length > 0 ? (
          <div className="t-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>วัด</th>
                  <th>ประเภท</th>
                  <th>ชื่องาน</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {ceremonies.map((row) => (
                  <tr key={row.id}>
                    <td>{row.ceremonyDate}</td>
                    <td>{row.templeNameTh}</td>
                    <td>{ceremonyTypeLabel(row.ceremonyType)}</td>
                    <td>{row.title}</td>
                    <td>{ceremonyStatusBadge(row.status)}</td>
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

export function MyItemLoans({ api, token, onUnauthorized }: MyRecordsProps): ReactElement {
  const [itemLoans, setItemLoans] = useState<DevoteeItemLoanRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const cancelledRef = { current: false };
    const handle = makeHandler(cancelledRef, onUnauthorized, setError);
    api.myItemLoans(token).then((rows) => !cancelledRef.current && setItemLoans(rows)).catch(handle);
    return () => {
      cancelledRef.current = true;
    };
  }, [api, token, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <h1>การยืมของวัด</h1>
          <p className="page-sub">คำขอยืม / รายการยืมสิ่งของวัดของคุณจากทุกวัดในระบบ</p>
        </div>
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <section className="devotee-records-section">
        <h2>การยืมของวัด</h2>
        {itemLoans === null && !error ? <p className="muted">กำลังโหลด…</p> : null}
        {itemLoans !== null && itemLoans.length === 0 ? (
          <div className="empty-state card"><p>ยังไม่มีรายการยืมของ</p></div>
        ) : null}
        {itemLoans !== null && itemLoans.length > 0 ? (
          <div className="t-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>วันที่ยืม</th>
                  <th>วัด</th>
                  <th>สิ่งของ</th>
                  <th className="num">จำนวน</th>
                  <th>กำหนดคืน</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {itemLoans.map((row) => (
                  <tr key={row.id}>
                    <td>{row.loanNo}</td>
                    <td>{row.borrowedAt}</td>
                    <td>{row.templeNameTh}</td>
                    <td>{row.itemName}</td>
                    <td className="num tnum">{row.quantity}</td>
                    <td>{row.dueAt ?? "—"}</td>
                    <td>{loanStatusBadge(row.status)}</td>
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
