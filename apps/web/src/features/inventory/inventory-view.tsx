import { useEffect, useRef, useState, type ReactElement } from "react";
import { Badge, Button, Card, Modal, SearchBox, Toolbar } from "../../design-system";
import { Icon } from "../../layout/icons";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  createInventoryApiClient,
  MOVEMENT_TYPE_OPTIONS,
  movementTypeLabel,
  parseInventoryXlsx,
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
  type RoomView,
} from "./inventory";

export { createInventoryApiClient };

const ERROR_STYLE = { marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 } as const;
const NOTICE_STYLE = { marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--credit-tint)", color: "var(--credit)", fontSize: 13 } as const;

export function ItemsTable({
  rows,
  rooms = [],
  onSelect,
}: {
  rows: InventoryItem[];
  rooms?: RoomView[];
  onSelect?: (item: InventoryItem) => void;
}): ReactElement {
  if (rows.length === 0) {
    return <div className="card-pad muted" style={{ textAlign: "center" }}>ยังไม่มีรายการพัสดุ/ของบริจาค</div>;
  }
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  return (
    <div className="t-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th>รายการ</th>
            <th>ประเภท</th>
            <th>ห้อง/โรงเก็บ</th>
            <th className="num">คงเหลือ</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="clickable" onClick={() => onSelect?.(item)}>
              <td style={{ fontWeight: 500 }}>{item.name}</td>
              <td><Badge kind="neutral">{categoryLabel(item.category)}</Badge></td>
              <td className="muted">{item.roomId ? roomName.get(item.roomId) ?? "—" : "—"}</td>
              <td className="num tnum" style={{ fontWeight: 600 }}>{item.quantity} {item.unit ?? ""}</td>
              <td><Badge kind={item.status === "active" ? "credit" : "void"} dot>{statusLabel(item.status)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemForm({
  draft,
  category,
  status,
  rooms,
  submitting,
  onChange,
  onCategoryChange,
  onStatusChange,
  onAddRoom,
  onSubmit,
  onCancel,
}: {
  draft: Record<string, string>;
  category: InventoryCategory;
  status: InventoryStatus;
  rooms: RoomView[];
  submitting: boolean;
  onChange: (key: string, value: string) => void;
  onCategoryChange: (c: InventoryCategory) => void;
  onStatusChange: (s: InventoryStatus) => void;
  onAddRoom: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="field"><label>ชื่อรายการ</label>
        <input className="control" value={draft.name ?? ""} onChange={(event) => onChange("name", event.target.value)} />
      </div>
      <div className="form-grid">
        <div className="field"><label>ประเภท</label>
          <select className="control" value={category} onChange={(event) => onCategoryChange(event.target.value as InventoryCategory)}>
            {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field"><label>หน่วยนับ</label>
          <input className="control" placeholder="ชิ้น / กล่อง / ชุด" value={draft.unit ?? ""} onChange={(event) => onChange("unit", event.target.value)} />
        </div>
        <div className="field"><label>สถานะ</label>
          <select className="control" value={status} onChange={(event) => onStatusChange(event.target.value as InventoryStatus)}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>ห้อง/โรงเก็บ</label>
        <div className="row" style={{ gap: 8 }}>
          <select className="control" style={{ flex: 1 }} value={draft.roomId ?? ""} onChange={(event) => onChange("roomId", event.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Button type="button" variant="secondary" icon={<span aria-hidden="true">＋</span>} onClick={onAddRoom}>ห้องใหม่</Button>
        </div>
      </div>
      <div className="field"><label>หมายเหตุ</label>
        <textarea className="control" style={{ minHeight: 56 }} value={draft.note ?? ""} onChange={(event) => onChange("note", event.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>ยกเลิก</Button>
        <Button type="submit" variant="primary" disabled={submitting}>{submitting ? "กำลังบันทึก…" : "บันทึก"}</Button>
      </div>
    </form>
  );
}

export function MovementsTable({ rows }: { rows: InventoryMovement[] }): ReactElement {
  if (rows.length === 0) {
    return <div className="card-pad muted">ยังไม่มีประวัติการเคลื่อนไหว</div>;
  }
  return (
    <div className="t-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>ประเภท</th>
            <th className="num">จำนวน</th>
            <th className="num">คงเหลือ</th>
            <th>เหตุผล</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td style={{ whiteSpace: "nowrap" }}>{m.movementDate}</td>
              <td><Badge kind={m.movementType === "receive" ? "credit" : "pending"} dot>{movementTypeLabel(m.movementType)}</Badge></td>
              <td className="num tnum">{m.movementType === "receive" ? "+" : "-"}{m.quantity}</td>
              <td className="num tnum" style={{ fontWeight: 600 }}>{m.balanceAfter}</td>
              <td>{m.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <form aria-label="บันทึกการเคลื่อนไหว" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="form-grid">
        <div className="field"><label>ประเภท</label>
          <select className="control" value={movementType} onChange={(event) => onTypeChange(event.target.value as InventoryMovementType)}>
            {MOVEMENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field"><label>จำนวน</label>
          <input className="control tnum" type="number" min={1} value={draft.quantity ?? ""} onChange={(event) => onChange("quantity", event.target.value)} />
        </div>
        <div className="field"><label>วันที่</label>
          <input className="control tnum" type="date" value={draft.movementDate ?? ""} onChange={(event) => onChange("movementDate", event.target.value)} />
        </div>
        <div className="field"><label>เหตุผล</label>
          <input className="control" placeholder="รับบริจาค / เบิกใช้ / ปรับยอด" value={draft.reason ?? ""} onChange={(event) => onChange("reason", event.target.value)} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <Button type="submit" variant="primary" disabled={submitting}>{submitting ? "กำลังบันทึก…" : "บันทึกการเคลื่อนไหว"}</Button>
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
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = (next: ItemFilters): void => {
    api
      .listItems(next)
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  };
  const reloadRooms = (): void => {
    api.listRooms().then(setRooms).catch(() => undefined);
  };

  useEffect(() => {
    reload(filters);
    reloadRooms();
  }, [api]);

  const addRoom = async (): Promise<void> => {
    if (typeof window === "undefined") return;
    const name = window.prompt("ชื่อห้อง/โรงเก็บใหม่");
    if (!name || !name.trim()) return;
    try {
      const room = await api.createRoom({ name: name.trim() });
      setRooms((prev) => [...prev, room].sort((a, b) => a.name.localeCompare(b.name)));
      setItemDraft((prev) => ({ ...prev, roomId: room.id }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เพิ่มห้องไม่สำเร็จ");
    }
  };

  const onImportFile = async (file: File | null): Promise<void> => {
    if (!file) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const parsed = await parseInventoryXlsx(file);
      if (parsed.length === 0) {
        setError("ไม่พบข้อมูลในไฟล์ Excel (ต้องมีคอลัมน์ ชื่อ/name)");
        return;
      }
      const result = await api.importItems(parsed);
      setNotice(`นำเข้าสำเร็จ: เพิ่ม ${result.itemsCreated} รายการ${result.roomsCreated ? ` และห้องใหม่ ${result.roomsCreated} ห้อง` : ""}`);
      reloadRooms();
      reload(filters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
    const payload = {
      name: itemDraft.name ?? "",
      category: itemCategory,
      status: itemStatus,
      unit: itemDraft.unit ?? "",
      note: itemDraft.note ?? "",
      roomId: itemDraft.roomId || null,
    } as unknown as CreateItemInput;
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
    <div className="content-wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">เพิ่มเติม</div>
          <h1>คลังของบริจาค / พัสดุ</h1>
          <p className="desc">ทะเบียนสังฆทาน พัสดุ และอุปกรณ์ พร้อมประวัติรับเข้า-เบิกออก</p>
        </div>
        {canWrite && mode.kind === "list" ? (
          <div className="head-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              aria-label="ไฟล์ Excel นำเข้า"
              onChange={(event) => { void onImportFile(event.target.files?.[0] ?? null); }}
            />
            <Button variant="secondary" icon={<Icon name="download" size={15} />} disabled={submitting} onClick={() => fileInputRef.current?.click()}>นำเข้า Excel</Button>
            <Button variant="primary" icon={<Icon name="plus" size={15} />} onClick={() => {
              setItemDraft({});
              setItemCategory("sangha_offering");
              setItemStatus("active");
              setError(null);
              setNotice(null);
              setMode({ kind: "createItem" });
            }}>เพิ่มรายการ</Button>
          </div>
        ) : null}
      </div>

      {error ? <div style={ERROR_STYLE}>{error}</div> : null}
      {notice ? <div style={NOTICE_STYLE}>{notice}</div> : null}

      {mode.kind === "list" ? (
        <Card>
          <Toolbar>
            <SearchBox value={filters.q ?? ""} onChange={(v) => { const next = { ...filters, q: v || undefined }; setFilters(next); reload(next); }} placeholder="ค้นหาชื่อรายการ" />
            <select className="control" style={{ width: "auto" }} value={filters.category ?? ""} onChange={(event) => { const next = { ...filters, category: (event.target.value || undefined) as InventoryCategory | undefined }; setFilters(next); reload(next); }}>
              <option value="">ทุกประเภท</option>
              {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="control" style={{ width: "auto" }} value={filters.status ?? ""} onChange={(event) => { const next = { ...filters, status: (event.target.value || undefined) as InventoryStatus | undefined }; setFilters(next); reload(next); }}>
              <option value="">ทุกสถานะ</option>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="muted" style={{ marginLeft: "auto" }}>{rows.length} รายการ</span>
          </Toolbar>
          <ItemsTable rows={rows} rooms={rooms} onSelect={openDetail} />
        </Card>
      ) : mode.kind === "detail" ? (
        <div className="split-wide">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card pad>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{mode.item.name}</h3>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{categoryLabel(mode.item.category)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="muted" style={{ fontSize: 12 }}>คงเหลือ</div>
                  <div className="tnum" style={{ fontSize: 26, fontWeight: 700 }}>{mode.item.quantity} <span style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 400 }}>{mode.item.unit ?? ""}</span></div>
                </div>
              </div>
              <Button variant="tertiary" size="sm" icon={<Icon name="chevR" size={14} style={{ transform: "rotate(180deg)" }} />} onClick={() => { setMode({ kind: "list" }); reload(filters); }}>กลับ</Button>
            </Card>
            {canWrite && mode.item.status === "active" ? (
              <Card pad>
                <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>บันทึกรับเข้า / เบิกออก</h3>
                <MovementForm
                  movementType={movementType}
                  draft={movementDraft}
                  submitting={submitting}
                  onTypeChange={setMovementType}
                  onChange={(key, value) => setMovementDraft((prev) => ({ ...prev, [key]: value }))}
                  onSubmit={submitMovement}
                />
              </Card>
            ) : null}
          </div>
          <Card>
            <div className="card-head"><h3>ประวัติการเคลื่อนไหว</h3></div>
            <MovementsTable rows={movements} />
          </Card>
        </div>
      ) : (
        <Modal title={mode.kind === "createItem" ? "เพิ่มรายการ" : "แก้ไขรายการ"} sub="พัสดุ / ของบริจาคของวัด" onClose={() => setMode({ kind: "list" })}>
          <ItemForm
            draft={itemDraft}
            category={itemCategory}
            status={itemStatus}
            rooms={rooms}
            submitting={submitting}
            onChange={(key, value) => setItemDraft((prev) => ({ ...prev, [key]: value }))}
            onCategoryChange={setItemCategory}
            onStatusChange={setItemStatus}
            onAddRoom={() => void addRoom()}
            onSubmit={submitItem}
            onCancel={() => setMode({ kind: "list" })}
          />
        </Modal>
      )}
    </div>
  );
}
