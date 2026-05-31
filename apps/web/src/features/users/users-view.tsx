import { useEffect, useState, type ReactElement } from "react";
import {
  createUsersApiClient,
  roleLabel,
  ROLE_OPTIONS,
  type CreateUserInput,
  type TenantRole,
  type TenantUser,
  type UpdateUserInput,
  type UsersApi,
  type UserFilters,
} from "./users";

export { createUsersApiClient };

export function UsersTable({
  rows,
  onSelect,
}: {
  rows: TenantUser[];
  onSelect?: (user: TenantUser) => void;
}): ReactElement {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        ยังไม่มีผู้ใช้
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">ชื่อ</th>
          <th className="py-2 pr-3">อีเมล</th>
          <th className="py-2 pr-3">สิทธิ์</th>
          <th className="py-2 pr-3">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((user) => (
          <tr
            key={user.id}
            className="cursor-pointer border-b border-stone-100 text-stone-800 hover:bg-stone-50"
            onClick={() => onSelect?.(user)}
          >
            <td className="py-2 pr-3">{user.displayName}</td>
            <td className="py-2 pr-3 text-stone-600">{user.email}</td>
            <td className="py-2 pr-3">{roleLabel(user.role)}</td>
            <td className="py-2 pr-3">
              <span className={user.isActive ? "text-emerald-700" : "text-stone-400"}>
                {user.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UserForm({
  mode,
  email,
  draft,
  role,
  isActive,
  submitting,
  onChange,
  onEmailChange,
  onRoleChange,
  onActiveChange,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  email: string;
  draft: { displayName: string; password: string };
  role: TenantRole;
  isActive: boolean;
  submitting: boolean;
  onChange: (key: "displayName" | "password", value: string) => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (role: TenantRole) => void;
  onActiveChange: (active: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">อีเมล</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2 disabled:bg-stone-100 disabled:text-stone-500"
          type="email"
          value={email}
          disabled={mode === "edit"}
          onChange={(event) => onEmailChange(event.target.value)}
        />
        {mode === "edit" ? <span className="text-xs text-stone-400">อีเมลแก้ไขไม่ได้</span> : null}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ชื่อที่แสดง</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={draft.displayName}
          onChange={(event) => onChange("displayName", event.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">สิทธิ์</span>
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
            value={role}
            onChange={(event) => onRoleChange(event.target.value as TenantRole)}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {mode === "edit" ? (
          <label className="flex items-center gap-2 text-sm sm:mt-6">
            <input type="checkbox" checked={isActive} onChange={(event) => onActiveChange(event.target.checked)} />
            <span className="font-medium text-stone-700">เปิดใช้งานบัญชี</span>
          </label>
        ) : null}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">รหัสผ่าน</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="password"
          placeholder={mode === "edit" ? "เว้นว่างถ้าไม่เปลี่ยน" : "อย่างน้อย 8 ตัวอักษร"}
          value={draft.password}
          onChange={(event) => onChange("password", event.target.value)}
        />
      </label>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

type Mode = { kind: "list" } | { kind: "create" } | { kind: "edit"; user: TenantUser };

/** Stateful admin page: list + manage tenant users. */
export function UsersPage({ api }: { api: UsersApi }): ReactElement {
  const [rows, setRows] = useState<TenantUser[]>([]);
  const [filters, setFilters] = useState<UserFilters>({});
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState<{ displayName: string; password: string }>({ displayName: "", password: "" });
  const [role, setRole] = useState<TenantRole>("staff");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = (next: UserFilters): void => {
    api
      .list(next)
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  };

  useEffect(() => {
    reload(filters);
  }, [api]);

  const startCreate = (): void => {
    setEmail("");
    setDraft({ displayName: "", password: "" });
    setRole("staff");
    setIsActive(true);
    setError(null);
    setMode({ kind: "create" });
  };

  const startEdit = (user: TenantUser): void => {
    setEmail(user.email);
    setDraft({ displayName: user.displayName, password: "" });
    setRole(user.role);
    setIsActive(user.isActive);
    setError(null);
    setMode({ kind: "edit", user });
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode.kind === "create") {
        const payload: CreateUserInput = { email, displayName: draft.displayName, role, password: draft.password };
        await api.create(payload);
      } else if (mode.kind === "edit") {
        const patch: UpdateUserInput = { displayName: draft.displayName, role, isActive };
        if (draft.password.trim() !== "") patch.password = draft.password;
        await api.update(mode.user.id, patch);
      }
      setMode({ kind: "list" });
      reload(filters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">ผู้ใช้และสิทธิ์</h1>
          <p className="mt-1 text-sm text-stone-600">จัดการผู้ใช้ในวัด เพิ่ม/แก้ไขสิทธิ์ และปิดการใช้งาน</p>
        </div>
        {mode.kind === "list" ? (
          <button
            type="button"
            onClick={startCreate}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white"
          >
            เพิ่มผู้ใช้
          </button>
        ) : null}
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {mode.kind === "list" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2" aria-label="ตัวกรอง">
            <select
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={filters.role ?? ""}
              onChange={(event) => {
                const next = { ...filters, role: (event.target.value || undefined) as TenantRole | undefined };
                setFilters(next);
                reload(next);
              }}
            >
              <option value="">ทุกสิทธิ์</option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="ค้นหาชื่อ/อีเมล"
              value={filters.q ?? ""}
              onChange={(event) => {
                const next = { ...filters, q: event.target.value || undefined };
                setFilters(next);
                reload(next);
              }}
            />
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <UsersTable rows={rows} onSelect={startEdit} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">
            {mode.kind === "create" ? "เพิ่มผู้ใช้" : "แก้ไขผู้ใช้"}
          </h2>
          <UserForm
            mode={mode.kind}
            email={email}
            draft={draft}
            role={role}
            isActive={isActive}
            submitting={submitting}
            onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
            onEmailChange={setEmail}
            onRoleChange={setRole}
            onActiveChange={setIsActive}
            onSubmit={submit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}
    </section>
  );
}
