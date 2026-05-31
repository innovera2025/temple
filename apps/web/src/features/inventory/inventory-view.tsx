import { useEffect, useState, type ReactElement } from "react";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  createInventoryApiClient,
  MOVEMENT_TYPE_OPTIONS,
  movementTypeLabel,
  STATUS_OPTIONS,
  statusLabel,
  type CreateItemInput,
  type CreateMovementInput,
  type InventoryApi,
  type InventoryCategory,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
  type InventoryStatus,
  type ItemFilters,
} from "./inventory";

export { createInventoryApiClient };

export function ItemsTable({
  rows,
  onSelect,
}: {
  rows: InventoryItem[];
  onSelect?: (item: InventoryItem) => void;
}): ReactElement {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-500">
        ยังไม่มีรายการพัสดุ/ของบริจาค
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">รายการ</th>
          <th className="py-2 pr-3">ประเภท</th>
          <th className="py-2 pr-3 text-right">คงเหลือ</th>
          <th className="py-2 pr-3">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr
            key={item.id}
            className="cursor-pointer border-b border-stone-100 text-stone-800 hover:bg-stone-50"
            onClick={() => onSelect?.(item)}
          >
            <td className="py-2 pr-3">{item.name}</td>
            <td className="py-2 pr-3">{categoryLabel(item.category)}</td>
            <td className="py-2 pr-3 text-right font-medium">
              {item.quantity} {item.unit ?? ""}
            </td>
            <td className="py-2 pr-3">
              <span className={item.status === "active" ? "text-stone-800" : "text-stone-400"}>
                {statusLabel(item.status)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ItemForm({
  draft,
  category,
  status,
  submitting,
  onChange,
  onCategoryChange,
  onStatusChange,
  onSubmit,
  onCancel,
}: {
  draft: Record<string, string>;
  category: InventoryCategory;
  status: InventoryStatus;
  submitting: boolean;
  onChange: (key: string, value: string) => void;
  onCategoryChange: (c: InventoryCategory) => void;
  onStatusChange: (s: InventoryStatus) => void;
  onSubmit: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ชื่อรายการ</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={draft.name ?? ""}
          onChange={(event) => onChange("name", event.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">ประเภท</span>
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
            value={category}
            onChange={(event) => onCategoryChange(event.target.value as InventoryCategory)}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">หน่วยนับ</span>
          <input
            className="rounded-lg border border-stone-300 px-3 py-2"
            placeholder="ชิ้น / กล่อง / ชุด"
            value={draft.unit ?? ""}
            onChange={(event) => onChange("unit", event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">สถานะ</span>
          <select
            className="rounded-lg border border-stone-300 px-3 py-2"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as InventoryStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">หมายเหตุ</span>
        <textarea
          className="rounded-lg border border-stone-300 px-3 py-2"
          rows={2}
          value={draft.note ?? ""}
          onChange={(event) => onChange("note", event.target.value)}
        />
      </label>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

export function MovementsTable({ rows }: { rows: InventoryMovement[] }): ReactElement {
  if (rows.length === 0) {
    return <p className="text-sm text-stone-500">ยังไม่มีประวัติการเคลื่อนไหว</p>;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
          <th className="py-2 pr-3">วันที่</th>
          <th className="py-2 pr-3">ประเภท</th>
          <th className="py-2 pr-3 text-right">จำนวน</th>
          <th className="py-2 pr-3 text-right">คงเหลือ</th>
          <th className="py-2 pr-3">เหตุผล</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id} className="border-b border-stone-100 text-stone-800">
            <td className="py-2 pr-3 whitespace-nowrap">{m.movementDate}</td>
            <td className="py-2 pr-3">
              <span className={m.movementType === "receive" ? "text-emerald-700" : "text-amber-700"}>
                {movementTypeLabel(m.movementType)}
              </span>
            </td>
            <td className="py-2 pr-3 text-right">
              {m.movementType === "receive" ? "+" : "-"}
              {m.quantity}
            </td>
            <td className="py-2 pr-3 text-right font-medium">{m.balanceAfter}</td>
            <td className="py-2 pr-3">{m.reason ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MovementForm({
  movementType,
  draft,
  submitting,
  onTypeChange,
  onChange,
  onSubmit,
}: {
  movementType: InventoryMovementType;
  draft: Record<string, string>;
  submitting: boolean;
  onTypeChange: (t: InventoryMovementType) => void;
  onChange: (key: string, value: string) => void;
  onSubmit: () => void;
}): ReactElement {
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      aria-label="บันทึกการเคลื่อนไหว"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">ประเภท</span>
        <select
          className="rounded-lg border border-stone-300 px-3 py-2"
          value={movementType}
          onChange={(event) => onTypeChange(event.target.value as InventoryMovementType)}
        >
          {MOVEMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">จำนวน</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="number"
          min={1}
          value={draft.quantity ?? ""}
          onChange={(event) => onChange("quantity", event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">วันที่</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          type="date"
          value={draft.movementDate ?? ""}
          onChange={(event) => onChange("movementDate", event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-stone-700">เหตุผล</span>
        <input
          className="rounded-lg border border-stone-300 px-3 py-2"
          placeholder="รับบริจาค / เบิกใช้ / ปรับยอด"
          value={draft.reason ?? ""}
          onChange={(event) => onChange("reason", event.target.value)}
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "กำลังบันทึก…" : "บันทึกการเคลื่อนไหว"}
        </button>
      </div>
    </form>
  );
}

type Mode =
  | { kind: "list" }
  | { kind: "createItem" }
  | { kind: "editItem"; item: InventoryItem }
  | { kind: "detail"; item: InventoryItem };

/** Stateful page: list/filter items, manage items, and record stock movements. */
export function InventoryPage({ api, canWrite }: { api: InventoryApi; canWrite: boolean }): ReactElement {
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [filters, setFilters] = useState<ItemFilters>({});
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [itemDraft, setItemDraft] = useState<Record<string, string>>({});
  const [itemCategory, setItemCategory] = useState<InventoryCategory>("sangha_offering");
  const [itemStatus, setItemStatus] = useState<InventoryStatus>("active");
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementType, setMovementType] = useState<InventoryMovementType>("receive");
  const [movementDraft, setMovementDraft] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = (next: ItemFilters): void => {
    api
      .listItems(next)
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  };

  useEffect(() => {
    reload(filters);
  }, [api]);

  const openDetail = (item: InventoryItem): void => {
    setError(null);
    setMovementType("receive");
    setMovementDraft({});
    setMode({ kind: "detail", item });
    api
      .listMovements(item.id)
      .then(setMovements)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดประวัติไม่สำเร็จ"));
  };

  const submitItem = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    const payload = { name: itemDraft.name ?? "", category: itemCategory, status: itemStatus, unit: itemDraft.unit ?? "", note: itemDraft.note ?? "" } as unknown as CreateItemInput;
    try {
      if (mode.kind === "createItem") await api.createItem(payload);
      else if (mode.kind === "editItem") await api.updateItem(mode.item.id, payload);
      setMode({ kind: "list" });
      reload(filters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const submitMovement = async (): Promise<void> => {
    if (mode.kind !== "detail") return;
    setSubmitting(true);
    setError(null);
    const payload = {
      movementType,
      quantity: movementDraft.quantity ?? "",
      movementDate: movementDraft.movementDate ?? "",
      reason: movementDraft.reason ?? "",
    } as unknown as CreateMovementInput;
    try {
      const { item } = await api.recordMovement(mode.item.id, payload);
      setMovementDraft({});
      setMode({ kind: "detail", item });
      setMovements(await api.listMovements(item.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">คลังของบริจาค / พัสดุ</h1>
          <p className="mt-1 text-sm text-stone-600">ทะเบียนสังฆทาน พัสดุ และอุปกรณ์ พร้อมประวัติรับเข้า-เบิกออก</p>
        </div>
        {canWrite && mode.kind === "list" ? (
          <button
            type="button"
            onClick={() => {
              setItemDraft({});
              setItemCategory("sangha_offering");
              setItemStatus("active");
              setError(null);
              setMode({ kind: "createItem" });
            }}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white"
          >
            เพิ่มรายการ
          </button>
        ) : null}
      </header>

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {mode.kind === "list" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3" aria-label="ตัวกรอง">
            <select
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={filters.category ?? ""}
              onChange={(event) => {
                const next = { ...filters, category: (event.target.value || undefined) as InventoryCategory | undefined };
                setFilters(next);
                reload(next);
              }}
            >
              <option value="">ทุกประเภท</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={filters.status ?? ""}
              onChange={(event) => {
                const next = { ...filters, status: (event.target.value || undefined) as InventoryStatus | undefined };
                setFilters(next);
                reload(next);
              }}
            >
              <option value="">ทุกสถานะ</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              placeholder="ค้นหาชื่อรายการ"
              value={filters.q ?? ""}
              onChange={(event) => {
                const next = { ...filters, q: event.target.value || undefined };
                setFilters(next);
                reload(next);
              }}
            />
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <ItemsTable rows={rows} onSelect={openDetail} />
          </div>
        </>
      ) : mode.kind === "detail" ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-stone-800">{mode.item.name}</h2>
                <p className="text-sm text-stone-500">{categoryLabel(mode.item.category)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-500">คงเหลือ</p>
                <p className="text-2xl font-bold text-stone-900">
                  {mode.item.quantity} <span className="text-base font-normal text-stone-500">{mode.item.unit ?? ""}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode({ kind: "list" });
                reload(filters);
              }}
              className="mt-3 text-sm font-semibold text-stone-600"
            >
              ← กลับ
            </button>
          </div>

          {canWrite && mode.item.status === "active" ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-stone-700">บันทึกรับเข้า / เบิกออก</h3>
              <MovementForm
                movementType={movementType}
                draft={movementDraft}
                submitting={submitting}
                onTypeChange={setMovementType}
                onChange={(key, value) => setMovementDraft((prev) => ({ ...prev, [key]: value }))}
                onSubmit={submitMovement}
              />
            </div>
          ) : null}

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-stone-700">ประวัติการเคลื่อนไหว</h3>
            <MovementsTable rows={movements} />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">
            {mode.kind === "createItem" ? "เพิ่มรายการ" : "แก้ไขรายการ"}
          </h2>
          <ItemForm
            draft={itemDraft}
            category={itemCategory}
            status={itemStatus}
            submitting={submitting}
            onChange={(key, value) => setItemDraft((prev) => ({ ...prev, [key]: value }))}
            onCategoryChange={setItemCategory}
            onStatusChange={setItemStatus}
            onSubmit={submitItem}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}
    </section>
  );
}
