import { ReactElement, useMemo, useState } from "react";
import type { PublicTempleSummary } from "@wat/shared";
import { Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import { AccountView } from "./account-view";
import { DevoteeHome } from "./devotee-home";
import { DevoteeLoginView } from "./login-view";
import { DEVOTEE_PAGE_TITLES, DevoteePage, DevoteeShell } from "./devotee-shell";
import { MyCeremonies, MyDonations, MyItemLoans, MyReceipts } from "./my-records";
import { BookCeremonyForm, BorrowItemForm, DonateForm, TempleEventsList, TemplePage } from "./temple-page";
import { TemplePicker } from "./temple-picker";
import {
  ActiveTemple,
  DevoteeSession,
  clearActiveTemple,
  clearDevoteeSession,
  createDevoteeApiClient,
  loadActiveTemple,
  loadDevoteeSession,
  saveActiveTemple,
  saveDevoteeSession,
} from "./devotee-auth";

export interface DevoteePortalProps {
  baseUrl: string;
  today: string;
}

/** Shows which temple the action forms will transact with, plus a "เปลี่ยนวัด" escape. */
function ActiveTempleBanner({ name, onChange }: { name: string; onChange: () => void }): ReactElement {
  return (
    <div className="card devotee-active-temple">
      <Icon name="building" size={18} />
      <span className="devotee-active-temple-text">
        กำลังทำบุญกับ: <b>{name}</b>
      </span>
      <button type="button" className="link-btn" onClick={onChange}>
        เปลี่ยนวัด
      </button>
    </div>
  );
}

/** Empty state on an action page when no temple has been chosen yet. */
function NoTempleSelected({ action, onGoPick }: { action: string; onGoPick: () => void }): ReactElement {
  return (
    <div className="empty-state card">
      <Icon name="building" size={28} />
      <p>ยังไม่ได้เลือกวัด — เลือกวัดก่อนเพื่อ{action}</p>
      <Button variant="primary" onClick={onGoPick}>
        ไปเลือกวัด
      </Button>
    </div>
  );
}

export function DevoteePortal({ baseUrl, today }: DevoteePortalProps): ReactElement {
  const api = useMemo(() => createDevoteeApiClient({ baseUrl }), [baseUrl]);
  const [session, setSession] = useState<DevoteeSession | null>(() => loadDevoteeSession());
  const [page, setPage] = useState<DevoteePage>("home");
  // The temple a devotee is currently transacting with — chosen on "เลือกวัด",
  // persisted so it survives reload, and shared by every action page.
  const [activeTemple, setActiveTemple] = useState<ActiveTemple | null>(() => loadActiveTemple());

  function onAuthenticated(next: DevoteeSession): void {
    saveDevoteeSession(next);
    setSession(next);
    // A fresh login starts with no active temple — never inherit the previous
    // devotee's selection on a shared device (a reload keeps it; a login resets it).
    clearActiveTemple();
    setActiveTemple(null);
    setPage("home");
  }

  function logout(): void {
    clearDevoteeSession();
    clearActiveTemple();
    setSession(null);
    setActiveTemple(null);
    setPage("home");
  }

  if (!session) {
    return <DevoteeLoginView api={api} onAuthenticated={onAuthenticated} recoveryOptions={{ baseUrl }} />;
  }

  const token = session.accessToken;
  const crumb = DEVOTEE_PAGE_TITLES[page];

  function selectTemple(temple: PublicTempleSummary): void {
    const next: ActiveTemple = { id: temple.id, nameTh: temple.nameTh };
    setActiveTemple(next);
    saveActiveTemple(next);
  }

  function changeTemple(): void {
    clearActiveTemple();
    setActiveTemple(null);
    setPage("picker");
  }

  return (
    <DevoteeShell
      userName={session.devotee.displayName}
      page={page}
      crumb={crumb}
      onNavigate={setPage}
      onLogout={logout}
    >
      {page === "home" ? (
        <DevoteeHome
          api={api}
          token={token}
          displayName={session.devotee.displayName}
          activeTempleName={activeTemple?.nameTh ?? null}
          onGoto={setPage}
          onUnauthorized={logout}
        />
      ) : null}

      {page === "picker" ? (
        activeTemple ? (
          <TemplePage
            api={api}
            token={token}
            templeId={activeTemple.id}
            onUnauthorized={logout}
            onChangeTemple={changeTemple}
            onGoto={setPage}
          />
        ) : (
          <TemplePicker api={api} token={token} onSelect={selectTemple} onUnauthorized={logout} />
        )
      ) : null}

      {page === "donations" ? (
        <div className="content-wrap">
          <div className="devotee-action">
            {activeTemple ? (
              <>
                <ActiveTempleBanner name={activeTemple.nameTh} onChange={changeTemple} />
                <DonateForm api={api} token={token} templeId={activeTemple.id} today={today} onUnauthorized={logout} />
              </>
            ) : (
              <NoTempleSelected action="ร่วมบริจาค" onGoPick={() => setPage("picker")} />
            )}
            <MyDonations api={api} token={token} onUnauthorized={logout} />
          </div>
        </div>
      ) : null}

      {page === "ceremonies" ? (
        <div className="content-wrap">
          <div className="devotee-action">
            {activeTemple ? (
              <>
                <ActiveTempleBanner name={activeTemple.nameTh} onChange={changeTemple} />
                <BookCeremonyForm api={api} token={token} templeId={activeTemple.id} today={today} onUnauthorized={logout} />
                <TempleEventsList api={api} token={token} templeId={activeTemple.id} onUnauthorized={logout} />
              </>
            ) : (
              <NoTempleSelected action="จองพิธี / นิมนต์พระ" onGoPick={() => setPage("picker")} />
            )}
            <MyCeremonies api={api} token={token} onUnauthorized={logout} />
          </div>
        </div>
      ) : null}

      {page === "loans" ? (
        <div className="content-wrap">
          <div className="devotee-action">
            {activeTemple ? (
              <>
                <ActiveTempleBanner name={activeTemple.nameTh} onChange={changeTemple} />
                <BorrowItemForm api={api} token={token} templeId={activeTemple.id} today={today} onUnauthorized={logout} />
              </>
            ) : (
              <NoTempleSelected action="ยืมของวัด" onGoPick={() => setPage("picker")} />
            )}
            <MyItemLoans api={api} token={token} onUnauthorized={logout} />
          </div>
        </div>
      ) : null}

      {page === "receipts" ? <MyReceipts api={api} token={token} onUnauthorized={logout} /> : null}
      {page === "account" ? <AccountView api={api} token={token} onUnauthorized={logout} /> : null}
    </DevoteeShell>
  );
}
