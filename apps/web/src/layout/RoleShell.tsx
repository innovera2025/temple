import { ReactElement, ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { can as canForRole, PageId, ROLE_NAMES, TempleRole } from "./nav";

// Ported from shell.jsx / admin-app.jsx RoleShell: sidebar + topbar + main, with a
// mobile drawer toggle. Nav visibility is driven by the design permission matrix
// (see nav.ts). Screen content is provided by the caller as children.
export interface RoleShellProps {
  userName: string;
  role: TempleRole;
  page: PageId;
  onNavigate: (id: PageId) => void;
  onLogout: () => void;
  counts?: Partial<Record<PageId, number>>;
  children: ReactNode;
}

export function RoleShell({
  userName,
  role,
  page,
  onNavigate,
  onLogout,
  counts,
  children,
}: RoleShellProps): ReactElement {
  const [open, setOpen] = useState(false);
  const roleName = ROLE_NAMES[role];

  return (
    <div className="app">
      <Sidebar
        page={page}
        role={role}
        goto={onNavigate}
        open={open}
        onClose={() => setOpen(false)}
        counts={counts}
        user={{ name: userName, roleName }}
        can={(id) => canForRole(role, id)}
        onLogout={onLogout}
      />
      {open ? <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <div className="tb-main">
        <Topbar page={page} role={role} roleName={roleName} onMenu={() => setOpen((value) => !value)} />
        <main className="tb-content">{children}</main>
      </div>
    </div>
  );
}
