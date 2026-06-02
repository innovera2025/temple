# Design UI Implementation Plan — ระบบจัดการวัด

> **For Hermes:** Use `writing-plans` + `subagent-driven-development` to implement this plan task-by-task. Do not claim UI is complete until the app has been rebuilt against the design source and verified visually/functionally.

**Goal:** Build the ระบบจัดการวัด web UI from the actual Claude Design / user-provided design files, not from a temporary smoke-test shell.

**Architecture:** Treat the design artifact as the source of truth for layout, navigation, copy, role-specific screens, components, and interaction patterns. Port the design into maintainable React components under `apps/web/src`, then wire each screen to the existing API modules. Keep smoke-test utilities separate from production UI.

**Tech Stack:** React + Vite + TypeScript, existing `@wat/web` app, existing Nest API at `apps/api`, existing shared schemas/contracts where available.

---

## Source of truth

### Existing extracted design artifacts

Use these first:

- Design inventory: `docs/reviews/claude-design-function-inventory.md`
- Claude Design captured source: `/Users/innovera/wat-management-system/artifacts/claude-design/temple-admin-index-from-save_files/_bootstrap.html`
- Captured page shell: `/Users/innovera/wat-management-system/artifacts/claude-design/temple-admin-index-from-save.html`

The inventory says the design contains these important components/screens:

- `LoginScreen`
- `RegisterForm`
- `RoleShell`
- `Dashboard`
- `DonationIntake`
- `DonorProfile`
- `AnumodanaDoc`
- `InnoveraView`
- `PublicView`
- Shared UI: `Btn`, `Badge`, `Card`, `Modal`, `Drawer`, `Toast`, `Toolbar`, `SearchBox`, `Sidebar`, `Topbar`

### User-provided design files

The user sent an additional design export on 2026-06-02. Treat it as source-of-truth for future UI work, alongside the existing Claude Design capture:

- Original ZIP: `/Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02/source.zip`
- Extracted files: `/Users/innovera/wat-management-system/artifacts/user-provided/ระบบจัดการวัด-2026-06-02/extracted/`
- Top-level design files include: `app.jsx`, `auth.jsx`, `apply.jsx`, `dashboard.jsx`, `donate.jsx`, `members.jsx`, `bookings.jsx`, `calendar.jsx`, `settings.jsx`, `temple-settings.jsx`, `innovera.jsx`, `platform-data.jsx`, `shared.jsx`, `styles.css`, `index.html`, screenshots under `screenshots/`, and standalone HTML exports.
- Admin design files include: `temple-admin/admin-app.jsx`, `temple-admin/data.jsx`, `temple-admin/screens-1.jsx`, `temple-admin/screens-2.jsx`, `temple-admin/screens-3.jsx`, `temple-admin/role-extras.jsx`, `temple-admin/shell.jsx`, `temple-admin/ds.css`, `temple-admin/ds-screen.jsx`, `temple-admin/icons.jsx`, `temple-admin/index.html`.

**Rule:** If the design file exists in this plan, the implementation must inspect and extract it before coding. Do not infer the UI from memory or from the current smoke-test page.

---

## Non-goals / separation rules

1. **Agent Control Tower is separate.** It must not be the default UI of `@wat/web` for the temple product.
2. **Smoke-test shell is temporary.** The current simple menu/API smoke page is not the final design implementation.
3. **Do not mix products.** Temple management UI, Agent Control Tower UI, and platform/admin/public portal should be separated by route/scope.
4. **Do not copy prototype business logic blindly.** Use the design for UX/layout/flow, but keep backend data model, RLS, audit, permissions, and finance rules from the implemented API/specs.
5. **Do not claim “ตาม Design แล้ว” until visual + functional verification is complete.**

---

## Target route separation

Recommended route split:

- `/login` — temple login from design
- `/app/*` — temple internal console (`RoleShell`, sidebar/topbar, dashboard, donation, donor, receipt, ledger, reports, users, audit)
- `/platform/*` — Innovera/platform console if included in current scope
- `/public/*` — public ญาติโยม portal if included in current scope
- `/smoke` — optional dev-only smoke test shell, not the default product page

Default `/` should redirect to `/login` or `/app` depending on auth state.

---

## Task 0: Freeze current state and remove ambiguity

**Objective:** Make it explicit in code/docs that the current page is not final design UI.

**Files:**
- Modify: `apps/web/src/app.tsx`
- Modify/Create: `apps/web/src/smoke/SmokeShell.tsx`
- Modify: `docs/plans/design-ui-implementation-plan.md`

**Steps:**

1. Move the current smoke-test shell out of the root app into `apps/web/src/smoke/SmokeShell.tsx`.
2. Add a root app placeholder that routes to either design UI or `/smoke` only during development.
3. Ensure no Agent Control Tower text remains in the temple app default route.
4. Verify:
   ```bash
   pnpm --filter @wat/web typecheck
   pnpm --filter @wat/web test -- app
   pnpm --filter @wat/web build
   ```

---

## Task 1: Extract design structure from `_bootstrap.html`

**Objective:** Produce a source-backed UI map from the actual captured design.

**Files:**
- Read: `/Users/innovera/wat-management-system/artifacts/claude-design/temple-admin-index-from-save_files/_bootstrap.html`
- Create: `docs/product/design-ui-map.md`

**Steps:**

1. Extract component names, routes/states, menus, role-specific views, labels, and modal/drawer interactions.
2. Record what each screen needs from the API.
3. Mark every item as:
   - `implemented-api-ready`
   - `needs-api-adapter`
   - `future/out-of-scope`
4. Do not write UI code in this task.
5. Verify the map references actual design snippets/line ranges where possible.

---

## Task 2: Create design component foundation

**Objective:** Build reusable components matching the design language.

**Files:**
- Create: `apps/web/src/design-system/Button.tsx`
- Create: `apps/web/src/design-system/Badge.tsx`
- Create: `apps/web/src/design-system/Card.tsx`
- Create: `apps/web/src/design-system/Modal.tsx`
- Create: `apps/web/src/design-system/Drawer.tsx`
- Create: `apps/web/src/design-system/Toast.tsx`
- Create: `apps/web/src/design-system/SearchBox.tsx`
- Create/Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/design-system/*.test.tsx`

**Verification:**

```bash
pnpm --filter @wat/web typecheck
pnpm --filter @wat/web test -- design-system
pnpm --filter @wat/web build
```

---

## Task 3: Implement design shell and navigation

**Objective:** Port `RoleShell`, `Sidebar`, and `Topbar` from the design.

**Files:**
- Create: `apps/web/src/layout/RoleShell.tsx`
- Create: `apps/web/src/layout/Sidebar.tsx`
- Create: `apps/web/src/layout/Topbar.tsx`
- Create: `apps/web/src/routes.tsx` or equivalent simple router
- Test: `apps/web/src/layout/*.test.tsx`

**Acceptance criteria:**

- Thai labels match design inventory.
- Admin/finance/staff navigation differs by role where design requires it. (No `auditor` — it is not a product role; see design-ui-map §1 canonical access model: platform_owner / temple_owner / temple_user.)
- No Agent Control Tower text appears in temple routes.
- Default route is temple product, not smoke shell.

---

## Task 4: Implement auth screens from design

**Objective:** Port `LoginScreen` and `RegisterForm` UX from design and wire login to the existing API.

**Files:**
- Create: `apps/web/src/features/auth/LoginScreen.tsx`
- Create: `apps/web/src/features/auth/RegisterForm.tsx`
- Modify: `apps/web/src/lib/auth-client.ts`
- Test: `apps/web/src/features/auth/*.test.tsx`

**Acceptance criteria:**

- Login uses real `/auth/login` API.
- Token storage is explicit and safe for local dev.
- Registration screen can be UI-only if backend scope is not ready, but must label unavailable actions honestly.
- Thai copy follows design.

### Known gap: self-service registration + Google/Facebook sign-up

Current implementation only renders the design affordances for register / Google / Facebook as disabled "ยังไม่พร้อมใช้งาน" actions because there is no backend endpoint yet. Do **not** claim membership sign-up is complete until this gap is implemented and verified end-to-end.

Add a follow-up auth task before production readiness:

**Task 4b: Implement membership registration and social sign-up**

**Objective:** Make the design's สมัครสมาชิก, Google, and Facebook flows real instead of disabled placeholders.

**Scope:**

1. Product decision: define whether self-service sign-up creates a temple application, a tenant user invitation, or a public layperson/donor account.
2. Backend:
   - add explicit registration endpoint(s), validation, audit logging, rate limits, and duplicate-account handling;
   - add OAuth provider configuration for Google and Facebook;
   - implement callback/token exchange and account linking safely;
   - avoid auto-creating privileged tenant admin users without platform/temple-owner approval.
3. Frontend:
   - enable RegisterForm only after backend support exists;
   - make Google/Facebook buttons start the real OAuth flow;
   - show Thai error states for provider cancellation, duplicate email, missing approval, and rate-limit.
4. Tests/verification:
   - write failing tests first (TDD) for register availability, OAuth start URL, callback handling, duplicate email, disabled provider config, and role/tenant assignment;
   - run API + web tests, build, and browser smoke.

**Acceptance criteria:**

- `/auth/register` or the chosen registration/application endpoint exists and is tested.
- Google and Facebook sign-up/login are wired to real backend endpoints, not fake client-only buttons.
- New accounts receive the correct access group/tenant state and never bypass platform/temple approval rules.
- Disabled/unsupported states are honest if provider credentials are missing.
- End-to-end smoke proves a new user can complete the intended sign-up flow.

---

## Task 5: Port core temple screens and wire API

**Objective:** Replace temporary smoke cards with design-backed screens.

**Screens:**

1. Dashboard — `Dashboard`
2. Donation intake — `DonationIntake`
3. Donor profile/list — `DonorProfile`
4. Anumodana/receipt — `AnumodanaDoc`
5. Ledger / reconciliation / period close
6. Reports/export
7. Personnel
8. Ceremonies
9. Inventory
10. Users/permissions
11. Audit log, if in current MVP scope

**Acceptance criteria:**

- Each screen uses actual API endpoints where available.
- Any design-only/future action is either hidden or clearly marked not implemented.
- Role permissions are reflected in visible actions.
- Tenant isolation is not bypassed in frontend assumptions.

---

## Task 6: Visual comparison pass

**Objective:** Check the implemented UI against the design artifact/screenshots.

**Steps:**

1. Run web and API locally.
2. Capture screenshots of implemented screens.
3. Compare against Claude Design/source screenshots.
4. Create `docs/reviews/design-ui-visual-review.md` with:
   - matched screens
   - deviations
   - accepted deviations
   - required fixes
5. Fix critical visual/flow mismatches.

---

## Task 7: Full verification gate

**Objective:** Prove the design-backed UI is working, not just rendered.

Run:

```bash
pnpm -w typecheck
pnpm -w lint
pnpm -w test
pnpm -w build
pnpm --filter @wat/db rls:check
```

Browser smoke:

- Login admin วัดอรุณ
- Open dashboard
- Search donor
- Create/read donation if test data permits
- Preview/issue receipt if flow permits
- Check ledger/report screen
- Switch role to finance/staff and verify restricted actions
- Switch tenant account and verify tenant data changes

---

## Completion definition

The UI can be reported as “ตาม Design แล้ว” only when:

1. Design source/user-sent design files were inspected and referenced.
2. Root temple app no longer shows Agent Control Tower or temporary smoke page by default.
3. Core screens are ported from design components/flows.
4. API wiring works for MVP-1 screens.
5. Visual review doc exists and critical mismatches are fixed or explicitly accepted.
6. Verification gate passes with real command output.
