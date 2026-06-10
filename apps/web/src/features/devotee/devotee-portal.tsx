import { ReactElement, useMemo, useState } from "react";
import { AccountView } from "./account-view";
import { DevoteeLoginView } from "./login-view";
import { DEVOTEE_PAGE_TITLES, DevoteePage, DevoteeShell } from "./devotee-shell";
import { MyCeremonies, MyDonations, MyItemLoans, MyReceipts } from "./my-records";
import { TemplePage } from "./temple-page";
import { TemplePicker } from "./temple-picker";
import {
  DevoteeSession,
  clearDevoteeSession,
  createDevoteeApiClient,
  loadDevoteeSession,
  saveDevoteeSession,
} from "./devotee-auth";

export interface DevoteePortalProps {
  baseUrl: string;
  today: string;
}

type View =
  | { name: "picker" }
  | { name: "temple"; templeId: string }
  | { name: "donations" }
  | { name: "receipts" }
  | { name: "ceremonies" }
  | { name: "loans" }
  | { name: "account" };

/** The active sidebar page for a view (the temple page lives under "เลือกวัด"). */
function viewToPage(view: View): DevoteePage {
  return view.name === "temple" ? "picker" : view.name;
}

export function DevoteePortal({ baseUrl, today }: DevoteePortalProps): ReactElement {
  const api = useMemo(() => createDevoteeApiClient({ baseUrl }), [baseUrl]);
  const [session, setSession] = useState<DevoteeSession | null>(() => loadDevoteeSession());
  const [view, setView] = useState<View>({ name: "picker" });
  const [templeName, setTempleName] = useState("");

  function onAuthenticated(next: DevoteeSession): void {
    saveDevoteeSession(next);
    setSession(next);
    setView({ name: "picker" });
  }

  function logout(): void {
    clearDevoteeSession();
    setSession(null);
    setTempleName("");
    setView({ name: "picker" });
  }

  if (!session) {
    return <DevoteeLoginView api={api} onAuthenticated={onAuthenticated} recoveryOptions={{ baseUrl }} />;
  }

  const token = session.accessToken;
  const page = viewToPage(view);
  const crumb = view.name === "temple" ? templeName || "ข้อมูลวัด" : DEVOTEE_PAGE_TITLES[page];

  function navigate(id: DevoteePage): void {
    // Every DevoteePage maps 1:1 to a no-payload View variant (the temple view is only
    // ever entered via TemplePicker.onSelect, never the sidebar).
    setView({ name: id } as View);
  }

  return (
    <DevoteeShell userName={session.devotee.displayName} page={page} crumb={crumb} onNavigate={navigate} onLogout={logout}>
      {view.name === "picker" ? (
        <TemplePicker
          api={api}
          token={token}
          onSelect={(templeId) => {
            setTempleName("");
            setView({ name: "temple", templeId });
          }}
          onUnauthorized={logout}
        />
      ) : null}
      {view.name === "temple" ? (
        <TemplePage
          api={api}
          token={token}
          templeId={view.templeId}
          today={today}
          onBack={() => setView({ name: "picker" })}
          onUnauthorized={logout}
          onTitle={setTempleName}
        />
      ) : null}
      {view.name === "donations" ? <MyDonations api={api} token={token} onUnauthorized={logout} /> : null}
      {view.name === "receipts" ? <MyReceipts api={api} token={token} onUnauthorized={logout} /> : null}
      {view.name === "ceremonies" ? <MyCeremonies api={api} token={token} onUnauthorized={logout} /> : null}
      {view.name === "loans" ? <MyItemLoans api={api} token={token} onUnauthorized={logout} /> : null}
      {view.name === "account" ? <AccountView api={api} token={token} onUnauthorized={logout} /> : null}
    </DevoteeShell>
  );
}
