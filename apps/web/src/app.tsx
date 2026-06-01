import { FormEvent, ReactElement, useEffect, useState } from "react";
import { SmokeShell } from "./smoke/SmokeShell";
import { RoleShell } from "./layout/RoleShell";
import { defaultPageFor, PageId, TempleRole } from "./layout/nav";
import { PageContent } from "./features/page-content";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

// --- minimal hand-rolled hash router (no external dependency, matches the
// project's dependency-light ethos). The design-backed router/shell lands in a
// later slice; for now the default route is the temple product and #/smoke is a
// dev-only escape hatch to the backend smoke shell. The Agent Control Tower is a
// separate dev artifact and is never rendered here.
type Route = "app" | "smoke";

function readRoute(): Route {
  if (typeof window === "undefined") return "app";
  return window.location.hash.replace(/^#\/?/, "") === "smoke" ? "smoke" : "app";
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

type TenantRole = "admin" | "finance" | "staff";

interface Session {
  accessToken: string;
  refreshToken?: string;
  user: { email: string; displayName: string; role: TenantRole; tenantId: string };
}

const seedAccounts = [
  { email: "admin@wat-arun.example", role: "admin", label: "ผู้ดูแลวัดอรุณ" },
  { email: "finance@wat-arun.example", role: "finance", label: "การเงินวัดอรุณ" },
  { email: "staff@wat-arun.example", role: "staff", label: "เจ้าหน้าที่วัดอรุณ" },
  { email: "admin@wat-pho.example", role: "admin", label: "ผู้ดูแลวัดโพธิ์" },
] as const;

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("wat-session");
  return raw ? (JSON.parse(raw) as Session) : null;
}

function LoginScreen(props: { onAuthenticated: (session: Session) => void }): ReactElement {
  const [email, setEmail] = useState<string>(seedAccounts[0].email);
  const [password, setPassword] = useState("Password123!");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("กำลังเข้าสู่ระบบ...");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await parseJson(response)) as { accessToken?: string; refreshToken?: string; error?: { message?: string } };
      if (!response.ok || !body.accessToken) {
        throw new Error(body.error?.message ?? `เข้าสู่ระบบไม่สำเร็จ (${response.status})`);
      }
      const account = seedAccounts.find((item) => item.email === email);
      const session: Session = {
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        user: {
          email,
          displayName: account?.label ?? email,
          role: (account?.role ?? "admin") as TenantRole,
          tenantId: email.includes("wat-pho") ? "wat-pho" : "wat-arun",
        },
      };
      window.localStorage.setItem("wat-session", JSON.stringify(session));
      props.onAuthenticated(session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--paper)] px-5 py-10 text-stone-950">
      <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-[var(--brand)]">Temple Management System</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">ระบบจัดการวัด</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">เข้าสู่ระบบเพื่อจัดการข้อมูลวัด การบริจาค ใบอนุโมทนา บัญชี และรายงาน</p>

        <form onSubmit={login} className="mt-6">
          <label className="block text-sm font-medium text-stone-700">บัญชีผู้ใช้</label>
          <select className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)}>
            {seedAccounts.map((account) => (
              <option key={account.email} value={account.email}>{account.label} — {account.email}</option>
            ))}
          </select>
          <label className="mt-4 block text-sm font-medium text-stone-700">รหัสผ่าน</label>
          <input className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="mt-6 w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={busy}>
            เข้าสู่ระบบ
          </button>
          {message ? <p className="mt-3 text-sm text-stone-700">{message}</p> : null}
        </form>

        <p className="mt-6 border-t border-stone-100 pt-4 text-xs leading-5 text-stone-400">
          หน้าจอตาม Design กำลังพัฒนาเป็นลำดับ — ดู docs/product/design-ui-map.md
        </p>
      </div>
    </main>
  );
}

function todayIso(): string {
  if (typeof window === "undefined") return "2026-01-01";
  return new Date().toISOString().slice(0, 10);
}

function TempleApp(): ReactElement {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [page, setPage] = useState<PageId>(() => {
    const role = (loadSession()?.user.role ?? "admin") as TempleRole;
    return defaultPageFor(role);
  });

  function onAuthenticated(next: Session): void {
    setSession(next);
    setPage(defaultPageFor(next.user.role as TempleRole));
  }

  function logout(): void {
    if (typeof window !== "undefined") window.localStorage.removeItem("wat-session");
    setSession(null);
  }

  if (!session) {
    return <LoginScreen onAuthenticated={onAuthenticated} />;
  }
  return (
    <RoleShell
      userName={session.user.displayName}
      role={session.user.role as TempleRole}
      page={page}
      onNavigate={setPage}
      onLogout={logout}
    >
      <PageContent
        page={page}
        baseUrl={API_BASE_URL}
        getToken={() => session.accessToken}
        role={session.user.role as TempleRole}
        today={todayIso()}
      />
    </RoleShell>
  );
}

export function App(): ReactElement {
  const route = useRoute();
  if (route === "smoke") {
    return <SmokeShell />;
  }
  return <TempleApp />;
}
