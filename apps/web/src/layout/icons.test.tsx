import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES } from "./icons";

describe("Icon — source-backed icons.jsx port (Task 6)", () => {
  it("wraps children in the design's shared svg attrs", () => {
    const html = renderToStaticMarkup(<Icon name="lotus" size={26} />);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke-width="1.75"');
    expect(html).toContain('width="26"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders the exact design geometry, not the interim stand-ins", () => {
    // dashboard is the design's 2x2 panel grid (4 rects), not a single path.
    const dashboard = renderToStaticMarkup(<Icon name="dashboard" />);
    expect((dashboard.match(/<rect/g) ?? []).length).toBe(4);

    // verbatim path data from the captured icons.jsx registry.
    expect(renderToStaticMarkup(<Icon name="donation" />)).toContain(
      "M12 21s-7-4.4-9.2-9A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z",
    );
    expect(renderToStaticMarkup(<Icon name="lotus" />)).toContain("M12 20c-4.4 0-8-2.6-8-6");
  });

  it("exposes the full 47-icon design set and every one renders", () => {
    expect(ICON_NAMES).toContain("dashboard");
    expect(ICON_NAMES.length).toBe(47);
    for (const name of ICON_NAMES) {
      expect(() => renderToStaticMarkup(<Icon name={name} />)).not.toThrow();
    }
  });
});
