import { describe, expect, it } from "vitest";
import {
  ACCESS_GROUPS,
  ACCESS_GROUP_LABELS_TH,
  accessGroupForPlatformRole,
  accessGroupForTenantRole,
  isAccessGroup,
} from "./access-model";
import { PLATFORM_ROLES, TENANT_ROLES } from "./platform";

describe("canonical access model (platform_owner / temple_owner / temple_user)", () => {
  it("has exactly the three product access groups with Thai labels", () => {
    expect(ACCESS_GROUPS).toEqual(["platform_owner", "temple_owner", "temple_user"]);
    expect(ACCESS_GROUP_LABELS_TH.platform_owner).toBe("เจ้าของแพลตฟอร์ม");
    expect(ACCESS_GROUP_LABELS_TH.temple_owner).toBe("เจ้าของวัด");
    expect(ACCESS_GROUP_LABELS_TH.temple_user).toBe("คนใช้งานวัด");
  });

  it("never contains a phantom auditor group", () => {
    expect(ACCESS_GROUPS as readonly string[]).not.toContain("auditor");
    expect(isAccessGroup("auditor")).toBe(false);
  });

  it("maps every platform role to platform_owner", () => {
    for (const role of PLATFORM_ROLES) {
      expect(accessGroupForPlatformRole(role)).toBe("platform_owner");
    }
  });

  it("maps tenant admin to temple_owner and finance/staff to temple_user", () => {
    expect(accessGroupForTenantRole("admin")).toBe("temple_owner");
    expect(accessGroupForTenantRole("finance")).toBe("temple_user");
    expect(accessGroupForTenantRole("staff")).toBe("temple_user");
  });

  it("classifies every real tenant role into a temple-side group", () => {
    for (const role of TENANT_ROLES) {
      expect(["temple_owner", "temple_user"]).toContain(accessGroupForTenantRole(role));
    }
  });

  it("guards isAccessGroup", () => {
    expect(isAccessGroup("platform_owner")).toBe(true);
    expect(isAccessGroup("temple_user")).toBe(true);
    expect(isAccessGroup("nope")).toBe(false);
  });
});
