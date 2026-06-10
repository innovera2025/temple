import { FormEvent, ReactElement, useState } from "react";
import { Button } from "../../design-system";
import { Icon } from "../../layout/icons";
import { ForgotPasswordForm } from "../auth/recovery-view";
import type { RecoveryApiOptions } from "../auth/recovery";
import {
  DevoteeApi,
  DevoteeLoginErrors,
  DevoteeLoginValues,
  DevoteeRegisterErrors,
  DevoteeRegisterValues,
  DevoteeSession,
  deriveDevoteeSession,
  devoteeErrorMessage,
  hasLoginErrors,
  hasRegisterErrors,
  validateDevoteeLoginForm,
  validateDevoteeRegisterForm,
} from "./devotee-auth";

type Mode = "login" | "register";

export interface DevoteeLoginViewProps {
  api: DevoteeApi;
  onAuthenticated: (session: DevoteeSession) => void;
  /** Enables the ลืมรหัสผ่าน flow (POST /devotee/auth/forgot-password). */
  recoveryOptions?: RecoveryApiOptions;
}

const emptyLogin: DevoteeLoginValues = { email: "", password: "" };
const emptyRegister: DevoteeRegisterValues = {
  email: "",
  displayName: "",
  password: "",
  confirmPassword: "",
  phone: "",
};

export function DevoteeLoginView({ api, onAuthenticated, recoveryOptions }: DevoteeLoginViewProps): ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [forgotOpen, setForgotOpen] = useState(false);

  return (
    <div className="devotee-auth">
      <div className="devotee-auth-card card">
        <div className="devotee-auth-brand">
          <div className="a-seal">
            <Icon name="lotus" size={26} />
          </div>
          <div>
            <div className="devotee-auth-title">ร่วมบุญออนไลน์</div>
            <div className="devotee-auth-sub">สำหรับญาติโยม · เลือกวัดและร่วมทำบุญได้ทุกวัดในระบบ</div>
          </div>
        </div>

        <div className="seg" role="tablist" aria-label="เข้าสู่ระบบหรือสมัครสมาชิก">
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

        {mode === "login" ? (
          forgotOpen && recoveryOptions ? (
            <ForgotPasswordForm options={recoveryOptions} plane="devotee" onClose={() => setForgotOpen(false)} />
          ) : (
            <>
              <LoginForm api={api} onAuthenticated={onAuthenticated} />
              {recoveryOptions ? (
                <button type="button" className="auth-link" onClick={() => setForgotOpen(true)}>
                  ลืมรหัสผ่าน?
                </button>
              ) : null}
            </>
          )
        ) : (
          <RegisterForm api={api} onAuthenticated={onAuthenticated} />
        )}
      </div>
    </div>
  );
}

function LoginForm({ api, onAuthenticated }: DevoteeLoginViewProps): ReactElement {
  const [values, setValues] = useState<DevoteeLoginValues>(emptyLogin);
  const [errors, setErrors] = useState<DevoteeLoginErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = validateDevoteeLoginForm(values);
    setErrors(next);
    setError("");
    if (hasLoginErrors(next)) return;
    setBusy(true);
    try {
      const tokens = await api.login(values);
      onAuthenticated(deriveDevoteeSession(tokens, { email: values.email }));
    } catch (err) {
      setError(devoteeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="field">
        <label htmlFor="devotee-login-email">อีเมล</label>
        <input
          id="devotee-login-email"
          className="control"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
          placeholder="name@example.com"
          aria-invalid={errors.email ? true : undefined}
        />
        {errors.email ? <p className="error-text">{errors.email}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="devotee-login-password">รหัสผ่าน</label>
        <input
          id="devotee-login-password"
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
  );
}

function RegisterForm({ api, onAuthenticated }: DevoteeLoginViewProps): ReactElement {
  const [values, setValues] = useState<DevoteeRegisterValues>(emptyRegister);
  const [errors, setErrors] = useState<DevoteeRegisterErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof DevoteeRegisterValues>(key: K, value: DevoteeRegisterValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = validateDevoteeRegisterForm(values);
    setErrors(next);
    setError("");
    if (hasRegisterErrors(next)) return;
    setBusy(true);
    try {
      const tokens = await api.register(values);
      onAuthenticated(deriveDevoteeSession(tokens, { email: values.email, displayName: values.displayName }));
    } catch (err) {
      setError(devoteeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="field">
        <label htmlFor="devotee-reg-name">ชื่อ-นามสกุล</label>
        <input
          id="devotee-reg-name"
          className="control"
          value={values.displayName}
          onChange={(event) => update("displayName", event.target.value)}
          placeholder="ชื่อที่จะแสดงในใบอนุโมทนา"
          aria-invalid={errors.displayName ? true : undefined}
        />
        {errors.displayName ? <p className="error-text">{errors.displayName}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="devotee-reg-email">อีเมล</label>
        <input
          id="devotee-reg-email"
          className="control"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => update("email", event.target.value)}
          placeholder="name@example.com"
          aria-invalid={errors.email ? true : undefined}
        />
        {errors.email ? <p className="error-text">{errors.email}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="devotee-reg-phone">เบอร์โทร (ไม่บังคับ)</label>
        <input
          id="devotee-reg-phone"
          className="control"
          value={values.phone}
          onChange={(event) => update("phone", event.target.value)}
          placeholder="08x-xxx-xxxx"
        />
      </div>
      <div className="field">
        <label htmlFor="devotee-reg-password">รหัสผ่าน</label>
        <input
          id="devotee-reg-password"
          className="control"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={(event) => update("password", event.target.value)}
          placeholder="อย่างน้อย 8 ตัว"
          aria-invalid={errors.password ? true : undefined}
        />
        {errors.password ? <p className="error-text">{errors.password}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="devotee-reg-confirm">ยืนยันรหัสผ่าน</label>
        <input
          id="devotee-reg-confirm"
          className="control"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={(event) => update("confirmPassword", event.target.value)}
          aria-invalid={errors.confirmPassword ? true : undefined}
        />
        {errors.confirmPassword ? <p className="error-text">{errors.confirmPassword}</p> : null}
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <Button type="submit" variant="primary" className="btn-block" disabled={busy}>
        {busy ? "กำลังสมัคร…" : "สมัครสมาชิก"}
      </Button>
    </form>
  );
}
