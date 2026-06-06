import { FormEvent, ReactElement, useEffect, useState } from "react";
import {
  DONATION_METHODS,
  DONATION_METHOD_LABELS_TH,
  type DonationMethod,
  MAX_DEVOTEE_DONATION_SATANG,
  type PublicTempleProfile,
  formatSatang,
} from "@wat/shared";
import { Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import {
  DevoteeApi,
  DevoteeDonationValues,
  DonationResult,
  bahtStringToSatang,
  devoteeErrorMessage,
} from "./devotee-auth";

export interface TemplePageProps {
  api: DevoteeApi;
  token: string;
  templeId: string;
  today: string;
  onBack: () => void;
  onUnauthorized: () => void;
}

function profileRows(temple: PublicTempleProfile): { label: string; value: string }[] {
  const address = [temple.addressTh, temple.subdistrict, temple.district, temple.province, temple.postalCode]
    .filter(Boolean)
    .join(" ");
  return [
    { label: "ที่อยู่", value: address || "—" },
    { label: "เจ้าอาวาส", value: temple.abbotName || "—" },
    { label: "นิกาย", value: temple.denomination || "—" },
    { label: "โทรศัพท์", value: temple.phone || "—" },
    { label: "อีเมล", value: temple.email || "—" },
  ];
}

export function TemplePage({
  api,
  token,
  templeId,
  today,
  onBack,
  onUnauthorized,
}: TemplePageProps): ReactElement {
  const [temple, setTemple] = useState<PublicTempleProfile | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getTemple(token, templeId)
      .then((data) => {
        if (!cancelled) setTemple(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err && typeof err === "object" && "status" in err && err.status === 401) {
          onUnauthorized();
          return;
        }
        setLoadError(devoteeErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, templeId, onUnauthorized]);

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <button type="button" className="link-btn" onClick={onBack}>
            ← กลับไปเลือกวัด
          </button>
          <h1>{temple?.nameTh ?? "ข้อมูลวัด"}</h1>
          {temple?.nameEn ? <p className="page-sub">{temple.nameEn}</p> : null}
        </div>
      </div>

      {loadError ? <p className="auth-error" role="alert">{loadError}</p> : null}
      {temple === null && !loadError ? <p className="muted">กำลังโหลดข้อมูลวัด…</p> : null}

      {temple ? (
        <div className="devotee-temple-detail">
          <div className="card devotee-temple-info">
            <div className="devotee-temple-logo lg" aria-hidden="true">
              {temple.logoUrl ? <img src={temple.logoUrl} alt="" /> : <Icon name="lotus" size={36} />}
            </div>
            <dl className="devotee-info-list">
              {profileRows(temple).map((row) => (
                <div key={row.label} className="devotee-info-row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <DonateForm api={api} token={token} templeId={templeId} today={today} onUnauthorized={onUnauthorized} />
        </div>
      ) : null}
    </div>
  );
}

interface DonateFormProps {
  api: DevoteeApi;
  token: string;
  templeId: string;
  today: string;
  onUnauthorized: () => void;
}

function DonateForm({ api, token, templeId, today, onUnauthorized }: DonateFormProps): ReactElement {
  const [values, setValues] = useState<DevoteeDonationValues>({
    amountBaht: "",
    method: "cash",
    donationDate: today,
    note: "",
  });
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DonationResult | null>(null);

  function update<K extends keyof DevoteeDonationValues>(key: K, value: DevoteeDonationValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setFieldError("");
    setResult(null);
    const satang = bahtStringToSatang(values.amountBaht);
    if (!Number.isInteger(satang) || satang < 1) {
      setFieldError("กรุณากรอกจำนวนเงินให้ถูกต้อง (มากกว่า 0 บาท)");
      return;
    }
    if (satang > MAX_DEVOTEE_DONATION_SATANG) {
      setFieldError("จำนวนเงินสูงเกินไป");
      return;
    }
    if (!values.donationDate) {
      setFieldError("กรุณาเลือกวันที่บริจาค");
      return;
    }
    setBusy(true);
    try {
      const created = await api.donate(token, templeId, values);
      setResult(created);
      setValues((current) => ({ ...current, amountBaht: "", note: "" }));
    } catch (err) {
      if (err && typeof err === "object" && "status" in err && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(devoteeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card devotee-donate">
      <h2 className="devotee-donate-title">ร่วมทำบุญ</h2>

      {result ? (
        <div className="auth-success" role="status">
          <p>
            อนุโมทนาบุญ! บันทึกการบริจาค {formatSatang(result.donation.amountSatang)} บาท เรียบร้อยแล้ว
          </p>
          <p className="muted">เลขที่รายการบัญชี: {result.ledgerEntry.entryNo}</p>
        </div>
      ) : null}

      <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="field">
          <label htmlFor="devotee-amount">จำนวนเงิน (บาท)</label>
          <input
            id="devotee-amount"
            className="control"
            inputMode="decimal"
            value={values.amountBaht}
            onChange={(event) => update("amountBaht", event.target.value)}
            placeholder="0.00"
            aria-invalid={fieldError ? true : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="devotee-method">ช่องทาง</label>
          <select
            id="devotee-method"
            className="control"
            value={values.method}
            onChange={(event) => update("method", event.target.value as DonationMethod)}
          >
            {DONATION_METHODS.map((method) => (
              <option key={method} value={method}>
                {DONATION_METHOD_LABELS_TH[method]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="devotee-date">วันที่บริจาค</label>
          <input
            id="devotee-date"
            className="control"
            type="date"
            value={values.donationDate}
            onChange={(event) => update("donationDate", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="devotee-note">หมายเหตุ (ไม่บังคับ)</label>
          <input
            id="devotee-note"
            className="control"
            value={values.note}
            onChange={(event) => update("note", event.target.value)}
            placeholder="เช่น ร่วมบุญสร้างศาลา"
          />
        </div>
        {fieldError ? <p className="error-text">{fieldError}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <Button type="submit" variant="primary" className="btn-block" disabled={busy}>
          {busy ? "กำลังบันทึก…" : "ยืนยันการบริจาค"}
        </Button>
      </form>
    </div>
  );
}
