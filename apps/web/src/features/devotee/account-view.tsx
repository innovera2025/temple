import { FormEvent, ReactElement, useEffect, useState } from "react";
import { Button } from "../../design-system";
import {
  DevoteeApi,
  DevoteePasswordErrors,
  DevoteePasswordValues,
  DevoteeProfile,
  DevoteeProfileErrors,
  DevoteeProfileValues,
  devoteeErrorMessage,
  hasPasswordErrors,
  hasProfileErrors,
  validatePasswordForm,
  validateProfileForm,
} from "./devotee-auth";

export interface AccountViewProps {
  api: DevoteeApi;
  token: string;
  onUnauthorized: () => void;
}

function is401(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401);
}

export function AccountView({ api, token, onUnauthorized }: AccountViewProps): ReactElement {
  const [profile, setProfile] = useState<DevoteeProfile | null>(null);
  const [loadError, setLoadError] = useState("");

  const [pValues, setPValues] = useState<DevoteeProfileValues>({ displayName: "", phone: "" });
  const [pErrors, setPErrors] = useState<DevoteeProfileErrors>({});
  const [pBusy, setPBusy] = useState(false);
  const [pMsg, setPMsg] = useState("");
  const [pErr, setPErr] = useState("");

  const empty: DevoteePasswordValues = { currentPassword: "", newPassword: "", confirmPassword: "" };
  const [pwValues, setPwValues] = useState<DevoteePasswordValues>(empty);
  const [pwErrors, setPwErrors] = useState<DevoteePasswordErrors>({});
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile(token)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setPValues({ displayName: p.displayName, phone: p.phone ?? "" });
      })
      .catch((err) => {
        if (cancelled) return;
        if (is401(err)) {
          onUnauthorized();
          return;
        }
        setLoadError(devoteeErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, token, onUnauthorized]);

  async function onSubmitProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPMsg("");
    setPErr("");
    const next = validateProfileForm(pValues);
    setPErrors(next);
    if (hasProfileErrors(next)) return;
    setPBusy(true);
    try {
      const updated = await api.updateProfile(token, pValues);
      setProfile(updated);
      setPMsg("บันทึกโปรไฟล์แล้ว");
    } catch (err) {
      if (is401(err)) {
        onUnauthorized();
        return;
      }
      setPErr(devoteeErrorMessage(err));
    } finally {
      setPBusy(false);
    }
  }

  async function onSubmitPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPwMsg("");
    setPwErr("");
    const next = validatePasswordForm(pwValues);
    setPwErrors(next);
    if (hasPasswordErrors(next)) return;
    setPwBusy(true);
    try {
      await api.changePassword(token, pwValues);
      setPwMsg("เปลี่ยนรหัสผ่านแล้ว");
      setPwValues(empty);
    } catch (err) {
      // 401 here means the CURRENT password was wrong — show inline, don't log out.
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        setPwErr("รหัสผ่านปัจจุบันไม่ถูกต้อง");
        return;
      }
      setPwErr(devoteeErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <h1>บัญชีของฉัน</h1>
          <p className="page-sub">แก้ไขข้อมูลส่วนตัวและรหัสผ่านของคุณ</p>
        </div>
      </div>

      {loadError ? <p className="auth-error" role="alert">{loadError}</p> : null}
      {profile === null && !loadError ? <p className="muted">กำลังโหลด…</p> : null}

      {profile ? (
        <div className="devotee-temple-detail">
          <div className="card devotee-donate">
            <h2 className="devotee-donate-title">ข้อมูลส่วนตัว</h2>
            <form className="auth-form" onSubmit={(e) => void onSubmitProfile(e)} noValidate>
              <div className="field">
                <label htmlFor="acct-email">อีเมล</label>
                <input id="acct-email" className="control" value={profile.email} readOnly disabled />
              </div>
              <div className="field">
                <label htmlFor="acct-name">ชื่อ-นามสกุล</label>
                <input
                  id="acct-name"
                  className="control"
                  value={pValues.displayName}
                  onChange={(e) => setPValues((v) => ({ ...v, displayName: e.target.value }))}
                  aria-invalid={pErrors.displayName ? true : undefined}
                />
                {pErrors.displayName ? <p className="error-text">{pErrors.displayName}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="acct-phone">เบอร์โทร</label>
                <input
                  id="acct-phone"
                  className="control"
                  value={pValues.phone}
                  onChange={(e) => setPValues((v) => ({ ...v, phone: e.target.value }))}
                  placeholder="08x-xxx-xxxx"
                />
              </div>
              {pMsg ? <p className="auth-success" role="status">{pMsg}</p> : null}
              {pErr ? <p className="auth-error" role="alert">{pErr}</p> : null}
              <Button type="submit" variant="primary" className="btn-block" disabled={pBusy}>
                {pBusy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
              </Button>
            </form>
          </div>

          <div className="card devotee-donate">
            <h2 className="devotee-donate-title">เปลี่ยนรหัสผ่าน</h2>
            <form className="auth-form" onSubmit={(e) => void onSubmitPassword(e)} noValidate>
              <div className="field">
                <label htmlFor="acct-cur">รหัสผ่านปัจจุบัน</label>
                <input
                  id="acct-cur"
                  className="control"
                  type="password"
                  autoComplete="current-password"
                  value={pwValues.currentPassword}
                  onChange={(e) => setPwValues((v) => ({ ...v, currentPassword: e.target.value }))}
                  aria-invalid={pwErrors.currentPassword ? true : undefined}
                />
                {pwErrors.currentPassword ? <p className="error-text">{pwErrors.currentPassword}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="acct-new">รหัสผ่านใหม่</label>
                <input
                  id="acct-new"
                  className="control"
                  type="password"
                  autoComplete="new-password"
                  value={pwValues.newPassword}
                  onChange={(e) => setPwValues((v) => ({ ...v, newPassword: e.target.value }))}
                  placeholder="อย่างน้อย 8 ตัว"
                  aria-invalid={pwErrors.newPassword ? true : undefined}
                />
                {pwErrors.newPassword ? <p className="error-text">{pwErrors.newPassword}</p> : null}
              </div>
              <div className="field">
                <label htmlFor="acct-confirm">ยืนยันรหัสผ่านใหม่</label>
                <input
                  id="acct-confirm"
                  className="control"
                  type="password"
                  autoComplete="new-password"
                  value={pwValues.confirmPassword}
                  onChange={(e) => setPwValues((v) => ({ ...v, confirmPassword: e.target.value }))}
                  aria-invalid={pwErrors.confirmPassword ? true : undefined}
                />
                {pwErrors.confirmPassword ? <p className="error-text">{pwErrors.confirmPassword}</p> : null}
              </div>
              {pwMsg ? <p className="auth-success" role="status">{pwMsg}</p> : null}
              {pwErr ? <p className="auth-error" role="alert">{pwErr}</p> : null}
              <Button type="submit" variant="primary" className="btn-block" disabled={pwBusy}>
                {pwBusy ? "กำลังเปลี่ยน…" : "เปลี่ยนรหัสผ่าน"}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
