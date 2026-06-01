import { ReactElement } from "react";
import { Badge } from "../../design-system";
import { UNAVAILABLE_LABEL } from "./auth";

/**
 * The design's `RegisterForm` (admin-app.jsx ~14229) renders a self-service signup
 * (ชื่อ/นามสกุล/อีเมล/รหัสผ่าน/ยอมรับเงื่อนไข). There is no `/auth/register` endpoint
 * (design-ui-map.md §6: future/out-of-scope), so we must NOT ship a fake submit.
 *
 * We keep the design's visual structure for continuity but render every control as
 * disabled, with a prominent honest banner explaining the real onboarding path
 * (new temples are provisioned by the platform admin). There is no submit handler.
 */
export function RegisterUnavailable(): ReactElement {
  return (
    <div className="auth-register" data-flow="register" aria-describedby="register-unavailable-note">
      <div className="auth-note" id="register-unavailable-note" role="note">
        <Badge kind="void">{UNAVAILABLE_LABEL}</Badge>
        <p>
          ระบบยังไม่เปิดให้สมัครสมาชิกด้วยตนเอง การเปิดใช้งานวัดใหม่และการเพิ่มผู้ใช้
          ดำเนินการโดยผู้ดูแลแพลตฟอร์ม โปรดติดต่อผู้ดูแลระบบของวัดเพื่อขอบัญชีเข้าใช้งาน
        </p>
      </div>

      {/* Faithful-to-design but fully disabled — for visual continuity only. */}
      <fieldset className="auth-form" disabled aria-hidden="true">
        <div className="form-grid">
          <div className="field">
            <label>ชื่อ</label>
            <input className="control" placeholder="เช่น สมศรี" disabled />
          </div>
          <div className="field">
            <label>นามสกุล</label>
            <input className="control" placeholder="ใจบุญ" disabled />
          </div>
        </div>
        <div className="field">
          <label>อีเมล</label>
          <input className="control" placeholder="name@wat.local" disabled />
        </div>
        <div className="field">
          <label>รหัสผ่าน</label>
          <input className="control" type="password" placeholder="อย่างน้อย 8 ตัว" disabled />
        </div>
        <div className="field">
          <label>ยืนยันรหัสผ่าน</label>
          <input className="control" type="password" disabled />
        </div>
        <button type="button" className="btn btn-primary btn-block" disabled title={UNAVAILABLE_LABEL}>
          สมัครสมาชิก
        </button>
      </fieldset>
    </div>
  );
}
