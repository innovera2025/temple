// Dev/ops-only backend smoke-test shell. NOT the temple product UI.
// Reachable only via #/smoke AND only for an authenticated platform owner
// (app.tsx gates the route on loadPlatformSession). It carries NO seed
// credentials — the operator types real credentials to log in to a tenant and
// poke the tenant API directly.
import { FormEvent, ReactElement, useMemo, useState } from "react";
import { clearSession, deriveSession, loadSession, saveSession } from "../features/auth/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

interface SmokeResult {
  label: string;
  status: "idle" | "ok" | "fail";
  detail: string;
}

const modules = [
  { title: "Dashboard", th: "แดชบอร์ดการเงิน", endpoint: "/dashboard", note: "ยอดรับ/จ่าย/คงเหลือ, คิวออกใบ, คิวกระทบยอด" },
  { title: "Temple profile", th: "ข้อมูลวัด", endpoint: "/temple", note: "ข้อมูลหลักวัด หัว/ท้ายใบอนุโมทนา" },
  { title: "Donors", th: "ญาติโยม / ผู้บริจาค", endpoint: "/donors", note: "ค้นหา เพิ่ม แก้ไข พร้อม audit" },
  { title: "Donations", th: "รับบริจาค", endpoint: "/donations", note: "บันทึกบริจาค auto-post เข้า ledger" },
  { title: "Receipts", th: "ใบอนุโมทนา", endpoint: "/receipts", note: "ออก/void/reissue/preview เลขเอกสารไม่ซ้ำ" },
  { title: "Ledger", th: "บัญชีรายรับรายจ่าย", endpoint: "/ledger/entries", note: "manual entry, void, reconcile, close period" },
  { title: "Reports", th: "รายงาน / CSV", endpoint: "/reports/donations", note: "export พร้อม audit และ CSV hardening" },
  { title: "Personnel", th: "พระ / สามเณร / บุคลากร", endpoint: "/personnel", note: "ทะเบียนบุคลากรวัด archive แทน delete" },
  { title: "Ceremonies", th: "งานบุญ / งานพิธี", endpoint: "/ceremonies", note: "basic records และสถานะงาน" },
  { title: "Inventory", th: "คลังของบริจาค / พัสดุ", endpoint: "/inventory/items", note: "รับเข้า เบิกออก ประวัติ movement" },
  { title: "Users", th: "ผู้ใช้และสิทธิ์", endpoint: "/users", note: "admin-only, last-admin protection" },
  { title: "Attachments", th: "แนบหลักฐาน", endpoint: "/attachments?ownerType=donor&ownerId=00000000-0000-4000-8000-000000000000", note: "upload/download/delete, quota, rate limit" },
];

function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function SmokeShell(): ReactElement {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [session, setSession] = useState(() => loadSession());
  const [message, setMessage] = useState<string>("");
  const [activeEndpoint, setActiveEndpoint] = useState<string>("/dashboard");
  const [apiPreview, setApiPreview] = useState<string>("ยังไม่ได้เรียก API");
  const [smokeResults, setSmokeResults] = useState<SmokeResult[]>(
    modules.slice(0, 8).map((module) => ({ label: module.th, status: "idle", detail: module.endpoint })),
  );

  const currentRole = session?.user.role ?? "admin";
  const visibleModules = useMemo(() => {
    if (currentRole === "staff") {
      return modules.filter((module) => !["Reports", "Users"].includes(module.title));
    }
    if (currentRole === "finance") {
      return modules.filter((module) => module.title !== "Users");
    }
    return modules;
  }, [currentRole]);

  async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage("กำลังเข้าสู่ระบบ...");
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await parseJson(response)) as { accessToken?: string; refreshToken?: string; error?: { message?: string } };
      if (!response.ok || !body.accessToken) {
        throw new Error(body.error?.message ?? `login failed (${response.status})`);
      }
      // Role/tenant/email come from the server-verified token claims (no seed table).
      const nextSession = deriveSession(email, { accessToken: body.accessToken, refreshToken: body.refreshToken });
      saveSession(nextSession);
      setSession(nextSession);
      setMessage(`เข้าสู่ระบบแล้ว: ${nextSession.user.email} (${nextSession.user.role})`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "login failed");
    }
  }

  function logout(): void {
    clearSession();
    setSession(null);
    setMessage("ออกจากระบบแล้ว");
  }

  async function callEndpoint(endpoint = activeEndpoint): Promise<void> {
    if (!session) {
      setApiPreview("กรุณา login ก่อนเรียก API");
      return;
    }
    setApiPreview("กำลังเรียก API...");
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      const body = await parseJson(response);
      setApiPreview(JSON.stringify({ status: response.status, ok: response.ok, body }, null, 2));
    } catch (error) {
      setApiPreview(error instanceof Error ? error.message : "API error");
    }
  }

  async function runSmoke(): Promise<void> {
    if (!session) {
      setMessage("กรุณา login ก่อน smoke test");
      return;
    }
    const targets = modules.slice(0, 8);
    const next: SmokeResult[] = [];
    for (const module of targets) {
      try {
        const response = await fetch(`${API_BASE_URL}${module.endpoint}`, {
          headers: { authorization: `Bearer ${session.accessToken}` },
        });
        const body = await parseJson(response);
        next.push({
          label: module.th,
          status: response.ok ? "ok" : "fail",
          detail: response.ok ? `${response.status} OK` : `${response.status} ${JSON.stringify(body).slice(0, 120)}`,
        });
      } catch (error) {
        next.push({ label: module.th, status: "fail", detail: error instanceof Error ? error.message : "error" });
      }
      setSmokeResults([...next, ...targets.slice(next.length).map((module) => ({ label: module.th, status: "idle" as const, detail: module.endpoint }))]);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--brand)]">Temple Management System · Dev smoke test</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">Backend smoke test — ระบบจัดการวัด</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                เครื่องมือสำหรับเจ้าของแพลตฟอร์มยิง API ของ backend โดยตรง (ไม่ใช่ UI จริงตาม Design) — ทดสอบ: ข้อมูลวัด ญาติโยม รับบริจาค ใบอนุโมทนา บัญชี รายงาน บุคลากร งานบุญ คลัง และสิทธิ์ผู้ใช้
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 lg:max-w-md">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">API</p>
              <p className="mt-2 font-mono text-sm text-stone-800">{API_BASE_URL}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <form onSubmit={login} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">เข้าสู่ระบบทดสอบ (ฝั่งวัด)</h2>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              กรอกบัญชีฝั่งวัด (เจ้าของวัด = admin, คนใช้งานวัด = finance/staff) เพื่อรับ token ผ่าน
              <code> /auth/login</code> แล้วยิง API ของวัดนั้น. เจ้าของแพลตฟอร์มเข้าผ่าน
              <code> /platform/auth</code> คนละ plane — smoke นี้ไม่ครอบคลุม
            </p>
            <label className="mt-4 block text-sm font-medium text-stone-700" htmlFor="smoke-email">อีเมล</label>
            <input
              id="smoke-email"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="off"
              placeholder="name@wat.example"
            />
            <label className="mt-4 block text-sm font-medium text-stone-700" htmlFor="smoke-password">รหัสผ่าน</label>
            <input
              id="smoke-password"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="off"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white" type="submit">Login</button>
              <button className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold" type="button" onClick={logout}>Logout</button>
            </div>
            {message ? <p className="mt-3 text-sm text-stone-700">{message}</p> : null}
          </form>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="metric-card"><span>สถานะ</span><strong>{session ? "Online" : "Login"}</strong><small>{session ? session.user.email : "ยังไม่ login"}</small></div>
            <div className="metric-card"><span>Role</span><strong>{currentRole}</strong><small>permission smoke</small></div>
            <div className="metric-card"><span>Modules</span><strong>{visibleModules.length}</strong><small>พร้อมตรวจหน้าเว็บ/API</small></div>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">เมนูระบบวัด</h2>
              <p className="text-sm text-stone-500">เลือก endpoint เพื่อยิง API และดูผลตอบกลับจริงจาก backend</p>
            </div>
            <button className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={runSmoke}>Run quick smoke</button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((module) => (
              <button
                key={module.endpoint}
                className={classNames("rounded-2xl border p-4 text-left transition", activeEndpoint === module.endpoint ? "border-[var(--brand)] bg-orange-50" : "border-stone-200 bg-stone-50 hover:bg-white")}
                type="button"
                onClick={() => { setActiveEndpoint(module.endpoint); void callEndpoint(module.endpoint); }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{module.title}</p>
                <h3 className="mt-1 font-semibold text-stone-950">{module.th}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{module.note}</p>
                <p className="mt-3 font-mono text-xs text-stone-500">GET {module.endpoint}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Smoke results</h2>
            <div className="mt-4 space-y-2">
              {smokeResults.map((result) => (
                <div key={result.label} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                  <span className="text-sm font-medium">{result.label}</span>
                  <span className={classNames("rounded-full px-2 py-1 text-xs font-semibold", result.status === "ok" && "bg-emerald-100 text-emerald-800", result.status === "fail" && "bg-rose-100 text-rose-800", result.status === "idle" && "bg-stone-200 text-stone-600")}>{result.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-950 p-5 text-stone-100 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">API response preview</h2>
              <button className="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold" type="button" onClick={() => void callEndpoint()}>Refresh</button>
            </div>
            <p className="mt-2 font-mono text-xs text-stone-400">GET {activeEndpoint}</p>
            <pre className="mt-4 max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-xs leading-5">{apiPreview}</pre>
          </div>
        </section>
      </div>
    </main>
  );
}
