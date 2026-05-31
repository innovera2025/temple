import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TenantUser, UsersApi } from "./users";
import { UserForm, UsersPage, UsersTable } from "./users-view";

const user: TenantUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "staff@wat-arun.example",
  displayName: "เจ้าหน้าที่",
  role: "staff",
  isActive: true,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
};

describe("users view", () => {
  it("table renders name/email/role/status and a Thai empty state", () => {
    expect(renderToStaticMarkup(<UsersTable rows={[]} />)).toContain("ยังไม่มีผู้ใช้");
    const html = renderToStaticMarkup(<UsersTable rows={[user]} />);
    expect(html).toContain("เจ้าหน้าที่");
    expect(html).toContain("staff@wat-arun.example");
    expect(html).toContain("ใช้งาน");
  });

  it("create form lets email be edited; edit form locks email and shows the active toggle", () => {
    const common = {
      email: "x@wat-arun.example",
      draft: { displayName: "x", password: "" },
      role: "staff" as const,
      isActive: true,
      submitting: false,
      onChange: () => undefined,
      onEmailChange: () => undefined,
      onRoleChange: () => undefined,
      onActiveChange: () => undefined,
      onSubmit: () => undefined,
      onCancel: () => undefined,
    };
    const createHtml = renderToStaticMarkup(<UserForm {...common} mode="create" />);
    expect(createHtml).toContain("รหัสผ่าน");
    expect(createHtml).not.toContain("อีเมลแก้ไขไม่ได้");

    const editHtml = renderToStaticMarkup(<UserForm {...common} mode="edit" />);
    expect(editHtml).toContain("อีเมลแก้ไขไม่ได้");
    expect(editHtml).toContain("เปิดใช้งานบัญชี");
  });

  it("page shell renders the heading", () => {
    const api: UsersApi = {
      list: async () => [user],
      get: async () => user,
      create: async () => user,
      update: async () => user,
    };
    const html = renderToStaticMarkup(<UsersPage api={api} />);
    expect(html).toContain("ผู้ใช้และสิทธิ์");
    expect(html).toContain("เพิ่มผู้ใช้");
  });
});
