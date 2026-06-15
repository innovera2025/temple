import { ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "../../design-system";
import { Icon, IconName } from "../../layout/icons";

// The platform-owner (Innovera / เจ้าของแพลตฟอร์ม) console shell — the SAME design language as
// the staff RoleShell + devotee shell (sidebar + topbar + responsive drawer, reusing
// .app/.sidebar/.topbar CSS) with a platform-specific grouped nav and Innovera branding.
// Keep in sync with the `@media (max-width: 860px)` drawer breakpoint in styles.css.
const MOBILE_MAX_WIDTH = 860;
const SIDEBAR_ID = "platform-sidebar";

export type PlatformPage = "dashboard" | "applications" | "temples" | "tenant-users" | "platform-users" | "break-glass";

interface PlatformNavItem {
  id: PlatformPage;
  label: string;
  icon: IconName;
}
interface PlatformNavGroup {
  group: string;
  items: PlatformNavItem[];
}

const NAV: PlatformNavGroup[] = [
  { group: "ภาพรวม", items: [{ id: "dashboard", label: "แดชบอร์ด", icon: "dashboard" }] },
  { group: "งานอนุมัติ", items: [{ id: "applications", label: "ใบสมัครวัด", icon: "file" }] },
  {
    group: "จัดการ",
    items: [
      { id: "temples", label: "จัดการวัด", icon: "building" },
      { id: "tenant-users", label: "ผู้ใช้วัด", icon: "donors" },
      { id: "platform-users", label: "ผู้ใช้แพลตฟอร์ม", icon: "roles" },
    ],
  },
  { group: "เครื่องมือ", items: [{ id: "break-glass", label: "เข้าถึงข้อมูลวัด", icon: "lock" }] },
];

export const PLATFORM_PAGE_TITLES: Record<PlatformPage, string> = {
  dashboard: "แดชบอร์ด",
  applications: "ใบสมัครวัด",
  temples: "จัดการวัด",
  "tenant-users": "ผู้ใช้วัดทั้งหมด",
  "platform-users": "ผู้ใช้แพลตฟอร์ม",
  "break-glass": "เข้าถึงข้อมูลวัด (break-glass)",
};

function avatarInitial(name: string): string {
  return (name || "ผู้ดูแล").charAt(0).toUpperCase();
}

export interface PlatformShellProps {
  userName: string;
  roleLabel: string;
  page: PlatformPage;
  onNavigate: (id: PlatformPage) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function PlatformShell({ userName, roleLabel, page, onNavigate, onLogout, children }: PlatformShellProps): ReactElement {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

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
            <div className="name">Innovera</div>
            <div className="sub">ระบบเจ้าของแพลตฟอร์ม</div>
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
            <div className="sb-foot-role">{roleLabel}</div>
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
            <span>Innovera</span>
            <Icon name="chevR" size={13} />
            <b>{PLATFORM_PAGE_TITLES[page]}</b>
          </div>

          <div style={{ marginLeft: "auto" }} />
          <Badge kind="accent" dot>
            {roleLabel}
          </Badge>
        </div>

        <main ref={mainRef} className="tb-content">
          {children}
        </main>
      </div>
    </div>
  );
}
