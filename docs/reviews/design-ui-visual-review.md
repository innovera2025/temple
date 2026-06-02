# Design UI Visual Review — Task 6 (สาย design shell)

> Plan: `docs/plans/design-ui-implementation-plan.md` Task 6 (Visual comparison pass).
> Map: `docs/product/design-ui-map.md`. Source of truth: the captured Claude Design at
> `artifacts/claude-design/temple-admin-index-from-save_files/_bootstrap.html`
> (20,343 lines of Babel-transpiled JSX) + its referenced stylesheets `./ds.css` and `./css2`.

## Method (and its honest limit)

The plan's Task 6 asks for a screenshot-vs-screenshot comparison. Two inputs that a true
pixel diff needs were **not** captured in the saved artifact:

1. **`ds.css` — the design's own stylesheet — is missing.** `_bootstrap.html` links it
   (`<link rel="stylesheet" href="./ds.css">`, line 13) but only `css2` (Google Fonts) and
   `index-CO1gdLWv.css` (the Claude editor chrome, *not* the temple app CSS) were saved.
   So the canonical values of the design's CSS custom properties (`--ink-2`, `--border`,
   tints, radii) and the real `.auth`/`.field`/`.sb-*`/`.tb-*` rules cannot be read back.
2. **No exported screenshots of the rendered design** accompany the capture.

Therefore this pass is a **source-backed fidelity review** against the transpiled JSX +
the verified token swatch (design-ui-map §4.2), not a rendered-pixel diff. Where the source
is authoritative (component structure, copy, icon geometry, the 8 verified hexes) we match
exactly. Where it is missing (`ds.css` tints/borders/inks) we mark the value **reconstructed**
and keep it as an *accepted deviation* until `ds.css` is provided.

## Matched screens (structure + Thai copy verified against source)

| Screen | Source (in `_bootstrap.html`) | Implementation | Status |
| --- | --- | --- | --- |
| LoginScreen | `LoginScreen` (admin-app.jsx ~14600) | `features/auth/login-view.tsx` | ✅ brand art + auth-card, tabs, email/password, highlights, copy verbatim |
| RegisterForm | `RegisterForm` (~14229) | `features/auth/register-view.tsx` | ✅ structure preserved, honestly disabled (no `/auth/register`) |
| SocialButtons | `SocialButtons` (~14175) | inside `login-view.tsx` | ✅ Google/Facebook present, disabled (no OAuth backend) |
| RoleShell / Sidebar / Topbar | shell.jsx NAV (4 groups / 11 items) | `layout/RoleShell.tsx`, `Sidebar.tsx`, `Topbar.tsx` | ✅ Task 3 |
| Design-system (Btn/Badge/Card) | ds-screen.jsx | `design-system/*` | ✅ Task 2 |
| Icon set (`icons.jsx`) | `I` registry (line 36, 47 icons) | `layout/icons.tsx` | ✅ **this task** — full verbatim port |

## Changes made in this task

- **Full `icons.jsx` port.** Replaced the interim "tasteful stand-in" line icons with the
  47 real icons extracted verbatim from the design's `I` registry (exact child `rect`/
  `circle`/`path` geometry; the design's shared svg attrs — viewBox `0 0 24 24`, stroke
  `1.75`, round caps/joins — already matched our `<Icon>` wrapper). All 18 previously-used
  icon names map 1:1 onto design names, so no consumer changed. The other 29 (plus, check,
  x, edit, trash, download, upload, print, calendar2, user, bell, eye, file, lock, external,
  chevL/D, arrowR/Up, filter, sort, dots, …) are now available for later feature work.
  Locked in by `layout/icons.test.tsx` (geometry + 47-icon completeness).

## Deviations

### Accepted (source not available — documented, low risk)

- **Reconstructed color tints / borders / secondary inks.** `--ink-2`, `--ink-3`,
  `--surface-2/3`, `--border`, `--neutral`, `--void`, the `*-tint` colors, and the radii in
  `styles.css` are reasoned approximations (noted inline there and as map open-question #10),
  because `ds.css` was not captured. The **8 core hexes ARE verified** against the design
  swatch (design-ui-map §4.2): `--accent #a4691b`, `--paper #f4f2ec`, `--surface #fff`,
  `--ink #1d1a16`, `--credit #2f6b4d`, `--debit #b0492f`, `--pending #976611`,
  `--reconciled #3a627c`.
- **Auth-screen CSS authored, not ported.** `.auth*`, `.field`, `.control`, `.opt-row`,
  etc. were hand-authored to the design's class taxonomy and structure (the rules live in
  `ds.css`, missing). Layout/structure/copy match; exact paddings/shadows are approximations.
- **Login demo quick-pick.** The design's "เข้าใช้งานตามบทบาท (สาธิต)" one-click role login
  is preserved as a clearly-labelled "บัญชีตัวอย่าง (เดโม)" section that performs a **real**
  `/auth/login` with the dev seed accounts — honest, not a mock.

### Required fixes (tracked, not blocking this task)

1. **Obtain `ds.css`** (or a screenshot set) to verify/correct the reconstructed tints,
   borders, inks, paddings and shadows, and close map open-question #10. Until then the
   approximations stand.
2. **Pixel/interaction diff** of the running app vs the design (Task 7 browser smoke covers
   the functional half: login → dashboard → donor search → ledger → role/tenant switch).

## Verification

`pnpm --filter @wat/web typecheck | lint | test | build` — all green (see the Task 6 commit
message for the captured output). The icon port + auth screens are exercised by
`layout/icons.test.tsx`, `layout/layout.test.tsx`, `features/auth/*.test.tsx`, and
`app.test.tsx`.

## Update — 2026-06-02: real `ds.css` now available (rev2)

The user provided the design's own `ds.css` in the rev2 export
(`artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/ds.css`),
so the "ds.css was not captured" limitation above is **partially resolved**. The rev2 vs
rev1 `ds.css` diff is purely a **wider-shell layout pass**, now ported VERBATIM into
`apps/web/src/styles.css` and locked by `apps/web/src/styles-rev2.test.ts`:

- Layout tokens: `--sidebar-w 256→264px`, `--topbar-h 60→62px`, `--maxw 1240→1760px`;
  added the `--shadow-sm/md/lg` scale. `.sidebar`/`.topbar` now consume the tokens
  (no more hard-coded `248px`); `.content-wrap` gets `width: 100%`.
- Responsive content gutters on the scroll container at 1280 / 1600 / 1920px.
- `.page-head` eyebrow → uppercase + a 16×2px accent line (`::before`); roomier `desc`
  and responsive `h1` (27px @1280, 30px @1600).
- `.kpi` flat-until-hover (border + `--shadow-sm` lift), larger value (28px, 32px @1600);
  clickable `button.card` lift on hover (`--shadow-md`, translateY).

Token reconciliation is now **done** (commit `feat: reconcile design tokens to rev2 ds.css
:root`): the reconstructed tints/borders/inks were replaced with the design's exact hexes
and the rev2 radius scale.

## Update — 2026-06-02: real headless browser pass (Playwright + system Chrome)

Ran `apps/web/scripts/visual-check.mjs` (playwright-core driving system Google Chrome,
headless) against the live dev servers, logged in with a real seed token, at **1280px and
1600px**. Both viewports — ALL CHECKS PASSED:

- `.sidebar` computed width = **264px**, `.topbar` height = **62px**, `.content-wrap`
  max-width = **1760px** (rev2 wider shell confirmed in a real browser).
- Dashboard KPIs render **real `/dashboard` data** (e.g. `฿623.45` from the seeded DB, not
  the demo `฿96,000`) — not the loading "…" state.
- Demo-only cards are tagged **ตัวอย่าง**; the page is the temple product (NOT the smoke
  shell, NOT the Agent Control Tower).
- **Zero console errors** (a benign `/favicon.ico` 404 was fixed by adding an inline lotus
  favicon to `index.html`).

Screenshots: `/tmp/wat-visual/dashboard-{1280,1600}.png`. The script is optional/manual
(not in CI; needs an ad-hoc `playwright-core` + a Chromium-class browser).
