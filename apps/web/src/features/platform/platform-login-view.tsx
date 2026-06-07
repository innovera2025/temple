import { FormEvent, ReactElement, useState } from "react";
import { Button } from "../../design-system";
import { Icon } from "../../layout/icons";
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
    <div className="devotee-auth">
      <div className="devotee-auth-card card">
        <div className="devotee-auth-brand">
          <div className="a-seal">
            <Icon name="lotus" size={26} />
          </div>
          <div>
            <div className="devotee-auth-title">Innovera</div>
            <div className="devotee-auth-sub">ระบบเจ้าของแพลตฟอร์ม · จัดการวัดและผู้ใช้งานทั้งหมด</div>
          </div>
        </div>

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
            <input
              id="platform-login-password"
              className="control"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
              aria-invalid={errors.password ? true : undefined}
            />
            {errors.password ? <p className="error-text">{errors.password}</p> : null}
          </div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <Button type="submit" variant="primary" className="btn-block" disabled={busy}>
            {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </Button>
        </form>
      </div>
    </div>
  );
}
