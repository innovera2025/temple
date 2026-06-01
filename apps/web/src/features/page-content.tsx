import { ReactElement } from "react";
import { Badge, Button, Card } from "../design-system";
import { PageId, permOf, TempleRole } from "../layout/nav";
import { createDashboardApiClient } from "./dashboard/dashboard";
import { DashboardPage } from "./dashboard/dashboard-view";
import { createDonationsApiClient } from "./donations/donations";
import { DonationsPage } from "./donations/donations-view";
import { createDonorsApiClient } from "./donors/donors";
import { DonorsPage } from "./donors/donors-view";
import { createReceiptsApiClient } from "./receipts/receipts";
import { ReceiptsPanel } from "./receipts/receipts-view";
import { createLedgerApiClient } from "./ledger/ledger";
import { LedgerPage } from "./ledger/ledger-view";
import { createCeremoniesApiClient } from "./ceremonies/ceremonies";
import { CeremoniesPage } from "./ceremonies/ceremonies-view";
import { createPersonnelApiClient } from "./personnel/personnel";
import { PersonnelPage } from "./personnel/personnel-view";
import { createReportsApiClient } from "./reports/reports";
import { ReportsPage } from "./reports/reports-view";
import { createUsersApiClient } from "./users/users";
import { UsersPage } from "./users/users-view";
import { createTempleApiClient } from "./temple/temple";
import { TempleProfilePage } from "./temple/temple-view";
import { createInventoryApiClient } from "./inventory/inventory";
import { InventoryPage } from "./inventory/inventory-view";

export interface PageContentProps {
  page: PageId;
  baseUrl: string;
  getToken: () => string | null;
  role: TempleRole;
  /** Today's date (YYYY-MM-DD) for views that default forms/queries to it. */
  today: string;
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

// Showcase of the implemented design-system primitives (the design's "ระบบออกแบบ" page).
function DesignSystemShowcase(): ReactElement {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>ระบบออกแบบ</h1>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-3)" }}>คอมโพเนนต์พื้นฐานที่ port มาแล้ว (Button / Badge / Card)</p>
      <Card pad className="mb-4">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Button variant="primary">หลัก</Button>
          <Button variant="secondary">รอง</Button>
          <Button variant="tertiary">ลิงก์</Button>
          <Button variant="danger">อันตราย</Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge kind="credit" dot>รายรับ</Badge>
          <Badge kind="debit" dot>รายจ่าย</Badge>
          <Badge kind="pending">รอตรวจสอบ</Badge>
          <Badge kind="reconciled">กระทบยอดแล้ว</Badge>
          <Badge kind="void">ยกเลิก</Badge>
          <Badge kind="accent">เน้น</Badge>
          <Badge kind="neutral">ทั่วไป</Badge>
        </div>
      </Card>
    </div>
  );
}

export function PageContent({ page, baseUrl, getToken, role, today }: PageContentProps): ReactElement {
  const opts = { baseUrl, getToken };
  const writable = (id: PageId): boolean => {
    const level = permOf(role, id);
    return level === "edit" || level === "full";
  };

  let content: ReactElement;
  switch (page) {
    case "dashboard":
      content = <DashboardPage api={createDashboardApiClient(opts)} />;
      break;
    case "donations":
      content = <DonationsPage api={createDonationsApiClient(opts)} today={today} />;
      break;
    case "donors":
      content = <DonorsPage api={createDonorsApiClient(opts)} canWrite={writable("donors")} />;
      break;
    case "receipt":
      content = <ReceiptsPanel api={createReceiptsApiClient(opts)} />;
      break;
    case "ledger":
      content = <LedgerPage api={createLedgerApiClient(opts)} today={today} />;
      break;
    case "events":
      content = <CeremoniesPage api={createCeremoniesApiClient(opts)} canWrite={writable("events")} />;
      break;
    case "people":
      content = <PersonnelPage api={createPersonnelApiClient(opts)} canWrite={writable("people")} />;
      break;
    case "reports":
      content = <ReportsPage api={createReportsApiClient(opts)} today={today} />;
      break;
    case "roles":
      content = <UsersPage api={createUsersApiClient(opts)} />;
      break;
    case "temple":
      content = <TempleProfilePage api={createTempleApiClient(opts)} canEdit={role === "admin"} />;
      break;
    case "inventory":
      content = <InventoryPage api={createInventoryApiClient(opts)} canWrite={role === "admin" || role === "staff"} />;
      break;
    case "audit":
      content = (
        <UnavailablePage
          title="บันทึกการใช้งาน"
          reason="ระบบบันทึกการใช้งาน (audit log) ระดับวัดมีอยู่ฝั่งฐานข้อมูลแล้ว แต่ยังไม่มี API สำหรับให้หน้าจอนี้เรียกดู — จะเปิดใช้งานเมื่อเพิ่ม endpoint แล้ว"
        />
      );
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
