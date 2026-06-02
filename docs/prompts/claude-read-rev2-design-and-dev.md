# Prompt for Claude Code — Read latest design revision and continue dev

Copy/paste the prompt below into Claude Code from `/Users/innovera/wat-management-system/temple`.

```text
คุณคือ Claude Code ทำงานในโปรเจกต์ Thai-first multi-tenant SaaS สำหรับระบบจัดการวัด

Working directory:
/Users/innovera/wat-management-system/temple

Branch ปัจจุบันควรเป็น:
task/web-0-design-shell-foundation

บริบทสำคัญ:
- โปรเจกต์นี้ต้องทำ UI ตาม Design artifacts ที่ user ส่งมาเท่านั้น ห้ามเดา layout เอง
- ห้ามใช้ smoke shell หรือ Agent Control Tower เป็น product UI
- ต้องตรวจ source-of-truth design ล่าสุดก่อนแก้ code ทุกครั้ง
- ห้ามเปิดเผย/คัดลอก secrets, tokens, API keys, passwords, credentials, connection strings ถ้าเจอให้แทนด้วย [REDACTED]

ล่าสุด user ส่ง design revision ใหม่แล้ว และถูกนำเข้า project context แล้ว:
- Latest original ZIP:
  /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/source.zip
- Latest extracted design:
  /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/
- Previous extracted design, ใช้เทียบเท่านั้น:
  /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02/extracted/

อ่าน docs เหล่านี้ก่อน:
- docs/plans/design-ui-implementation-plan.md
- docs/product/design-ui-map.md
- docs/reviews/design-ui-visual-review.md ถ้ามี
- docs/prompts/claude-read-rev2-design-and-dev.md ถ้ามี

อ่าน design files ล่าสุดเหล่านี้ก่อนลงมือ:
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/ds.css
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/admin-app.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/shell.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/screens-1.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/screens-2.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/screens-3.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/role-extras.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/app.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/auth.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/dashboard.jsx
- /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/shared.jsx
- screenshots ใน /Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/screenshots/

สิ่งที่รู้แล้วจากการ compare rev2 กับ revision ก่อนหน้า:
- JSX modules ส่วนใหญ่เหมือนเดิม
- ไฟล์ที่เปลี่ยนสำคัญคือ temple-admin/ds.css
- ds.css rev2 เปลี่ยน layout/design tokens หลัก:
  - --sidebar-w: 264px
  - --topbar-h: 62px
  - --maxw: 1760px
  - .content-wrap ต้อง width: 100%
  - เพิ่ม responsive gutters ที่ 1280/1600/1920px
  - page header ใหญ่/หายใจขึ้น มี eyebrow accent line
  - KPI/card มี hover/lift และ responsive sizing

งานที่ทำไปก่อนหน้า:
- commit 9bbe81c feat: enable temple registration auth flow
  - ทำ auth login/register ตาม auth.jsx
  - web/API tests, typecheck, build, browser visual ผ่าน
- commit 3bd5b84 feat: align temple admin pages with design
  - เพิ่ม apps/web/src/features/design-backed-pages.tsx
  - ปรับหน้า design-backed หลัก:
    - แดชบอร์ด
    - การบริจาค
    - ทะเบียนผู้บริจาค
    - ใบอนุโมทนาบัตร
    - บัญชีรายรับ-รายจ่าย
    - กิจกรรมและพิธี
    - พระสงฆ์และเจ้าหน้าที่
    - รายงานและส่งออก
    - สิทธิ์ผู้ใช้งาน
    - บันทึกการใช้งาน
    - ระบบออกแบบ
  - verify ก่อนหน้าเคยผ่าน:
    - pnpm --filter @wat/web test -- --run
    - pnpm --filter @wat/web typecheck
    - pnpm --filter @wat/web build

เป้าหมายรอบนี้:
อ่าน design revision ล่าสุด แล้วปรับ implementation ปัจจุบันให้ตรงกับ rev2 โดยเฉพาะ ds.css/layout shell changes และตรวจว่าหน้า/role สำคัญทุกหน้าไม่กลับไปเป็น smoke shell หรือ UI เดาเอง

ขั้นตอนที่ต้องทำ:
1. รัน git status --short --branch ก่อนเริ่ม
2. อ่าน docs/plans/design-ui-implementation-plan.md และ docs/product/design-ui-map.md
3. อ่าน design rev2 files ข้างต้น โดยเฉพาะ temple-admin/ds.css แล้วสรุป diff ที่ต้อง port
4. อ่าน implementation ปัจจุบัน:
   - apps/web/src/app.tsx
   - apps/web/src/styles.css
   - apps/web/src/layout/RoleShell.tsx
   - apps/web/src/layout/nav.ts
   - apps/web/src/features/page-content.tsx
   - apps/web/src/features/design-backed-pages.tsx
   - tests/specs ที่เกี่ยวข้อง
5. เปรียบเทียบ Design rev2 กับ implementation ปัจจุบัน แล้วแก้เฉพาะสิ่งที่จำเป็น
6. ถ้าต้องเปลี่ยน UI ให้เพิ่ม/ปรับ tests ก่อนหรือพร้อมกับ implementation เพื่อ lock copy/layout/design tokens สำคัญ
7. Port rev2 CSS/design-token changes อย่างรักษา product architecture เดิม ไม่ copy prototype business logic แบบสุ่ม
8. ตรวจ role/page coverage ตาม canonical product role model:
   - platform_owner
   - temple_owner
   - temple_user
   หมายเหตุ: auditor เป็น prototype-only ห้ามนำกลับมาใน runtime/product role model เว้นแต่ backend/schema/seed รองรับจริง
9. หากมีหน้าใดยังเป็น placeholder/static ให้ label ตรง ๆ ไม่แกล้งว่าเชื่อม API แล้ว
10. เมื่อแก้เสร็จให้รัน verification จริง

Verification ที่ต้องรันก่อนสรุป:
- pnpm --filter @wat/web test -- --run
- pnpm --filter @wat/web typecheck
- pnpm --filter @wat/web build
- Browser visual จริง:
  - start dev server
  - login หรือ set localStorage session แบบ dev ถ้าจำเป็น
  - เปิด dashboard และหน้า design-backed หลัก
  - ตรวจ responsive กว้างอย่างน้อย 1280px/1600px ถ้าทำได้ เพื่อยืนยัน rev2 wider layout
  - ตรวจ browser console ว่าไม่มี JS errors
  - ตรวจว่า UI ไม่ใช่ smoke shell / ไม่ใช่ Agent Control Tower
- git status --short --branch หลังทำงาน

Commit requirement:
- ถ้าแก้ code/docs/tests ให้ commit เป็นงานเดียวหรือหลาย commit ที่ชัดเจน
- message แนะนำ: feat: apply latest temple design revision
- หลัง commit git status ต้อง clean

ผลลัพธ์ที่ต้องส่งกลับ:
- สรุปว่าอ่าน design files ไหนแล้ว
- สรุปสิ่งที่ port จาก rev2
- รายการไฟล์ที่แก้
- ผล test/typecheck/build จริง
- ผล browser visual จริง รวม console errors ถ้ามี
- commit hash ล่าสุด
- remaining work ถ้ามี ให้บอกตรง ๆ

เริ่มทำเลย ไม่ต้องถามเพิ่ม เว้นแต่มี blocker ที่ทำต่อไม่ได้จริง ๆ
```

Optional one-shot command:

```bash
cd /Users/innovera/wat-management-system/temple
claude -p "$(sed -n '/^```text$/,/^```$/p' docs/prompts/claude-read-rev2-design-and-dev.md | sed '1d;$d')" --max-turns 30 --effort high
```

Optional tmux lane:

```bash
tmux new-session -d -s temple-design-rev2
python3 - <<'PY'
from pathlib import Path
prompt = Path('/Users/innovera/wat-management-system/temple/docs/prompts/claude-read-rev2-design-and-dev.md').read_text()
body = prompt.split('```text',1)[1].split('```',1)[0].strip()
Path('/tmp/temple-design-rev2-prompt.txt').write_text(body)
PY
tmux send-keys -t temple-design-rev2 'cd /Users/innovera/wat-management-system/temple && claude' Enter
# after Claude starts, paste /tmp/temple-design-rev2-prompt.txt into the tmux pane
```
