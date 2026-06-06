import { describe, expect, it } from "vitest";
import { validateTempleProfileUpdate } from "./temple-profile";

// A 1x1 transparent PNG embedded as a base64 data URL (what the client upload produces).
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("validateTempleProfileUpdate — logo", () => {
  it("accepts an http(s) logo link", () => {
    const result = validateTempleProfileUpdate({ logoUrl: "https://example.com/logo.png" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logoUrl).toBe("https://example.com/logo.png");
  });

  it("accepts an uploaded image embedded as a base64 data URL", () => {
    const result = validateTempleProfileUpdate({ logoUrl: PNG_DATA_URL });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logoUrl).toBe(PNG_DATA_URL);
  });

  it("rejects a value that is neither a URL nor an image data URL", () => {
    const result = validateTempleProfileUpdate({ logoUrl: "ไม่ใช่ลิงก์" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.field).toBe("logoUrl");
  });

  it("clears the logo when set to an empty string", () => {
    const result = validateTempleProfileUpdate({ logoUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logoUrl).toBeNull();
  });
});
