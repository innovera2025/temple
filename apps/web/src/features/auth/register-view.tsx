import { FormEvent, ReactElement, useState } from "react";
import { Badge, Button } from "../../design-system";
import {
  AuthApi,
  AuthError,
  hasRegisterErrors,
  RegisterFormErrors,
  RegisterInput,
  validateRegisterForm,
} from "./auth";

export interface RegisterFormProps {
  api: AuthApi;
}

const initialValues: RegisterInput = {
  templeNameTh: "",
  contactEmail: "",
  password: "",
  confirmPassword: "",
  displayName: "",
  acceptedTerms: false,
};

function registerErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.status === 409) return "อีเมลนี้มีใบสมัครหรือบัญชีอยู่แล้ว";
    if (error.status === 429) return "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
    if (error.status >= 500) return "ระบบรับสมัครขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง";
    return error.message || "สมัครสมาชิกไม่สำเร็จ";
  }
  if (error instanceof TypeError) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ";
  return "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่";
}

/**
 * Self-service signup creates a pending temple application only — never an admin user.
 * (Donor/ญาติโยม self-service accounts are a separate platform-identity feature, not
 * part of this temple-admin signup; "ผู้บริจาค" lives only as a CRM record.)
 */
export function RegisterForm({ api }: RegisterFormProps): ReactElement {
  const [values, setValues] = useState<RegisterInput>(initialValues);
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  function update<K extends keyof RegisterInput>(key: K, value: RegisterInput[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nextErrors = validateRegisterForm(values);
    setErrors(nextErrors);
    setMessage("");
    setError("");
    if (hasRegisterErrors(nextErrors)) return;

    setBusy(true);
    try {
      const result = await api.register(values);
      setMessage(`รับคำขอสมัครของ ${result.templeNameTh} แล้ว สถานะ: รอตรวจสอบโดยผู้ดูแลแพลตฟอร์ม`);
      setValues(initialValues);
    } catch (err) {
      setError(registerErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-register" data-flow="register" aria-describedby="register-note">
      <div className="auth-note" id="register-note" role="note">
        <Badge kind="neutral">รอตรวจสอบ</Badge>
        <p>
          สมัครสมาชิกจะสร้างใบสมัครวัดสถานะรอตรวจสอบเท่านั้น ผู้สมัครจะยังไม่ได้สิทธิ์ผู้ดูแลวัด
          จนกว่าผู้ดูแลแพลตฟอร์มจะอนุมัติและกำหนดบัญชีเริ่มต้น
        </p>
      </div>

      <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
        <div className="field">
          <label htmlFor="register-temple">ชื่อวัด</label>
          <input
            id="register-temple"
            className="control"
            value={values.templeNameTh}
            onChange={(event) => update("templeNameTh", event.target.value)}
            placeholder="เช่น วัดธรรมสถิตวนาราม"
            aria-invalid={errors.templeNameTh ? true : undefined}
          />
          {errors.templeNameTh ? <p className="error-text">{errors.templeNameTh}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="register-name">ชื่อผู้ติดต่อ</label>
          <input
            id="register-name"
            className="control"
            value={values.displayName}
            onChange={(event) => update("displayName", event.target.value)}
            placeholder="ชื่อ-นามสกุล"
            aria-invalid={errors.displayName ? true : undefined}
          />
          {errors.displayName ? <p className="error-text">{errors.displayName}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="register-email">อีเมลผู้ติดต่อ</label>
          <input
            id="register-email"
            className="control"
            type="email"
            autoComplete="email"
            value={values.contactEmail}
            onChange={(event) => update("contactEmail", event.target.value)}
            placeholder="name@example.com"
            aria-invalid={errors.contactEmail ? true : undefined}
          />
          {errors.contactEmail ? <p className="error-text">{errors.contactEmail}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="register-password">รหัสผ่านสำหรับคำขอ</label>
          <input
            id="register-password"
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
          <label htmlFor="register-confirm-password">ยืนยันรหัสผ่าน</label>
          <input
            id="register-confirm-password"
            className="control"
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(event) => update("confirmPassword", event.target.value)}
            aria-invalid={errors.confirmPassword ? true : undefined}
          />
          {errors.confirmPassword ? <p className="error-text">{errors.confirmPassword}</p> : null}
        </div>
        <label className="auth-remember">
          <input
            type="checkbox"
            checked={values.acceptedTerms}
            onChange={(event) => update("acceptedTerms", event.target.checked)}
          />
          ยืนยันว่าข้อมูลถูกต้องและเข้าใจว่าต้องรอการอนุมัติ
        </label>
        {errors.acceptedTerms ? <p className="error-text">{errors.acceptedTerms}</p> : null}

        {message ? <p className="auth-success" role="status">{message}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        <Button type="submit" variant="primary" className="btn-block" disabled={busy}>
          {busy ? "กำลังส่งคำขอ…" : "ส่งคำขอสมัครสมาชิก"}
        </Button>
      </form>
    </div>
  );
}

