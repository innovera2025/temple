import { FormEvent, ReactElement, useEffect, useMemo, useState } from "react";
import { SmokeShell } from "./smoke/SmokeShell";

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

// Temple-console information architecture taken from the design inventory
// (docs/reviews/claude-design-function-inventory.md §B). These are the real menu
// labels; the design-backed screens are ported in later slices, so here they are
// shown as an honest "being built" preview — not a finished implementation.
const consoleSections: Array<{ key: string; label: string; roles: TenantRole[] }> = [
  { key: "dashboard", label: "แดชบอร์ดภาพรวม", roles: ["admin", "finance", "staff"] },
  { key: "donations", label: "บันทึก/แก้ไขการบริจาค", roles: ["admin", "finance", "staff"] },
  { key: "donors", label: "ทะเบียนผู้บริจาค", roles: ["admin", "finance", "staff"] },
  { key: "receipts", label: "ออกใบอนุโมทนาบัตร", roles: ["admin", "finance"] },
  { key: "ledger", label: "บัญชีรายรับ-รายจ่าย", roles: ["admin", "finance"] },
  { key: "reconcile", label: "กระทบยอด/ปิดงวด", roles: ["admin", "finance"] },
  { key: "ceremonies", label: "จัดการกิจกรรม/พิธี", roles: ["admin", "finance", "staff"] },
  { key: "personnel", label: "ทะเบียนพระ-เจ้าหน้าที่", roles: ["admin", "finance", "staff"] },
  { key: "reports", label: "รายงานและส่งออกข้อมูล", roles: ["admin", "finance"] },
  { key: "users", label: "จัดการสิทธิ์ผู้ใช้", roles: ["admin"] },
  { key: "audit", label: "บันทึกการใช้งาน (Audit)", roles: ["admin"] },
];

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

function ConsoleHome(props: { session: Session; onLogout: () => void }): ReactElement {
  const { session } = props;
  const sections = useMemo(
    () => consoleSections.filter((section) => section.roles.includes(session.user.role)),
    [session.user.role],
  );

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--brand)]">ระบบจัดการวัด</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">ยินดีต้อนรับ {session.user.displayName}</h1>
            <p className="mt-1 text-sm text-stone-500">บทบาท: {session.user.role} · วัด: {session.user.tenantId}</p>
          </div>
          <button className="self-start rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold" type="button" onClick={props.onLogout}>
            ออกจากระบบ
          </button>
        </header>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          หน้าจอแต่ละส่วนกำลัง port จาก Design จริง (artifacts/claude-design) ทีละ slice — รายการด้านล่างคือผังเมนูตาม Design ที่จะทยอยเปิดใช้งาน
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <div key={section.key} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-stone-900">{section.label}</h2>
              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-400">กำลังพัฒนาตาม Design</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function TempleApp(): ReactElement {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  function logout(): void {
    if (typeof window !== "undefined") window.localStorage.removeItem("wat-session");
    setSession(null);
  }

  if (!session) {
    return <LoginScreen onAuthenticated={setSession} />;
  }
  return <ConsoleHome session={session} onLogout={logout} />;
}

export function App(): ReactElement {
  const route = useRoute();
  if (route === "smoke") {
    return <SmokeShell />;
  }
  return <TempleApp />;
}
