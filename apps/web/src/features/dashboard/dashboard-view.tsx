import { useEffect, useState, type ReactElement } from "react";
import {
  DASHBOARD_CARD_LABELS_TH,
  displayBaht,
  methodLabel,
  statusLabel,
  type DashboardApi,
  type DashboardView,
} from "./dashboard";

const FINANCE_ONLY_TH = "เฉพาะผู้ดูแล/ฝ่ายการเงินจึงจะเห็นข้อมูลนี้";

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }): ReactElement {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-stone-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-400">{hint}</p> : null}
    </div>
  );
}

export function DashboardCards({ view }: { view: DashboardView }): ReactElement {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="สรุปการเงิน">
      {view.financial ? (
        <>
          <MetricCard label={DASHBOARD_CARD_LABELS_TH.income} value={displayBaht(view.financial.incomeSatang)} hint={`เดือน ${view.month}`} />
          <MetricCard label={DASHBOARD_CARD_LABELS_TH.expense} value={displayBaht(view.financial.expenseSatang)} hint={`เดือน ${view.month}`} />
          <MetricCard label={DASHBOARD_CARD_LABELS_TH.balance} value={displayBaht(view.financial.balanceSatang)} hint={`เดือน ${view.month}`} />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500 sm:col-span-2 lg:col-span-3">
          {FINANCE_ONLY_TH}
        </div>
      )}
      <MetricCard label={DASHBOARD_CARD_LABELS_TH.newDonors} value={String(view.newDonorsThisMonth)} hint={`เดือน ${view.month}`} />
    </section>
  );
}

export function DashboardQueues({ view }: { view: DashboardView }): ReactElement {
  return (
    <section className="grid gap-4 sm:grid-cols-2" aria-label="คิวงาน">
      <MetricCard
        label={DASHBOARD_CARD_LABELS_TH.awaitingReceipt}
        value={String(view.awaitingReceiptCount)}
        hint="บริจาคที่ยังไม่ได้ออกใบอนุโมทนา"
      />
      <MetricCard
        label={DASHBOARD_CARD_LABELS_TH.awaitingReconciliation}
        value={String(view.awaitingReconciliationCount)}
        hint="รายการบัญชีที่ยังไม่กระทบยอด"
      />
    </section>
  );
}

export function DashboardRecentDonations({ view }: { view: DashboardView }): ReactElement {
  if (!view.financial) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-center text-sm text-stone-500">
        {FINANCE_ONLY_TH}
      </div>
    );
  }
  if (view.recentDonations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        ยังไม่มีรายการบริจาคล่าสุด
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">วันที่</th>
          <th className="py-2 pr-3">ผู้บริจาค</th>
          <th className="py-2 pr-3 text-right">จำนวนเงิน</th>
          <th className="py-2 pr-3">ช่องทาง</th>
          <th className="py-2 pr-3">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {view.recentDonations.map((donation) => (
          <tr key={donation.id} className="border-b border-stone-100 text-stone-800">
            <td className="py-2 pr-3">{donation.donationDate}</td>
            <td className="py-2 pr-3">{donation.donorName}</td>
            <td className="py-2 pr-3 text-right font-medium">{displayBaht(donation.amountSatang)}</td>
            <td className="py-2 pr-3">{methodLabel(donation.method)}</td>
            <td className="py-2 pr-3">{statusLabel(donation.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Stateful page that loads the dashboard from an injected {@link DashboardApi}. */
export function DashboardPage({ api }: { api: DashboardApi }): ReactElement {
  const [view, setView] = useState<DashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get()
      .then((value) => {
        if (active) setView(value);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">แดชบอร์ดการเงิน</h1>
        <p className="mt-1 text-sm text-stone-600">ภาพรวมรับ-จ่ายเดือนนี้ คิวงาน และรายการบริจาคล่าสุด</p>
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {view ? (
        <>
          <DashboardCards view={view} />
          <DashboardQueues view={view} />
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-stone-900">รายการบริจาคล่าสุด</h2>
            <DashboardRecentDonations view={view} />
          </section>
        </>
      ) : (
        <p className="text-sm text-stone-500">กำลังโหลด…</p>
      )}
    </section>
  );
}
