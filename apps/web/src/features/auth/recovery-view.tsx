import { FormEvent, ReactElement, useEffect, useState } from "react";
import { Button } from "../../design-system";
import {
  parseRecoveryHash,
  requestPasswordReset,
  resetPassword,
  verifyDevoteeEmail,
  type RecoveryApiOptions,
  type RecoveryPlane,
} from "./recovery";

const MIN_PASSWORD = 8;

/**
 * Inline "ลืมรหัสผ่าน" form for the login screens. Generic confirmation —
 * the API never discloses whether the email exists.
 */
export function ForgotPasswordForm({
  options,
  plane,
  onClose,
}: {
  options: RecoveryApiOptions;
  plane: RecoveryPlane;
  onClose: () => void;
}): ReactElement {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!email.trim()) {
      setError("กรุณากรอกอีเมล");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(options, plane, email);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-success" role="status" data-flow="forgot-password-done">
        <p>ถ้าอีเมลนี้มีบัญชีอยู่ ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว (ลิงก์ใช้ได้ 30 นาที)</p>
        <p className="muted">ไม่พบอีเมล? ตรวจโฟลเดอร์สแปม หรือยืนยันกับผู้ดูแลระบบของวัด</p>
        <Button variant="secondary" onClick={onClose}>กลับไปเข้าสู่ระบบ</Button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate data-flow="forgot-password">
      <p className="a-hint">กรอกอีเมลของบัญชี ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</p>
      <div className="field">
        <label htmlFor="forgot-email">อีเมล</label>
        <input
          id="forgot-email"
          className="control"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="row" style={{ gap: 8 }}>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "กำลังส่ง…" : "ส่งลิงก์ตั้งรหัสผ่าน"}
        </Button>
        <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
      </div>
    </form>
  );
}

/** Landing page for the emailed link: #/reset-password/<plane>?token=... */
export function ResetPasswordPage({ options }: { options: RecoveryApiOptions }): ReactElement {
  const [{ plane, token }] = useState(() =>
    parseRecoveryHash(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const loginHash = plane === "devotee" ? "#/devotee" : "#/";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`);
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await resetPassword(options, plane, token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-panel" style={{ margin: "0 auto" }}>
        <div className="auth-card" data-flow="reset-password">
          <div className="auth-kicker">ตั้งรหัสผ่านใหม่</div>
          <h2>{plane === "devotee" ? "บัญชีญาติโยม" : "บัญชีเจ้าหน้าที่วัด"}</h2>

          {!token ? (
            <p className="auth-error" role="alert">ลิงก์ไม่ถูกต้อง กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง</p>
          ) : done ? (
            <div className="auth-success" role="status">
              <p>ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว ใช้รหัสผ่านใหม่เข้าสู่ระบบได้เลย</p>
              <a className="btn btn-primary" href={loginHash}>ไปหน้าเข้าสู่ระบบ</a>
            </div>
          ) : (
            <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
              <div className="field">
                <label htmlFor="reset-password-new">รหัสผ่านใหม่</label>
                <input
                  id="reset-password-new"
                  className="control"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reset-password-confirm">ยืนยันรหัสผ่านใหม่</label>
                <input
                  id="reset-password-confirm"
                  className="control"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error ? <p className="auth-error" role="alert">{error}</p> : null}
              <Button type="submit" variant="primary" className="btn-block" disabled={busy}>
                {busy ? "กำลังบันทึก…" : "ตั้งรหัสผ่านใหม่"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

/** Landing page for the emailed link: #/verify-email?token=... (devotee plane). */
export function VerifyEmailPage({ options }: { options: RecoveryApiOptions }): ReactElement {
  const [{ token }] = useState(() =>
    parseRecoveryHash(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setState("failed");
      setError("ลิงก์ไม่ถูกต้อง");
      return;
    }
    verifyDevoteeEmail(options, token).then(
      () => { if (active) setState("done"); },
      (err: unknown) => {
        if (active) {
          setState("failed");
          setError(err instanceof Error ? err.message : "ยืนยันอีเมลไม่สำเร็จ");
        }
      },
    );
    return () => { active = false; };
    // parse once on mount — the token never changes within this page view
  }, []);

  return (
    <main className="auth">
      <div className="auth-panel" style={{ margin: "0 auto" }}>
        <div className="auth-card" data-flow="verify-email">
          <div className="auth-kicker">ยืนยันอีเมล</div>
          <h2>พอร์ทัลญาติโยม</h2>
          {state === "working" ? (
            <p className="a-hint">กำลังยืนยันอีเมล…</p>
          ) : state === "done" ? (
            <div className="auth-success" role="status">
              <p>ยืนยันอีเมลเรียบร้อยแล้ว ขออนุโมทนา</p>
              <a className="btn btn-primary" href="#/devotee">ไปยังพอร์ทัลญาติโยม</a>
            </div>
          ) : (
            <div>
              <p className="auth-error" role="alert">{error || "ยืนยันอีเมลไม่สำเร็จ"}</p>
              <p className="muted">ลิงก์อาจหมดอายุ — เข้าสู่ระบบแล้วกด “ส่งลิงก์ยืนยันใหม่” ได้ที่หน้าบัญชีของฉัน</p>
              <a className="btn btn-secondary" href="#/devotee">ไปยังพอร์ทัลญาติโยม</a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
