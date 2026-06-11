import { ReactElement, useEffect, useState } from "react";
import { SmokeShell } from "./smoke/SmokeShell";
import { RoleShell } from "./layout/RoleShell";
import { defaultPageFor, PageId, TempleRole } from "./layout/nav";
import { PageContent } from "./features/page-content";
import { LoginScreen } from "./features/auth/login-view";
import { DevoteePortal } from "./features/devotee/devotee-portal";
import { PlatformPortal } from "./features/platform/platform-portal";
import { loadPlatformSession } from "./features/platform/platform-auth";
import { PublicDirectory } from "./features/public/public-directory";
import {
  clearSession,
  createAuthApiClient,
  loadSession,
  saveSession,
  Session,
} from "./features/auth/auth";
import { createTempleApiClient } from "./features/temple/temple";
import { ResetPasswordPage, VerifyEmailPage } from "./features/auth/recovery-view";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

// --- minimal hand-rolled hash router (no external dependency, matches the
// project's dependency-light ethos). The design-backed router/shell lands in a
// later slice; for now the default route is the temple product and #/smoke is a
// dev-only escape hatch to the backend smoke shell. The Agent Control Tower is a
// separate dev artifact and is never rendered here.
type Route = "app" | "smoke" | "devotee" | "public" | "platform" | "reset-password" | "verify-email";

function readRoute(): Route {
  if (typeof window === "undefined") return "app";
  // The devotee (ญาติโยม) portal and the public directory are separate top-level
  // planes — never the staff RoleShell/back-office. #/public needs no auth at all.
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash === "smoke") return "smoke";
  if (hash === "devotee" || hash.startsWith("devotee/")) return "devotee";
  if (hash === "public" || hash.startsWith("public/")) return "public";
  if (hash === "platform" || hash.startsWith("platform/")) return "platform";
  // Landing pages for emailed links (work pre-auth on any plane).
  if (hash.startsWith("reset-password")) return "reset-password";
  if (hash.startsWith("verify-email")) return "verify-email";
  return "app";
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => readRoute());
  useEffect(() => {
    const onHashChange = (): void => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

function todayIso(): string {
  if (typeof window === "undefined") return "2026-01-01";
  // ICT (UTC+7) civil date — toISOString() alone is the UTC date, which is
  // yesterday for the first 7 hours of every Thai day.
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function TempleApp(): ReactElement {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [page, setPage] = useState<PageId>(() => {
    const role = (loadSession()?.user.role ?? "admin") as TempleRole;
    return defaultPageFor(role);
  });
  const [templeName, setTempleName] = useState<string | undefined>(undefined);

  // The sidebar shows the signed-in tenant's real temple name (never a demo
  // placeholder); fetched once per session, non-fatal if it fails.
  useEffect(() => {
    if (!session) { setTempleName(undefined); return; }
    let active = true;
    createTempleApiClient({ baseUrl: API_BASE_URL, getToken: () => session.accessToken })
      .get()
      .then((profile) => { if (active) setTempleName(profile.nameTh); }, () => undefined);
    return () => { active = false; };
  }, [session]);

  function onAuthenticated(next: Session): void {
    saveSession(next);
    setSession(next);
    setPage(defaultPageFor(next.user.role as TempleRole));
  }

  function logout(): void {
    clearSession();
    setSession(null);
  }

  if (!session) {
    return (
      <LoginScreen
        api={createAuthApiClient({ baseUrl: API_BASE_URL })}
        onAuthenticated={onAuthenticated}
        recoveryOptions={{ baseUrl: API_BASE_URL }}
      />
    );
  }
  return (
    <RoleShell
      userName={session.user.displayName}
      role={session.user.role as TempleRole}
      page={page}
      onNavigate={setPage}
      onLogout={logout}
      templeName={templeName}
    >
      <PageContent
        page={page}
        baseUrl={API_BASE_URL}
        getToken={() => session.accessToken}
        role={session.user.role as TempleRole}
        today={todayIso()}
        onNavigate={setPage}
      />
    </RoleShell>
  );
}

export function App(): ReactElement {
  const route = useRoute();
  if (route === "smoke") {
    // Backend smoke tool is for the platform owner only. Without a platform
    // session, send them to the platform console to sign in first (the API is
    // the real boundary; this just keeps the dev tool off the public surface).
    return loadPlatformSession() ? <SmokeShell /> : <PlatformPortal baseUrl={API_BASE_URL} />;
  }
  if (route === "devotee") {
    return <DevoteePortal baseUrl={API_BASE_URL} today={todayIso()} />;
  }
  if (route === "public") {
    return <PublicDirectory baseUrl={API_BASE_URL} />;
  }
  if (route === "platform") {
    return <PlatformPortal baseUrl={API_BASE_URL} />;
  }
  if (route === "reset-password") {
    return <ResetPasswordPage options={{ baseUrl: API_BASE_URL }} />;
  }
  if (route === "verify-email") {
    return <VerifyEmailPage options={{ baseUrl: API_BASE_URL }} />;
  }
  return <TempleApp />;
}
