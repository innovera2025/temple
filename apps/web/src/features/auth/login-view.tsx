import { FormEvent, ReactElement, useState } from "react";
import { Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import { AuthShell } from "./auth-shell";
import { RegisterForm } from "./register-view";
import { ForgotPasswordForm } from "./recovery-view";
import type { RecoveryApiOptions } from "./recovery";
import {
  AuthApi,
  deriveSession,
  loginErrorMessage,
  LoginFormErrors,
  Session,
  UNAVAILABLE_LABEL,
  validateLoginForm,
} from "./auth";

type Mode = "login" | "register";

export interface LoginScreenProps {
  api: AuthApi;
  onAuthenticated: (session: Session) => void;
  /** Social sign-in buttons (shown by default per the design; render a
   *  "coming soon" notice on click until the OAuth callback flow ships). */
  showSocial?: boolean;
  /** Enables the ลืมรหัสผ่าน flow (POST /auth/forgot-password). */
  recoveryOptions?: RecoveryApiOptions;
  /** Optional banner shown above the form (e.g. after the session expires). */
  notice?: string;
}

// Brand logos for the social sign-in buttons (rendered per the design). Kept as
// small inline SVGs so there is no extra asset dependency.
function GoogleLogo(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function FacebookLogo(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

// Social/OAuth providers from the design's SocialButtons.
const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google", Logo: GoogleLogo },
  { id: "facebook", label: "Facebook", Logo: FacebookLogo },
] as const;

// Shown by default per the temple login design. The OAuth flow is not wired
// end-to-end yet (no /oauth/callback handler), so the buttons render but report
// "coming soon" on click instead of dead-ending at the provider. Hide entirely
// with VITE_SHOW_SOCIAL_LOGIN=false.
const SHOW_SOCIAL_LOGIN = import.meta.env.VITE_SHOW_SOCIAL_LOGIN !== "false";

function SocialButtons(): ReactElement {
  const [comingSoon, setComingSoon] = useState(false);

  return (
    <div className="auth-social">
      <div className="soc-row">
        {SOCIAL_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="soc-btn"
            aria-label={`เข้าสู่ระบบด้วย ${provider.label}`}
            onClick={() => setComingSoon(true)}
          >
            <provider.Logo />
            {provider.label}
          </button>
        ))}
      </div>
      {comingSoon ? (
        <p className="auth-social-note" role="status">
          เข้าสู่ระบบด้วย Google หรือ Facebook — เปิดให้บริการเร็วๆ นี้
        </p>
      ) : null}
    </div>
  );
}

export function LoginScreen({
  api,
  onAuthenticated,
  showSocial = SHOW_SOCIAL_LOGIN,
  recoveryOptions,
  notice,
}: LoginScreenProps): ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<LoginFormErrors>({});
  const [forgotOpen, setForgotOpen] = useState(false);

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

  return (
    <AuthShell>
      {notice ? <div className="auth-notice" role="status">{notice}</div> : null}
      <div className="auth-tabs" role="tablist" aria-label="เข้าสู่ระบบหรือสมัครสมาชิก">
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
      ) : forgotOpen && recoveryOptions ? (
        <>
          <div className="auth-kicker">ลืมรหัสผ่าน</div>
          <h2>ตั้งรหัสผ่านใหม่</h2>
          <ForgotPasswordForm
            options={recoveryOptions}
            plane="staff"
            onClose={() => setForgotOpen(false)}
          />
        </>
      ) : (
        <>
          <h2>ยินดีต้อนรับกลับ</h2>
          <p className="a-hint">ลงชื่อเข้าใช้เพื่อจัดการงานของวัด</p>

          {showSocial ? (
            <>
              <SocialButtons />
              <div className="auth-or">หรือใช้อีเมล</div>
            </>
          ) : null}

          <form onSubmit={onSubmit} noValidate aria-busy={busy}>
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
              <div style={{ position: "relative" }}>
                <input
                  id="auth-password"
                  className="control"
                  style={{ paddingRight: 44, width: "100%" }}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={fieldErrors.password ? true : undefined}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  aria-pressed={showPassword}
                  title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  <Icon name="eye" size={16} />
                </button>
              </div>
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
              {recoveryOptions ? (
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => setForgotOpen(true)}
                  aria-label="ลืมรหัสผ่าน"
                >
                  ลืมรหัสผ่าน?
                </button>
              ) : (
                <button
                  type="button"
                  className="auth-link"
                  disabled
                  title={UNAVAILABLE_LABEL}
                  aria-label={`ลืมรหัสผ่าน (${UNAVAILABLE_LABEL})`}
                >
                  ลืมรหัสผ่าน?
                </button>
              )}
            </div>

            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" className="btn-block" icon={<Icon name="arrowR" size={16} />} disabled={busy}>
              {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
