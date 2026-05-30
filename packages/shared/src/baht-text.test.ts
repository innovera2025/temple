import { describe, expect, it } from "vitest";
import { bahtText } from "./baht-text";

describe("bahtText", () => {
  it("reads zero and whole baht", () => {
    expect(bahtText(0)).toBe("ศูนย์บาทถ้วน");
    expect(bahtText(100)).toBe("หนึ่งบาทถ้วน");
    expect(bahtText(2500)).toBe("ยี่สิบห้าบาทถ้วน");
  });

  it("reads satang", () => {
    expect(bahtText(50)).toBe("ห้าสิบสตางค์");
    expect(bahtText(1)).toBe("หนึ่งสตางค์");
    expect(bahtText(2550)).toBe("ยี่สิบห้าบาทห้าสิบสตางค์");
    expect(bahtText(100075)).toBe("หนึ่งพันบาทเจ็ดสิบห้าสตางค์");
  });

  it("uses เอ็ด for a trailing 1 after a higher digit", () => {
    expect(bahtText(1100)).toBe("สิบเอ็ดบาทถ้วน"); // 11.00
    expect(bahtText(2100)).toBe("ยี่สิบเอ็ดบาทถ้วน"); // 21.00
    expect(bahtText(10100)).toBe("หนึ่งร้อยเอ็ดบาทถ้วน"); // 101.00
  });

  it("reads hundreds/thousands/etc with leading หนึ่ง", () => {
    expect(bahtText(10000)).toBe("หนึ่งร้อยบาทถ้วน"); // 100
    expect(bahtText(100000)).toBe("หนึ่งพันบาทถ้วน"); // 1,000
    expect(bahtText(1234500)).toBe("หนึ่งหมื่นสองพันสามร้อยสี่สิบห้าบาทถ้วน"); // 12,345
  });

  it("reads millions including ล้าน cycling and เอ็ด across the million boundary", () => {
    expect(bahtText(100000000)).toBe("หนึ่งล้านบาทถ้วน"); // 1,000,000
    expect(bahtText(150000000)).toBe("หนึ่งล้านห้าแสนบาทถ้วน"); // 1,500,000
    expect(bahtText(100000100)).toBe("หนึ่งล้านเอ็ดบาทถ้วน"); // 1,000,001
  });

  it("accepts bigint satang", () => {
    expect(bahtText(50000n)).toBe("ห้าร้อยบาทถ้วน"); // 500.00
  });
});
