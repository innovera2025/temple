import { ReactElement } from "react";
import { Badge } from "../design-system";
import { Icon } from "./icons";
import { PAGE_TITLES, PageId, ROLE_BADGE_KIND, TempleRole } from "./nav";

// Ported from shell.jsx Topbar: mobile menu button, temple > page breadcrumb,
// search box, and the role badge (colour per ROLE_BADGE_KIND).
export interface TopbarProps {
  page: PageId;
  role: TempleRole;
  roleName: string;
  onMenu: () => void;
}

export function Topbar({ page, role, roleName, onMenu }: TopbarProps): ReactElement {
  return (
    <div className="topbar">
      <button className="iconbtn menu-btn" type="button" aria-label="เมนู" onClick={onMenu}>
        <Icon name="menu" size={19} />
      </button>

      <div className="crumbs">
        <span>วัดธรรมสถิตวนาราม</span>
        <Icon name="chevR" size={13} />
        <b>{PAGE_TITLES[page]}</b>
      </div>

      <div className="tb-search">
        <Icon name="search" size={15} />
        <input type="search" placeholder="ค้นหาใบเสร็จ ผู้บริจาค รายการบัญชี..." aria-label="ค้นหา" />
      </div>

      <Badge kind={ROLE_BADGE_KIND[role]} dot>
        {roleName}
      </Badge>
    </div>
  );
}
