import { FormEvent, ReactElement, useState } from "react";
import { Badge, Button } from "../../design-system";
import { Icon, IconName } from "../../layout/icons";
import { ROLE_NAMES } from "../../layout/nav";
import { RegisterUnavailable } from "./register-view";
import {
  AUTH_FLOW_AVAILABILITY,
  AuthApi,
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

// The three product strengths shown on the brand panel (design pts[]).
const HIGHLIGHTS: { icon: IconName; text: string }[] = [
  { icon: "donation", text: "รับบริจาคและออกใบอนุโมทนาบัตร" },
  { icon: "ledger", text: "บัญชีรายรับ-รายจ่ายและรายงาน" },
  { icon: "roles", text: "สิทธิ์ผู้ใช้และบันทึกการใช้งาน" },
];

type Mode = "login" | "register";

export interface LoginScreenProps {
  api: AuthApi;
  onAuthenticated: (session: Session) => void;
  /** Quick-login seed accounts (dev convenience). Defaults to the real seed table. */
  accounts?: readonly SeedAccount[];
}

// Social/OAuth providers from the design's SocialButtons. No backend -> disabled.
const SOCIAL_PROVIDERS = ["Google", "Facebook"] as const;

function BrandPanel(): ReactElement {
  return (
    <div className="auth-art">
      <div className="a-brand">
        <div className="a-seal">
          <Icon name="lotus" size={26} />
        </div>
        <div>
          <div className="a-brand-name">วัดธรรมสถิตวนาราม</div>
          <div className="a-brand-sub">ระบบบริหารจัดการวัด</div>
        </div>
      </div>

      <div className="a-lead">
        <div className="a-line" />
        <h1>
          บริหารงานวัด
          <br />
          ด้วยความโปร่งใส
          <br />
          และเป็นระเบียบ
        </h1>
        <p className="a-sub">
          ระบบกลางสำหรับงานบริจาค บัญชี กิจกรรม และทะเบียนบุคลากร — ออกแบบให้สุภาพ
          ใช้งานง่าย และตรวจสอบได้
        </p>
        <div className="a-points">
          {HIGHLIGHTS.map((point) => (
            <div className="a-point" key={point.icon}>
              <span className="pc">
                <Icon name={point.icon} size={15} />
              </span>
              {point.text}
            </div>
          ))}
        </div>
      </div>

      <div className="a-foot">© ๒๕๖๙ วัดธรรมสถิตวนาราม · ใช้งานภายในสำหรับเจ้าหน้าที่</div>
      <div className="a-watermark" aria-hidden="true">
        <Icon name="lotus" size={360} />
      </div>
    </div>
  );
}

// Social/OAuth sign-in — rendered for design continuity but disabled (no backend).
function SocialButtons(): ReactElement {
  return (
    <div className="auth-social">
      <div className="soc-row">
        {SOCIAL_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            className="soc-btn"
            disabled
            title={UNAVAILABLE_LABEL}
            aria-label={`${provider} (${UNAVAILABLE_LABEL})`}
          >
            {provider}
          </button>
        ))}
      </div>
      <p className="auth-social-note">การเข้าสู่ระบบด้วยบัญชีภายนอกยังไม่พร้อมใช้งาน</p>
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
              {!AUTH_FLOW_AVAILABILITY.register ? <span className="tab-flag">{UNAVAILABLE_LABEL}</span> : null}
            </button>
          </div>

          {mode === "register" ? (
            <RegisterUnavailable />
          ) : (
            <>
              <h2>ยินดีต้อนรับกลับ</h2>
              <p className="a-hint">ลงชื่อเข้าใช้เพื่อจัดการงานของวัด</p>

              <SocialButtons />
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
