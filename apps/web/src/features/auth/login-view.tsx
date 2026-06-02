import { FormEvent, ReactElement, useState } from "react";
import { Badge, Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import { ROLE_NAMES } from "../../layout/nav";
import { RegisterForm } from "./register-view";
import {
  AuthApi,
  AuthError,
  CONFIG_REQUIRED_LABEL,
  DEMO_PASSWORD,
  deriveSession,
  loginErrorMessage,
  LoginFormErrors,
  SEED_ACCOUNTS,
  SeedAccount,
  Session,
  UNAVAILABLE_LABEL,
  validateLoginForm,
} from "./auth";

type Mode = "login" | "register";

export interface LoginScreenProps {
  api: AuthApi;
  onAuthenticated: (session: Session) => void;
  /** Quick-login seed accounts (dev convenience). Defaults to the real seed table. */
  accounts?: readonly SeedAccount[];
}

// Social/OAuth providers from the design's SocialButtons. No backend -> disabled.
const SOCIAL_PROVIDERS = ["Google", "Facebook"] as const;
const SOCIAL_PROVIDER_IDS = { Google: "google", Facebook: "facebook" } as const;

function BrandPanel(): ReactElement {
  return (
    <div className="auth-art" data-design-source="user-zip-auth.jsx">
      <svg className="auth-temple" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <path
          d="M100 20l8 14 8-8-6 16 18-4-12 12 20 4-18 8 14 12-18-2 6 16-14-10-2 16-10-12-10 12-2-16-14 10 6-16-18 2 14-12-18-8 20-4-12-12 18 4-6-16 8 8z"
          fill="currentColor"
        />
        <path
          d="M30 180h140M50 180V130l50-40 50 40v50M75 180v-30h50v30M100 90V60M85 60h30"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>

      <div className="a-brand">
        <div className="a-seal">
          <Icon name="lotus" size={30} />
        </div>
        <div>
          <div className="a-brand-name">ระบบจัดการวัด</div>
          <div className="a-brand-sub">WAT MANAGEMENT SYSTEM</div>
        </div>
      </div>

      <div className="a-lead">
        <div className="a-line" />
        <h1>วัดธรรมสถิตวนาราม</h1>
        <p className="a-sub">
          ระบบจัดการวัดออนไลน์ สำหรับเจ้าหน้าที่และญาติโยม จองศาลา จองกุฏิ แจ้งบวช ฌาปนกิจ
          และร่วมบุญออนไลน์
        </p>
      </div>

      <div className="a-foot">© ๒๕๖๙ วัดธรรมสถิตวนาราม · เพื่อความสะดวกของพุทธศาสนิกชน</div>
    </div>
  );
}

function socialErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.status === 503) return CONFIG_REQUIRED_LABEL;
    if (error.status === 429) return "เริ่มเข้าสู่ระบบด้วยบัญชีภายนอกบ่อยเกินไป กรุณารอสักครู่";
    return error.message || "เริ่มเข้าสู่ระบบด้วยบัญชีภายนอกไม่สำเร็จ";
  }
  if (error instanceof TypeError) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ";
  return "เริ่มเข้าสู่ระบบด้วยบัญชีภายนอกไม่สำเร็จ";
}

function SocialButtons({ api }: { api: AuthApi }): ReactElement {
  const [busyProvider, setBusyProvider] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function start(providerLabel: keyof typeof SOCIAL_PROVIDER_IDS): Promise<void> {
    const provider = SOCIAL_PROVIDER_IDS[providerLabel];
    setBusyProvider(provider);
    setError("");
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`;
      const result = await api.startSocialSignup(provider, redirectUri);
      window.location.assign(result.authUrl);
    } catch (err) {
      setError(socialErrorMessage(err));
    } finally {
      setBusyProvider("");
    }
  }

  return (
    <div className="auth-social">
      <div className="soc-row">
        {SOCIAL_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            className="soc-btn"
            disabled={busyProvider !== ""}
            title={CONFIG_REQUIRED_LABEL}
            aria-label={`เข้าสู่ระบบด้วย ${provider}`}
            onClick={() => void start(provider)}
          >
            {busyProvider === SOCIAL_PROVIDER_IDS[provider] ? "กำลังเชื่อมต่อ…" : provider}
          </button>
        ))}
      </div>
      <p className="auth-social-note">Google/Facebook จะใช้งานได้เมื่อ backend ตั้งค่า OAuth provider แล้ว</p>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function LoginScreen({
  api,
  onAuthenticated,
  accounts = SEED_ACCOUNTS,
}: LoginScreenProps): ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState<string>(accounts[0]?.email ?? "");
  const [password, setPassword] = useState<string>(DEMO_PASSWORD);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<LoginFormErrors>({});

  async function submitCredentials(nextEmail: string, nextPassword: string): Promise<void> {
    const errors = validateLoginForm({ email: nextEmail, password: nextPassword });
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setBusy(true);
    setError("");
    try {
      const tokens = await api.login({ email: nextEmail, password: nextPassword });
      onAuthenticated(deriveSession(nextEmail, tokens));
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submitCredentials(email, password);
  }

  function quickLogin(account: SeedAccount): void {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    void submitCredentials(account.email, DEMO_PASSWORD);
  }

  return (
    <main className="auth">
      <BrandPanel />

      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              สมัครสมาชิก
            </button>
          </div>

          {mode === "register" ? (
            <RegisterForm api={api} />
          ) : (
            <>
              <div className="auth-kicker">เข้าสู่ระบบ</div>
              <h2>ขอเชิญร่วมบุญ</h2>
              <p className="a-hint">เข้าสู่ระบบเพื่อจองบริการของวัด ร่วมบุญ หรือจัดการงานวัด</p>

              <SocialButtons api={api} />
              <div className="auth-or">หรือใช้อีเมล</div>

              <form onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label htmlFor="auth-email">อีเมล</label>
                  <input
                    id="auth-email"
                    className="control"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@wat.local"
                    aria-invalid={fieldErrors.email ? true : undefined}
                  />
                  {fieldErrors.email ? <p className="error-text">{fieldErrors.email}</p> : null}
                </div>

                <div className="field">
                  <label htmlFor="auth-password">รหัสผ่าน</label>
                  <input
                    id="auth-password"
                    className="control"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={fieldErrors.password ? true : undefined}
                  />
                  {fieldErrors.password ? <p className="error-text">{fieldErrors.password}</p> : null}
                </div>

                <div className="between">
                  <label className="auth-remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                    />
                    จดจำการเข้าใช้
                  </label>
                  {/* No password-reset endpoint -> disabled, honest. */}
                  <button
                    type="button"
                    className="auth-link"
                    disabled
                    title={UNAVAILABLE_LABEL}
                    aria-label={`ลืมรหัสผ่าน (${UNAVAILABLE_LABEL})`}
                  >
                    ลืมรหัสผ่าน?
                  </button>
                </div>

                {error ? (
                  <p className="auth-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" variant="primary" className="btn-block" disabled={busy}>
                  {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
                </Button>
              </form>

              <div className="auth-or">หรือเข้าใช้งานด้วยบัญชีตัวอย่าง (เดโม)</div>
              <div className="opt-row">
                {accounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="acct"
                    onClick={() => quickLogin(account)}
                    disabled={busy}
                  >
                    <span className="av-sm">{account.label.charAt(0)}</span>
                    <span className="acct-meta">
                      <span className="acct-name">{account.label}</span>
                      <span className="acct-role">
                        {ROLE_NAMES[account.role]} · {account.email}
                      </span>
                    </span>
                    <Icon name="chevR" size={16} className="acct-go" />
                  </button>
                ))}
              </div>

              <p className="auth-demo-note">
                <Badge kind="neutral">เดโม</Badge> บัญชีตัวอย่างใช้รหัสผ่านชุดทดสอบของฐานข้อมูลสำหรับนักพัฒนา
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
