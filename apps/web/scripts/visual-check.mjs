/**
 * Optional headless browser visual check for the temple product shell (rev2 layout).
 *
 * NOT part of CI / vitest. It drives a real browser to verify the wider rev2 shell and
 * that the dashboard renders REAL API data with a clean console, at 1280px and 1600px.
 *
 * Prereqs (ad-hoc, not a project dependency):
 *   - dev servers running:  pnpm --filter @wat/api dev   and   pnpm --filter @wat/web dev
 *   - a Chromium-class browser (defaults to system Google Chrome on macOS; override with
 *     CHROME=/path/to/chrome)
 *   - playwright-core available, e.g. run from a scratch dir:
 *       mkdir -p /tmp/wat-visual && cd /tmp/wat-visual && npm i playwright-core
 *       WEB=http://localhost:5173 API=http://localhost:3000 \
 *         node /path/to/apps/web/scripts/visual-check.mjs
 *
 * Exits non-zero if any layout assertion fails or the console has errors.
 */
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WEB = process.env.WEB ?? "http://localhost:5173";
const API = process.env.API ?? "http://localhost:3000";
const EMAIL = process.env.SEED_EMAIL ?? "admin@wat-arun.example";
const PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

const login = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const { accessToken } = await login.json();
if (!accessToken) throw new Error("login failed — is the API running and seeded?");
const session = {
  accessToken,
  user: { email: EMAIL, displayName: "ผู้ดูแลวัดอรุณ", role: "admin", tenantId: "wat-arun" },
};

let failures = 0;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

for (const width of [1280, 1600]) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(WEB, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => localStorage.setItem("wat-session", JSON.stringify(s)), session);
  await page.goto(WEB, { waitUntil: "networkidle" });
  await page.waitForSelector("text=แดชบอร์ด", { timeout: 8000 });
  await page
    .waitForFunction(() => {
      const el = document.querySelector(".kpi .k-value");
      return el && el.textContent && el.textContent.trim() !== "…";
    }, { timeout: 8000 })
    .catch(() => {});

  const m = await page.evaluate(() => {
    const sb = document.querySelector(".sidebar");
    const cw = document.querySelector(".content-wrap");
    const tb = document.querySelector(".topbar");
    return {
      sidebarW: sb ? Math.round(sb.getBoundingClientRect().width) : null,
      topbarH: tb ? Math.round(tb.getBoundingClientRect().height) : null,
      contentMaxW: cw ? getComputedStyle(cw).maxWidth : null,
      kpiVals: Array.from(document.querySelectorAll(".kpi .k-value")).map((e) => e.textContent?.trim()),
      hasDemoTag: Array.from(document.querySelectorAll(".badge")).some((e) => e.textContent?.trim() === "ตัวอย่าง"),
      isSmoke: !!document.body.textContent?.includes("เมนูระบบวัด"),
      isControlTower: !!document.body.textContent?.includes("Agent Control Tower"),
    };
  });

  await page.screenshot({ path: `/tmp/wat-visual/dashboard-${width}.png`, fullPage: true });

  const checks = [
    ["sidebar width = 264px", m.sidebarW === 264],
    ["topbar height >= 62px", (m.topbarH ?? 0) >= 62],
    ["content-wrap max-width = 1760px", m.contentMaxW === "1760px"],
    ["KPI values rendered (not loading …)", m.kpiVals.length >= 4 && !m.kpiVals.includes("…")],
    ["demo sections tagged ตัวอย่าง", m.hasDemoTag],
    ["not the smoke shell", !m.isSmoke],
    ["not the Agent Control Tower", !m.isControlTower],
    ["no console errors", consoleErrors.length === 0],
  ];

  console.log(`\n=== viewport ${width}px ===`);
  console.log(`  sidebar=${m.sidebarW}px topbar=${m.topbarH}px content-wrap max-width=${m.contentMaxW}`);
  console.log(`  KPI values: ${JSON.stringify(m.kpiVals)}`);
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failures++;
  }
  if (consoleErrors.length) console.log("  console errors:", consoleErrors);
  await context.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "ALL VISUAL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
