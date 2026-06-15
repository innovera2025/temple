import { ReactElement, useMemo, useState } from "react";
import { PLATFORM_ROLE_LABELS_TH } from "@wat/shared";
import { ApplicationsView } from "./applications-view";
import { BreakGlassView } from "./break-glass-view";
import { PlatformAuditView } from "./platform-audit-view";
import { PlatformDashboard } from "./platform-dashboard";
import { PlatformLoginView } from "./platform-login-view";
import { PlatformPage, PlatformShell } from "./platform-shell";
import { PlatformUsersView } from "./platform-users-view";
import { TemplesView } from "./temples-view";
import { TenantUsersView } from "./tenant-users-view";
import {
  PlatformSession,
  clearPlatformSession,
  createPlatformApiClient,
  loadPlatformSession,
  savePlatformSession,
} from "./platform-auth";

export interface PlatformPortalProps {
  baseUrl: string;
}

/** The Innovera platform-owner console — a top-level plane (#platform), separate from the
 *  tenant back-office and the devotee portal. Session gate → login or the grouped console. */
export function PlatformPortal({ baseUrl }: PlatformPortalProps): ReactElement {
  const api = useMemo(() => createPlatformApiClient({ baseUrl }), [baseUrl]);
  const [session, setSession] = useState<PlatformSession | null>(() => loadPlatformSession());
  const [page, setPage] = useState<PlatformPage>("dashboard");

  function onAuthenticated(next: PlatformSession): void {
    savePlatformSession(next);
    setSession(next);
    setPage("dashboard");
  }

  function logout(): void {
    if (session?.refreshToken) void api.logout(session.accessToken, session.refreshToken);
    clearPlatformSession();
    setSession(null);
    setPage("dashboard");
  }

  if (!session) {
    return <PlatformLoginView api={api} onAuthenticated={onAuthenticated} />;
  }

  const token = session.accessToken;
  const canWrite = session.platform.platformRole === "super_admin";
  const roleLabel = PLATFORM_ROLE_LABELS_TH[session.platform.platformRole];
  const viewProps = { api, token, canWrite, onUnauthorized: logout };

  return (
    <PlatformShell userName={session.platform.email} roleLabel={roleLabel} page={page} onNavigate={setPage} onLogout={logout}>
      {page === "dashboard" ? <PlatformDashboard {...viewProps} onGoto={setPage} /> : null}
      {page === "applications" ? <ApplicationsView {...viewProps} /> : null}
      {page === "temples" ? <TemplesView {...viewProps} /> : null}
      {page === "tenant-users" ? <TenantUsersView {...viewProps} /> : null}
      {page === "platform-users" ? <PlatformUsersView {...viewProps} /> : null}
      {page === "audit" ? <PlatformAuditView {...viewProps} /> : null}
      {page === "break-glass" ? <BreakGlassView {...viewProps} /> : null}
    </PlatformShell>
  );
}
