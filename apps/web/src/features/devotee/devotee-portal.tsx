import { ReactElement, useMemo, useState } from "react";
import { Icon } from "../../layout/icons";
import { DevoteeLoginView } from "./login-view";
import { MyRecords } from "./my-records";
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

type View = { name: "picker" } | { name: "temple"; templeId: string } | { name: "records" };

export function DevoteePortal({ baseUrl, today }: DevoteePortalProps): ReactElement {
  const api = useMemo(() => createDevoteeApiClient({ baseUrl }), [baseUrl]);
  const [session, setSession] = useState<DevoteeSession | null>(() => loadDevoteeSession());
  const [view, setView] = useState<View>({ name: "picker" });

  function onAuthenticated(next: DevoteeSession): void {
    saveDevoteeSession(next);
    setSession(next);
    setView({ name: "picker" });
  }

  function logout(): void {
    clearDevoteeSession();
    setSession(null);
    setView({ name: "picker" });
  }

  if (!session) {
    return <DevoteeLoginView api={api} onAuthenticated={onAuthenticated} />;
  }

  const token = session.accessToken;

  return (
    <div className="devotee-shell">
      <header className="devotee-topbar">
        <button type="button" className="devotee-brand" onClick={() => setView({ name: "picker" })}>
          <span className="a-seal sm">
            <Icon name="lotus" size={18} />
          </span>
          <span>ร่วมบุญออนไลน์</span>
        </button>
        <nav className="devotee-nav" aria-label="เมนูญาติโยม">
          <button
            type="button"
            className={view.name === "picker" || view.name === "temple" ? "active" : ""}
            onClick={() => setView({ name: "picker" })}
          >
            เลือกวัด
          </button>
          <button
            type="button"
            className={view.name === "records" ? "active" : ""}
            onClick={() => setView({ name: "records" })}
          >
            ประวัติของฉัน
          </button>
        </nav>
        <div className="devotee-account">
          <span className="devotee-account-name">{session.devotee.displayName}</span>
          <button type="button" className="link-btn" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="devotee-main">
        {view.name === "picker" ? (
          <TemplePicker
            api={api}
            token={token}
            onSelect={(templeId) => setView({ name: "temple", templeId })}
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
          />
        ) : null}
        {view.name === "records" ? <MyRecords api={api} token={token} onUnauthorized={logout} /> : null}
      </main>
    </div>
  );
}
