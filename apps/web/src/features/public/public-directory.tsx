import { ReactElement, useEffect, useMemo, useState } from "react";
import { CEREMONY_TYPE_LABELS_TH, type CeremonyType } from "@wat/shared";
import { Badge, Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import {
  PublicApi,
  PublicEventSummary,
  PublicTempleSummary,
  createPublicApiClient,
  publicErrorMessage,
} from "./public-api";

export interface PublicDirectoryProps {
  baseUrl: string;
  /** Injected in tests; production builds the real fetch-backed client from baseUrl. */
  api?: PublicApi;
}

function placeOf(temple: PublicTempleSummary): string {
  return [temple.district, temple.province].filter(Boolean).join(" · ") || "ไม่ระบุที่อยู่";
}

function ceremonyTypeLabel(type: string): string {
  return CEREMONY_TYPE_LABELS_TH[type as CeremonyType] ?? type;
}

/** Send the visitor into the devotee portal (login / register / donate / book). */
function goDevotee(): void {
  if (typeof window !== "undefined") window.location.hash = "#/devotee";
}

export function PublicDirectory({ baseUrl, api: apiProp }: PublicDirectoryProps): ReactElement {
  const api: PublicApi = useMemo(() => apiProp ?? createPublicApiClient({ baseUrl }), [apiProp, baseUrl]);
  const [temples, setTemples] = useState<PublicTempleSummary[] | null>(null);
  const [events, setEvents] = useState<PublicEventSummary[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.listTemples().then((t) => !cancelled && setTemples(t)).catch((e) => !cancelled && setError(publicErrorMessage(e)));
    api.listEvents().then((ev) => !cancelled && setEvents(ev)).catch((e) => !cancelled && setError(publicErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const term = query.trim().toLowerCase();
  const visibleTemples = (temples ?? []).filter(
    (t) =>
      !term ||
      t.nameTh.toLowerCase().includes(term) ||
      (t.nameEn ?? "").toLowerCase().includes(term) ||
      (t.province ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="devotee-shell">
      <header className="devotee-topbar">
        <span className="devotee-brand">
          <span className="a-seal sm">
            <Icon name="lotus" size={18} />
          </span>
          <span>ระบบจัดการวัด</span>
        </span>
        <nav className="devotee-nav" aria-label="สาธารณะ">
          <button type="button" className="active" onClick={() => undefined}>วัดและกิจกรรม</button>
        </nav>
        <div className="devotee-account">
          <Button variant="primary" onClick={goDevotee}>เข้าสู่ระบบ / ร่วมบุญ</Button>
        </div>
      </header>

      <main className="devotee-main">
        <div className="content-wrap">
          <div className="page-head">
            <div>
              <h1>วัดและกิจกรรมงานบุญ</h1>
              <p className="page-sub">ค้นหาวัดในระบบและกิจกรรมงานบุญที่กำลังจะมาถึง — เข้าสู่ระบบเพื่อร่วมบุญหรือจองพิธี</p>
            </div>
          </div>

          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <section className="devotee-records-section">
            <h2>กิจกรรมที่กำลังจะมาถึง</h2>
            {events === null && !error ? <p className="muted">กำลังโหลด…</p> : null}
            {events !== null && events.length === 0 ? (
              <div className="empty-state card"><p>ยังไม่มีกิจกรรมสาธารณะที่ประกาศไว้</p></div>
            ) : null}
            {events !== null && events.length > 0 ? (
              <div className="public-events">
                {events.map((ev) => (
                  <div key={ev.id} className="card public-event-card">
                    <div className="public-event-date">{ev.ceremonyDate}{ev.timeNote ? <span className="muted"> · {ev.timeNote}</span> : null}</div>
                    <div className="public-event-title">{ev.title}</div>
                    <div className="public-event-meta">
                      <Badge kind="accent">{ceremonyTypeLabel(ev.ceremonyType)}</Badge>
                      <span className="muted">{ev.templeNameTh}{ev.location ? ` · ${ev.location}` : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="devotee-records-section">
            <h2>วัดในระบบ</h2>
            <div className="field" style={{ maxWidth: 420 }}>
              <input
                className="control"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาวัด / จังหวัด"
                aria-label="ค้นหาวัด"
              />
            </div>
            {temples === null && !error ? <p className="muted">กำลังโหลดรายชื่อวัด…</p> : null}
            {temples !== null && visibleTemples.length === 0 ? (
              <div className="empty-state card">
                <Icon name="lotus" size={28} />
                <p>{term ? "ไม่พบวัดที่ตรงกับคำค้นหา" : "ยังไม่มีวัดในระบบ"}</p>
              </div>
            ) : null}
            <div className="devotee-temple-grid">
              {visibleTemples.map((t) => (
                <div key={t.id} className="card devotee-temple-card">
                  <div className="devotee-temple-logo" aria-hidden="true">
                    {t.logoUrl ? <img src={t.logoUrl} alt="" /> : <Icon name="lotus" size={24} />}
                  </div>
                  <div className="devotee-temple-body">
                    <div className="devotee-temple-name">{t.nameTh}</div>
                    {t.nameEn ? <div className="devotee-temple-en">{t.nameEn}</div> : null}
                    <div className="devotee-temple-place">{placeOf(t)}</div>
                  </div>
                  <Button variant="secondary" onClick={goDevotee}>เข้าสู่ระบบเพื่อร่วมบุญ</Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
