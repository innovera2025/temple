import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("renders the agent control tower shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Agent Control Tower");
    expect(html).toContain("ห้องควบคุมทีม AI");
    expect(html).toContain("Task 2 — DB schema + RLS");
  });

  it("shows delivery evidence and human decision inbox", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Command evidence");
    expect(html).toContain("Decision inbox");
    expect(html).toContain("เลขใบอนุโมทนา");
  });
});
