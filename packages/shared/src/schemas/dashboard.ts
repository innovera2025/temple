/**
 * Finance dashboard view types (Task 9). Money fields are integer-satang strings
 * (BigInt-safe). The dashboard is role-aware: financial metrics (`financial`,
 * `recentDonations`) are populated only for admin/finance and are null/empty for
 * restricted roles (e.g. staff), who still see operational counts/queues.
 */

export interface DashboardFinancial {
  /** `YYYY-MM` the figures cover. */
  month: string;
  incomeSatang: string;
  expenseSatang: string;
  /** income − expense; may be negative. */
  balanceSatang: string;
}

export interface DashboardRecentDonation {
  id: string;
  donorName: string;
  amountSatang: string;
  method: string;
  donationDate: string;
  status: string;
}

export interface DashboardView {
  month: string;
  /** Financial metrics — admin/finance only; null for restricted roles. */
  financial: DashboardFinancial | null;
  newDonorsThisMonth: number;
  awaitingReceiptCount: number;
  awaitingReconciliationCount: number;
  /** Recent donations (carry amounts) — admin/finance only; empty for restricted roles. */
  recentDonations: DashboardRecentDonation[];
}

export const DASHBOARD_CARD_LABELS_TH = {
  income: "รับเดือนนี้",
  expense: "จ่ายเดือนนี้",
  balance: "คงเหลือ",
  newDonors: "ผู้บริจาคใหม่เดือนนี้",
  awaitingReceipt: "รอออกใบอนุโมทนา",
  awaitingReconciliation: "รอกระทบยอด",
} as const;
