import { ReactElement, type Ref } from "react";
import { Badge } from "../design-system";
import { Icon } from "./icons";
import { PAGE_TITLES, PageId, ROLE_BADGE_KIND, TempleRole } from "./nav";

// Ported from shell.jsx Topbar: responsive hamburger button (visible ≤860px),
// temple > page breadcrumb, search box, and the role badge (colour per ROLE_BADGE_KIND).
export interface TopbarProps {
  page: PageId;
  role: TempleRole;
  roleName: string;
  /** Whether the mobile drawer is currently open (drives the hamburger aria state). */
  menuOpen?: boolean;
  /** id of the sidebar element the hamburger controls (for aria-controls). */
  menuControls?: string;
  /** ref to the hamburger so focus can be restored to it when the drawer closes. */
  menuButtonRef?: Ref<HTMLButtonElement>;
  onMenu: () => void;
  /** The signed-in tenant's temple name (breadcrumb root). */
  templeName?: string;
}

export function Topbar({ page, role, roleName, menuOpen = false, menuControls, menuButtonRef, onMenu, templeName }: TopbarProps): ReactElement {
  return (
    <div className="topbar">
      <button
        ref={menuButtonRef}
        className="iconbtn menu-btn"
        type="button"
        aria-label={menuOpen ? "ปิดเมนู" : "เปิดเมนู"}
        aria-expanded={menuOpen}
        aria-controls={menuControls}
        onClick={onMenu}
      >
        <Icon name="menu" size={19} />
      </button>

      <div className="crumbs">
        <span>{templeName ?? "ระบบจัดการวัด"}</span>
        <Icon name="chevR" size={13} />
        <b>{PAGE_TITLES[page]}</b>
      </div>

      {/* The global search box was decorative (no behavior) — removed until a
          real cross-entity search exists; each table has its own working search. */}
      <div style={{ flex: 1 }} />

      <Badge kind={ROLE_BADGE_KIND[role]} dot>
        {roleName}
      </Badge>
    </div>
  );
}
