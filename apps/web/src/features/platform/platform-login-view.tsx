import { FormEvent, ReactElement, useState } from "react";
import { Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import { AuthShell } from "../auth/auth-shell";
import {
  PlatformApi,
  PlatformLoginErrors,
  PlatformLoginValues,
  PlatformSession,
  derivePlatformSession,
  hasPlatformLoginErrors,
  platformErrorMessage,
  validatePlatformLoginForm,
} from "./platform-auth";

export interface PlatformLoginViewProps {
  api: PlatformApi;
  onAuthenticated: (session: PlatformSession) => void;
}

const empty: PlatformLoginValues = { email: "", password: "" };

/**
 * Login-only — platform operators are seeded/managed by Innovera, never self-signup.
 * Reuses the centered auth-card styling shared with the devotee login.
 */
export function PlatformLoginView({ api, onAuthenticated }: PlatformLoginViewProps): ReactElement {
  const [values, setValues] = useState<PlatformLoginValues>(empty);
  const [errors, setErrors] = useState<PlatformLoginErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = validatePlatformLoginForm(values);
    setErrors(next);
    setError("");
    if (hasPlatformLoginErrors(next)) return;
    setBusy(true);
    try {
      const tokens = await api.login(values);
      onAuthenticated(derivePlatformSession(tokens, { email: values.email }));
    } catch (err) {
      setError(platformErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-kicker">ผู้ดูแลแพลตฟอร์ม</div>
      <h2>Innovera</h2>
      <p className="a-hint">ระบบเจ้าของแพลตฟอร์ม · จัดการวัดและผู้ใช้งานทั้งหมด</p>

      <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="field">
          <label htmlFor="platform-login-email">อีเมล</label>
          <input
            id="platform-login-email"
            className="control"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
            placeholder="name@innovera.example"
            aria-invalid={errors.email ? true : undefined}
          />
          {errors.email ? <p className="error-text">{errors.email}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="platform-login-password">รหัสผ่าน</label>
          <div style={{ position: "relative" }}>
            <input
              id="platform-login-password"
              className="control"
              style={{ paddingRight: 44, width: "100%" }}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
              aria-invalid={errors.password ? true : undefined}
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
          {errors.password ? <p className="error-text">{errors.password}</p> : null}
        </div>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <Button type="submit" variant="primary" className="btn-block" disabled={busy}>
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </Button>
      </form>
    </AuthShell>
  );
}
