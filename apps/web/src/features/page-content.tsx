import { ReactElement } from "react";
import { Badge, Card } from "../design-system";
import { PageId, permOf, TempleRole } from "../layout/nav";
import { createTempleApiClient } from "./temple/temple";
import { TempleProfilePage } from "./temple/temple-view";
import { createInventoryApiClient } from "./inventory/inventory";
import { InventoryPage } from "./inventory/inventory-view";
import {
  DesignAudit,
  DesignDashboard,
  DesignDonations,
  DesignDonors,
  DesignEvents,
  DesignLedger,
  DesignPeople,
  DesignReceipt,
  DesignReports,
  DesignRoles,
  DesignSystemShowcase,
} from "./design-backed-pages";

export interface PageContentProps {
  page: PageId;
  baseUrl: string;
  getToken: () => string | null;
  role: TempleRole;
  /** Today's date (YYYY-MM-DD) for views that default forms/queries to it. */
  today: string;
  onNavigate?: (page: PageId) => void;
}

// Honest placeholder for design pages that have no backend yet.
function UnavailablePage({ title, reason }: { title: string; reason: string }): ReactElement {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>{title}</h1>
      <Card pad>
        <Badge kind="void">ยังไม่พร้อมใช้งาน</Badge>
        <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>{reason}</p>
      </Card>
    </div>
  );
}

export function PageContent({ page, baseUrl, getToken, role, onNavigate }: PageContentProps): ReactElement {
  const opts = { baseUrl, getToken };
  const writable = (id: PageId): boolean => {
    const level = permOf(role, id);
    return level === "edit" || level === "full";
  };

  let content: ReactElement;
  switch (page) {
    case "dashboard":
      content = <DesignDashboard goto={onNavigate} />;
      break;
    case "donations":
      content = <DesignDonations />;
      break;
    case "donors":
      content = <DesignDonors canWrite={writable("donors")} goto={onNavigate} />;
      break;
    case "receipt":
      content = <DesignReceipt />;
      break;
    case "ledger":
      content = <DesignLedger />;
      break;
    case "events":
      content = <DesignEvents />;
      break;
    case "people":
      content = <DesignPeople />;
      break;
    case "reports":
      content = <DesignReports />;
      break;
    case "roles":
      content = <DesignRoles role={role} />;
      break;
    case "temple":
      content = <TempleProfilePage api={createTempleApiClient(opts)} canEdit={role === "admin"} />;
      break;
    case "inventory":
      content = <InventoryPage api={createInventoryApiClient(opts)} canWrite={role === "admin" || role === "staff"} />;
      break;
    case "audit":
      content = <DesignAudit />;
      break;
    case "designsystem":
      content = <DesignSystemShowcase />;
      break;
    default:
      content = <UnavailablePage title="ไม่พบหน้า" reason="ไม่พบหน้าที่ร้องขอ" />;
  }

  return (
    <div className="page-content" data-page={page}>
      {content}
    </div>
  );
}
