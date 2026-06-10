import { ReactElement } from "react";
import { Badge, Card } from "../design-system";
import { PageId, permOf, TempleRole } from "../layout/nav";
import { createTempleApiClient } from "./temple/temple";
import { TempleProfilePage } from "./temple/temple-view";
import { createInventoryApiClient } from "./inventory/inventory";
import { InventoryPage } from "./inventory/inventory-view";
import { createItemLoansApiClient } from "./item-loans/item-loans";
import { ItemLoansPage } from "./item-loans/item-loans-view";
import { createAttachmentsApiClient } from "./attachments/attachments";
import { createDashboardApiClient } from "./dashboard/dashboard";
import { createLedgerApiClient } from "./ledger/ledger";
import { createCeremoniesApiClient } from "./ceremonies/ceremonies";
import { createPersonnelApiClient } from "./personnel/personnel";
import { createUsersApiClient } from "./users/users";
import { createDonorsApiClient } from "./donors/donors";
import { createDonationsApiClient } from "./donations/donations";
import { createReceiptsApiClient } from "./receipts/receipts";
import { createReportsApiClient } from "./reports/reports";
import { createAuditApiClient } from "./audit/audit";
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

export function PageContent({ page, baseUrl, getToken, role, today, onNavigate }: PageContentProps): ReactElement {
  const opts = { baseUrl, getToken };
  const writable = (id: PageId): boolean => {
    const level = permOf(role, id);
    return level === "edit" || level === "full";
  };

  // The API enforces authorization; this gate keeps the UI honest — a staff
  // user navigated (or deep-linked) into a finance-only page should see a
  // clear no-permission message, not a wall of failed requests.
  if (permOf(role, page) === "none") {
    return (
      <div className="page-content" data-page={page}>
        <UnavailablePage title="ไม่มีสิทธิ์เข้าถึง" reason="บัญชีของคุณไม่มีสิทธิ์ใช้งานหน้านี้ หากจำเป็นต้องใช้งาน กรุณาติดต่อผู้ดูแลระบบของวัด" />
      </div>
    );
  }

  let content: ReactElement;
  switch (page) {
    case "dashboard":
      content = <DesignDashboard api={createDashboardApiClient(opts)} goto={onNavigate} />;
      break;
    case "donations":
      content = <DesignDonations api={createDonationsApiClient(opts)} donorsApi={createDonorsApiClient(opts)} receiptsApi={createReceiptsApiClient(opts)} canWrite={writable("donations")} today={today} />;
      break;
    case "donors":
      content = <DesignDonors api={createDonorsApiClient(opts)} canWrite={writable("donors")} goto={onNavigate} />;
      break;
    case "receipt":
      content = <DesignReceipt api={createReceiptsApiClient(opts)} donationsApi={createDonationsApiClient(opts)} donorsApi={createDonorsApiClient(opts)} templeApi={createTempleApiClient(opts)} />;
      break;
    case "ledger":
      content = <DesignLedger api={createLedgerApiClient(opts)} reportsApi={createReportsApiClient(opts)} today={today} canWrite={writable("ledger")} />;
      break;
    case "events":
      content = <DesignEvents api={createCeremoniesApiClient(opts)} personnelApi={createPersonnelApiClient(opts)} canWrite={writable("events")} canManageHalls={role === "admin"} />;
      break;
    case "people":
      content = <DesignPeople api={createPersonnelApiClient(opts)} canWrite={writable("people")} />;
      break;
    case "reports":
      content = <DesignReports api={createReportsApiClient(opts)} today={today} />;
      break;
    case "roles":
      content = <DesignRoles role={role} api={createUsersApiClient(opts)} />;
      break;
    case "temple":
      content = <TempleProfilePage api={createTempleApiClient(opts)} canEdit={role === "admin"} />;
      break;
    case "inventory":
      content = <InventoryPage api={createInventoryApiClient(opts)} canWrite={role === "admin" || role === "staff"} />;
      break;
    case "item-loans":
      content = <ItemLoansPage api={createItemLoansApiClient(opts)} attachmentsApi={createAttachmentsApiClient(opts)} today={today} canWrite={writable("item-loans")} canManageItems={role === "admin"} />;
      break;
    case "audit":
      content = <DesignAudit api={createAuditApiClient(opts)} />;
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
