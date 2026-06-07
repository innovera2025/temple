import { ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "../../design-system";
import { Icon, IconName } from "../../layout/icons";

// The devotee (ญาติโยม) portal shell — the SAME design language as the staff back-office
// RoleShell (sidebar + topbar + responsive hamburger drawer, reusing .app/.sidebar/.topbar
// CSS), but with a devotee-specific grouped nav ("ทำบุญ" / "ของฉัน") and devotee branding.
// Keep in sync with the `@media (max-width: 860px)` drawer breakpoint in styles.css.
const MOBILE_MAX_WIDTH = 860;
const SIDEBAR_ID = "devotee-sidebar";

export type DevoteePage = "picker" | "donations" | "receipts" | "ceremonies" | "loans" | "account";

interface DevoteeNavItem {
  id: DevoteePage;
  label: string;
  icon: IconName;
}
interface DevoteeNavGroup {
  group: string;
  items: DevoteeNavItem[];
}

const NAV: DevoteeNavGroup[] = [
  { group: "ทำบุญ", items: [{ id: "picker", label: "เลือกวัด", icon: "building" }] },
  {
    group: "ของฉัน",
    items: [
      { id: "donations", label: "การบริจาค", icon: "donation" },
      { id: "receipts", label: "ใบอนุโมทนา", icon: "receipt" },
      { id: "ceremonies", label: "การจองพิธี", icon: "event" },
      { id: "loans", label: "การยืมของ", icon: "box" },
      { id: "account", label: "บัญชีของฉัน", icon: "user" },
    ],
  },
];

export const DEVOTEE_PAGE_TITLES: Record<DevoteePage, string> = {
  picker: "เลือกวัด",
  donations: "การบริจาคของฉัน",
  receipts: "ใบอนุโมทนาของฉัน",
  ceremonies: "การจองพิธีของฉัน",
  loans: "การยืมของวัด",
  account: "บัญชีของฉัน",
};

function avatarInitial(name: string): string {
  return (name || "ญาติโยม").replace(/^(นาย|นางสาว|นาง|พระ)\s?/, "").charAt(0);
}

export interface DevoteeShellProps {
  userName: string;
  page: DevoteePage;
  /** The trailing breadcrumb text (page title, or the selected temple's name). */
  crumb: string;
  onNavigate: (id: DevoteePage) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function DevoteeShell({ userName, page, crumb, onNavigate, onLogout, children }: DevoteeShellProps): ReactElement {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  // Drawer side effects (mobile): lock background scroll, make the page content inert so
  // Tab/AT can't reach it behind the backdrop, and manage focus — into the drawer on open,
  // back to the hamburger on close. Mirrors the staff RoleShell.
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

  // Close on Escape; auto-close if the viewport grows back to desktop width.
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
      <aside id={SIDEBAR_ID} className={`sidebar ${open ? "open" : ""}`.trim()} aria-label="เมนูนำทาง">
        <div className="sb-brand">
          <div className="sb-seal">
            <Icon name="lotus" size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="name">ร่วมบุญออนไลน์</div>
            <div className="sub">สำหรับญาติโยม</div>
          </div>
          <button ref={closeButtonRef} type="button" className="iconbtn sb-close" aria-label="ปิดเมนู" onClick={close}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="sb-nav">
          {NAV.map((group) => (
            <div className="sb-group" key={group.group}>
              <div className="sb-group-label">{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`sb-item ${page === item.id ? "active" : ""}`.trim()}
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={() => {
                    onNavigate(item.id);
                    close();
                  }}
                >
                  <Icon name={item.icon} className="ico" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="av round">{avatarInitial(userName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sb-foot-name">{userName}</div>
            <div className="sb-foot-role">ญาติโยม</div>
          </div>
          <button className="iconbtn" type="button" title="ออกจากระบบ" aria-label="ออกจากระบบ" onClick={onLogout}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      {open ? <div className="backdrop" onClick={close} aria-hidden="true" /> : null}

      <div className="tb-main">
        <div className="topbar">
          <button
            ref={menuButtonRef}
            className="iconbtn menu-btn"
            type="button"
            aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={open}
            aria-controls={SIDEBAR_ID}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="menu" size={19} />
          </button>

          <div className="crumbs">
            <span>ร่วมบุญออนไลน์</span>
            <Icon name="chevR" size={13} />
            <b>{crumb}</b>
          </div>

          <div style={{ marginLeft: "auto" }} />
          <Badge kind="accent" dot>
            ญาติโยม
          </Badge>
        </div>

        <main ref={mainRef} className="tb-content">
          {children}
        </main>
      </div>
    </div>
  );
}
