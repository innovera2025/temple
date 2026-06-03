import { ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { can as canForRole, PageId, ROLE_NAMES, TempleRole } from "./nav";

// Keep in sync with the `@media (max-width: 860px)` drawer breakpoint in styles.css.
const MOBILE_MAX_WIDTH = 860;
const SIDEBAR_ID = "app-sidebar";

// Ported from shell.jsx / admin-app.jsx RoleShell: sidebar + topbar + main, with a
// responsive hamburger drawer. On screens ≤860px the sidebar slides off-canvas and is
// toggled by the topbar hamburger button; on wider screens it is a static column.
// Nav visibility is driven by the design permission matrix (see nav.ts). Screen content
// is provided by the caller as children.
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
  const close = (): void => setOpen(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  // Drawer side effects (mobile): lock background scroll, make the page content inert
  // so Tab/AT can't reach it behind the backdrop, and manage focus — move it into the
  // drawer (close button) on open and restore it to the hamburger on close.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("drawer-open", open);
    if (mainRef.current) mainRef.current.inert = open;
    if (open) {
      closeButtonRef.current?.focus();
    } else if (wasOpen.current) {
      menuButtonRef.current?.focus();
    }
    wasOpen.current = open;
    return () => {
      document.body.classList.remove("drawer-open");
      if (mainRef.current) mainRef.current.inert = false;
    };
  }, [open]);

  // Close on Escape, and auto-close if the viewport grows back to desktop width
  // (so the drawer never gets stuck off-canvas after a rotate/resize).
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = (): void => {
      if (window.innerWidth > MOBILE_MAX_WIDTH) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="app">
      <Sidebar
        id={SIDEBAR_ID}
        closeButtonRef={closeButtonRef}
        page={page}
        role={role}
        goto={onNavigate}
        open={open}
        onClose={close}
        counts={counts}
        user={{ name: userName, roleName }}
        can={(id) => canForRole(role, id)}
        onLogout={onLogout}
      />
      {open ? <div className="backdrop" onClick={close} aria-hidden="true" /> : null}
      <div className="tb-main">
        <Topbar
          menuButtonRef={menuButtonRef}
          page={page}
          role={role}
          roleName={roleName}
          menuOpen={open}
          menuControls={SIDEBAR_ID}
          onMenu={() => setOpen((value) => !value)}
        />
        <main ref={mainRef} className="tb-content">
          {children}
        </main>
      </div>
    </div>
  );
}
