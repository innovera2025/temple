import { ReactElement, useEffect, useState } from "react";
import type { PublicTempleSummary } from "@wat/shared";
import { Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import { DevoteeApi, devoteeErrorMessage } from "./devotee-auth";

export interface TemplePickerProps {
  api: DevoteeApi;
  token: string;
  onSelect: (templeId: string) => void;
  onUnauthorized: () => void;
}

function placeOf(temple: PublicTempleSummary): string {
  return [temple.district, temple.province].filter(Boolean).join(" · ") || "ไม่ระบุที่อยู่";
}

export function TemplePicker({ api, token, onSelect, onUnauthorized }: TemplePickerProps): ReactElement {
  const [temples, setTemples] = useState<PublicTempleSummary[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .listTemples(token)
      .then((list) => {
        if (!cancelled) setTemples(list);
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

  const term = query.trim().toLowerCase();
  const visible = (temples ?? []).filter(
    (temple) =>
      !term ||
      temple.nameTh.toLowerCase().includes(term) ||
      (temple.nameEn ?? "").toLowerCase().includes(term) ||
      (temple.province ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <h1>เลือกวัดที่ต้องการติดต่อ</h1>
          <p className="page-sub">เลือกวัดเพื่อร่วมบุญ จองพิธี หรือตรวจรายการสิ่งของที่เปิดให้ยืม</p>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 420 }}>
        <input
          className="control"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ค้นหาวัด / จังหวัด"
          aria-label="ค้นหาวัด"
        />
      </div>

      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      {temples === null && !error ? <p className="muted">กำลังโหลดรายชื่อวัด…</p> : null}

      {temples !== null && visible.length === 0 ? (
        <div className="empty-state card">
          <Icon name="lotus" size={28} />
          <p>{term ? "ไม่พบวัดที่ตรงกับคำค้นหา" : "ยังไม่มีวัดที่เปิดรับในระบบ"}</p>
        </div>
      ) : null}

      <div className="devotee-temple-grid">
        {visible.map((temple) => (
          <div key={temple.id} className="card devotee-temple-card">
            <div className="devotee-temple-logo" aria-hidden="true">
              {temple.logoUrl ? (
                <img src={temple.logoUrl} alt="" />
              ) : (
                <Icon name="lotus" size={24} />
              )}
            </div>
            <div className="devotee-temple-body">
              <div className="devotee-temple-name">{temple.nameTh}</div>
              {temple.nameEn ? <div className="devotee-temple-en">{temple.nameEn}</div> : null}
              <div className="devotee-temple-place">{placeOf(temple)}</div>
            </div>
            <Button variant="primary" onClick={() => onSelect(temple.id)}>
              ดูบริการของวัด
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
