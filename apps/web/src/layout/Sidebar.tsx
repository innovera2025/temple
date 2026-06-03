import { ReactElement, type Ref } from "react";
import { Icon, IconName } from "./icons";
import { EXTRA_NAV, NAV, PageId, TempleRole } from "./nav";

// Ported from shell.jsx Sidebar: brand seal + name, nav groups filtered by `can`,
// footer with the signed-in user + logout.
export interface SidebarUser {
  name: string;
  roleName: string;
}

export interface SidebarProps {
  /** Element id so the topbar hamburger can reference it via aria-controls. */
  id?: string;
  /** ref to the in-drawer close button so focus can be moved into the drawer on open. */
  closeButtonRef?: Ref<HTMLButtonElement>;
  page: PageId;
  goto: (id: PageId) => void;
  open?: boolean;
  onClose?: () => void;
  counts?: Partial<Record<PageId, number>>;
  user: SidebarUser;
  role: TempleRole;
  can: (id: PageId) => boolean;
  onLogout: () => void;
}

function avatarInitial(name: string): string {
  return (name || "ผู้ใช้").replace(/^(นาย|นางสาว|นาง|พระ)\s?/, "").charAt(0);
}

export function Sidebar({ id, closeButtonRef, page, goto, open, onClose, counts, user, can, onLogout }: SidebarProps): ReactElement {
  return (
    <aside id={id} className={`sidebar ${open ? "open" : ""}`.trim()} aria-label="เมนูนำทาง">
      <div className="sb-brand">
        <div className="sb-seal">
          <Icon name="lotus" size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="name">วัดธรรมสถิตวนาราม</div>
          <div className="sub">ระบบบริหารจัดการวัด</div>
        </div>
        <button ref={closeButtonRef} type="button" className="iconbtn sb-close" aria-label="ปิดเมนู" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <nav className="sb-nav">
        {[...NAV, ...EXTRA_NAV].map((group) => {
          const items = group.items.filter((item) => can(item.id));
          if (!items.length) return null;
          return (
            <div className="sb-group" key={group.group}>
              <div className="sb-group-label">{group.group}</div>
              {items.map((item) => {
                const count = counts?.[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sb-item ${page === item.id ? "active" : ""}`.trim()}
                    aria-current={page === item.id ? "page" : undefined}
                    onClick={() => {
                      goto(item.id);
                      onClose?.();
                    }}
                  >
                    <Icon name={item.icon as IconName} className="ico" />
                    <span>{item.label}</span>
                    {count ? <span className="count tnum">{count}</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sb-foot">
        <div className="av round">{avatarInitial(user.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sb-foot-name">{user.name}</div>
          <div className="sb-foot-role">{user.roleName}</div>
        </div>
        <button className="iconbtn" type="button" title="ออกจากระบบ" aria-label="ออกจากระบบ" onClick={onLogout}>
          <Icon name="logout" size={16} />
        </button>
      </div>
    </aside>
  );
}
