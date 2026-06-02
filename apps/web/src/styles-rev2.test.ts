import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Lock the rev2 design layout/token port (ds.css 2026-06-02-rev2 -> styles.css). These
// guard the WIDER shell (sidebar/topbar/maxw), the responsive content gutters, the
// page-head eyebrow accent line, and the KPI/card hover treatments so a later edit can't
// silently revert to the narrower rev1 layout. Source of truth:
// artifacts/user-provided/ระบบจัดการวัด-2026-06-02-rev2/extracted/temple-admin/ds.css
// vitest runs with cwd = apps/web (the @wat/web workspace).
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

describe("rev2 design layout tokens (ds.css 2026-06-02-rev2)", () => {
  it("defines the wider shell layout tokens", () => {
    expect(css).toContain("--sidebar-w: 264px");
    expect(css).toContain("--topbar-h: 62px");
    expect(css).toContain("--maxw: 1760px");
  });

  it("defines the rev2 shadow scale used by hover treatments", () => {
    expect(css).toContain("--shadow-sm:");
    expect(css).toContain("--shadow-md:");
  });

  it("wires the shell to the layout tokens (not the old hard-coded widths)", () => {
    expect(css).toContain("width: var(--sidebar-w)");
    expect(css).toContain("min-height: var(--topbar-h)");
    expect(css).not.toContain("width: 248px");
    expect(css).toContain(".content-wrap { max-width: var(--maxw, 1240px); margin: 0 auto; width: 100%; }");
  });

  it("adds the responsive content gutters that fill wide viewports", () => {
    expect(css).toContain("@media (min-width: 1280px)");
    expect(css).toContain("padding: 30px 36px");
    expect(css).toContain("padding: 36px 48px");
    expect(css).toContain("padding: 40px 64px");
  });

  it("gives the page header the rev2 eyebrow accent line + roomier sizing", () => {
    expect(css).toContain(".page-head .eyebrow::before");
    expect(css).toContain("text-transform: uppercase");
    expect(css).toContain(".page-head h1 { font-size: 30px; }");
  });

  it("applies the rev2 KPI + clickable-card hover lift", () => {
    expect(css).toContain(".kpi:hover");
    expect(css).toContain("font-size: 28px"); // KPI value
    expect(css).toContain("button.card:hover");
  });
});

describe("rev2 :root tokens reconciled to ds.css (exact hexes, not reconstructed rgba)", () => {
  it("uses the design's exact secondary inks / surfaces / borders", () => {
    expect(css).toContain("--ink-2: #5b5448");
    expect(css).toContain("--ink-3: #8a8275");
    expect(css).toContain("--surface-2: #faf9f5");
    expect(css).toContain("--border: #e5e0d6");
    // no leftover reconstructed rgba ink/border approximations
    expect(css).not.toContain("rgba(29, 26, 22, 0.64)");
    expect(css).not.toContain("rgba(29, 26, 22, 0.12)");
  });

  it("uses the design's warm tint hexes", () => {
    expect(css).toContain("--accent-tint: #f3e7d2");
    expect(css).toContain("--credit-tint: #e6efe8");
    expect(css).toContain("--debit-tint: #f6e7e1");
  });

  it("uses the rev2 radius scale (7px base, not the old 4px)", () => {
    expect(css).toContain("--r: 7px");
    expect(css).toContain("--r-sm: 5px");
    expect(css).toContain("--r-lg: 9px");
  });
});
