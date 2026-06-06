import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import { bahtToSatang, INVENTORY_CATEGORY_LABELS_TH, type InventoryCategory, MAX_LOAN_PHOTOS } from "@wat/shared";
import { Badge, Button, Card, Modal } from "../../design-system";
import { Icon } from "../../layout/icons";
import { type AttachmentsApi, fileToBase64 } from "../attachments/attachments";
import {
  type BorrowableItemView,
  displayBaht,
  type ItemLoanView,
  type ItemLoansApi,
  loanStatusLabel,
  settlementTypeLabel,
} from "./item-loans";

const CATEGORY_ENTRIES = Object.entries(INVENTORY_CATEGORY_LABELS_TH) as Array<[InventoryCategory, string]>;

function ErrorBox({ children }: { children: ReactNode }): ReactElement {
  return <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--r)", background: "var(--danger-tint)", color: "var(--danger)", fontSize: 13 }}>{children}</div>;
}

export interface ItemLoansPageProps {
  api: ItemLoansApi;
  attachmentsApi: AttachmentsApi;
  today: string;
  /** Can borrow/return loans (admin/finance/staff). */
  canWrite: boolean;
  /** Can add/edit the physical borrowable items (temple owner / admin only).
   *  Defaults to `canWrite` for backward compatibility. */
  canManageItems?: boolean;
}

export function ItemLoansPage({ api, attachmentsApi, today, canWrite, canManageItems = canWrite }: ItemLoansPageProps): ReactElement {
  const [items, setItems] = useState<BorrowableItemView[] | null>(null);
  const [loans, setLoans] = useState<ItemLoanView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);

  const [addingItem, setAddingItem] = useState(false);
  const [borrowing, setBorrowing] = useState(false);
  const [returning, setReturning] = useState<ItemLoanView | null>(null);

  useEffect(() => {
    let active = true;
    setItems(null);
    setLoans(null);
    setError(null);
    Promise.all([api.listItems(), api.listLoans()]).then(
      ([i, l]) => { if (active) { setItems(i); setLoans(l); } },
      (e: unknown) => { if (active) setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); },
    );
    return () => { active = false; };
  }, [api, reloadKey]);

  return (
    <div className="content-wrap" data-page="item-loans">
      <div className="page-head">
        <div>
          <div className="eyebrow">เพิ่มเติม</div>
          <h1>การยืม-คืนสิ่งของวัด</h1>
          <p className="desc">ทะเบียนสิ่งของที่ให้ยืม จำนวนคงเหลือ และประวัติการยืม-คืน (คืนไม่ครบให้ระบุการชดใช้)</p>
        </div>
        {canManageItems || canWrite ? (
          <div className="head-actions">
            {canManageItems ? (
              <Button variant="secondary" icon={<Icon name="plus" size={15} />} onClick={() => setAddingItem(true)}>เพิ่มสิ่งของ</Button>
            ) : null}
            {canWrite ? (
              <Button variant="primary" icon={<Icon name="arrowR" size={15} />} onClick={() => setBorrowing(true)} disabled={!items?.length}>ยืมของ</Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <ErrorBox>โหลดข้อมูลไม่สำเร็จ: {error}</ErrorBox> : null}

      <Card style={{ marginBottom: 16 }}>
        <div className="card-head"><div><h3>สิ่งของที่ให้ยืม</h3><div className="sub">คงเหลือ = ทั้งหมด − ที่ถูกยืมอยู่</div></div></div>
        <div className="t-scroll">
          <table className="tbl">
            <thead><tr><th>ชื่อสิ่งของ</th><th>ประเภท</th><th className="num">คงเหลือ / ทั้งหมด</th><th>สถานะ</th></tr></thead>
            <tbody>
              {!items ? (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: "20px" }}>ยังไม่มีสิ่งของ — กด “เพิ่มสิ่งของ”</td></tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ fontWeight: 500 }}>{it.name}</td>
                    <td className="muted">{INVENTORY_CATEGORY_LABELS_TH[it.category]}{it.unit ? ` · ${it.unit}` : ""}</td>
                    <td className="num tnum"><b>{it.availableQty}</b> / {it.totalQty}</td>
                    <td><Badge kind={it.status === "active" ? "credit" : "void"} dot>{it.status === "active" ? "ใช้งาน" : "ปิดใช้งาน"}</Badge></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="card-head"><div><h3>รายการยืม (ใครยืมบ้าง)</h3><div className="sub">เรียงจากล่าสุด</div></div></div>
        <div className="t-scroll">
          <table className="tbl">
            <thead><tr><th>เลขที่</th><th>สิ่งของ</th><th>ผู้ยืม</th><th className="num">จำนวน</th><th>วันที่ยืม</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {!loans ? (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: "20px" }}>{error ? "โหลดไม่สำเร็จ" : "กำลังโหลด…"}</td></tr>
              ) : loans.length === 0 ? (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: "20px" }}>ยังไม่มีรายการยืม</td></tr>
              ) : (
                loans.map((ln) => (
                  <tr key={ln.id}>
                    <td className="mono">{ln.loanNo}</td>
                    <td>{ln.itemName}</td>
                    <td><div style={{ fontWeight: 500 }}>{ln.borrowerName}</div>{ln.borrowerPhone ? <div className="muted" style={{ fontSize: 12 }}>{ln.borrowerPhone}</div> : null}</td>
                    <td className="num tnum">{ln.returnedQty != null ? `${ln.returnedQty}/${ln.quantity}` : ln.quantity}{ln.shortageQty > 0 ? <span style={{ color: "var(--debit)" }}> (ขาด {ln.shortageQty})</span> : null}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{ln.borrowedAt}</td>
                    <td>
                      <Badge kind={ln.status === "returned" ? "neutral" : "pending"} dot>{loanStatusLabel(ln.status)}</Badge>
                      {ln.settlement ? <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>ชดใช้: {settlementTypeLabel(ln.settlement.settlementType)}{ln.settlement.cashAmountSatang ? ` ${displayBaht(ln.settlement.cashAmountSatang)}` : ""}</div> : null}
                    </td>
                    <td className="num">{canWrite && ln.status === "borrowed" ? <Button variant="tertiary" size="sm" onClick={() => setReturning(ln)}>คืน</Button> : null}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {addingItem ? <AddItemModal api={api} onClose={() => setAddingItem(false)} onSaved={() => { setAddingItem(false); reload(); }} /> : null}
      {borrowing && items ? (
        <BorrowModal api={api} attachmentsApi={attachmentsApi} today={today} items={items.filter((i) => i.status === "active")} onClose={() => setBorrowing(false)} onSaved={() => { setBorrowing(false); reload(); }} />
      ) : null}
      {returning ? <ReturnModal api={api} today={today} loan={returning} onClose={() => setReturning(null)} onSaved={() => { setReturning(null); reload(); }} /> : null}
    </div>
  );
}

function AddItemModal({ api, onClose, onSaved }: { api: ItemLoansApi; onClose: () => void; onSaved: () => void }): ReactElement {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("equipment");
  const [unit, setUnit] = useState("");
  const [totalQty, setTotalQty] = useState("1");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(): Promise<void> {
    if (!name.trim()) { setErr("กรุณากรอกชื่อสิ่งของ"); return; }
    setBusy(true); setErr(null);
    try {
      await api.createItem({ name: name.trim(), category, unit: unit.trim() || undefined, totalQty: Math.max(0, Math.floor(Number(totalQty) || 0)) });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return (
    <Modal title="เพิ่มสิ่งของที่ให้ยืม" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "กำลังบันทึก…" : "บันทึก"}</Button></>}>
      <div className="field"><label>ชื่อสิ่งของ</label><input className="control" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เต็นท์ โต๊ะ เก้าอี้" /></div>
      <div className="form-grid">
        <div className="field"><label>ประเภท</label><select className="control" value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>{CATEGORY_ENTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>หน่วย</label><input className="control" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="เช่น หลัง ตัว ชุด" /></div>
      </div>
      <div className="field"><label>จำนวนทั้งหมด</label><input className="control tnum" value={totalQty} onChange={(e) => setTotalQty(e.target.value.replace(/[^0-9]/g, ""))} /></div>
      {err ? <p className="error-text">{err}</p> : null}
    </Modal>
  );
}

function BorrowModal({ api, attachmentsApi, today, items, onClose, onSaved }: { api: ItemLoansApi; attachmentsApi: AttachmentsApi; today: string; items: BorrowableItemView[]; onClose: () => void; onSaved: () => void }): ReactElement {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [borrowedAt, setBorrowedAt] = useState(today);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = items.find((i) => i.id === itemId);

  // Object-URL thumbnails for the chosen photos; revoked when the set changes / on close.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | null): void {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
      }
      return merged.slice(0, MAX_LOAN_PHOTOS);
    });
  }
  const removeFile = (index: number): void => setFiles((prev) => prev.filter((_, i) => i !== index));

  async function save(): Promise<void> {
    if (!itemId) { setErr("กรุณาเลือกสิ่งของ"); return; }
    if (!borrowerName.trim()) { setErr("กรุณากรอกชื่อผู้ยืม"); return; }
    if (files.length === 0) { setErr("ต้องแนบรูปถ่ายตอนยืมก่อนบันทึก"); return; }
    setBusy(true); setErr(null);
    try {
      const ids: string[] = [];
      for (const f of files) {
        const photo = await attachmentsApi.upload({ ownerType: "item_loan", ownerId: itemId, fileName: f.name, mimeType: f.type || "image/jpeg", contentBase64: await fileToBase64(f) });
        ids.push(photo.id);
      }
      await api.createLoan({
        itemId,
        borrowerName: borrowerName.trim(),
        borrowerPhone: borrowerPhone.trim() || undefined,
        quantity: Math.max(1, Math.floor(Number(quantity) || 0)),
        borrowedAt,
        borrowPhotoIds: ids,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return (
    <Modal title="บันทึกการยืม" sub="ต้องถ่ายรูปการยืมก่อนบันทึก" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "กำลังบันทึก…" : "บันทึกการยืม"}</Button></>}>
      <div className="field"><label>สิ่งของ</label>
        <select className="control" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name} (คงเหลือ {i.availableQty})</option>)}
        </select>
        {selected ? <span className="hint">ยืมได้ไม่เกิน {selected.availableQty}</span> : null}
      </div>
      <div className="form-grid">
        <div className="field"><label>ชื่อผู้ยืม</label><input className="control" value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} /></div>
        <div className="field"><label>เบอร์โทร (ไม่บังคับ)</label><input className="control tnum" value={borrowerPhone} onChange={(e) => setBorrowerPhone(e.target.value)} /></div>
        <div className="field"><label>จำนวน</label><input className="control tnum" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} /></div>
        <div className="field"><label>วันที่ยืม</label><input className="control tnum" value={borrowedAt} onChange={(e) => setBorrowedAt(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>รูปถ่ายการยืม (บังคับ) — แนบได้หลายรูป</label>
        {previews.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {previews.map((url, i) => (
              <div key={url} style={{ position: "relative", width: 64, height: 64 }}>
                <img src={url} alt={`รูปการยืม ${i + 1}`} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--r)", border: "1px solid var(--border)" }} />
                <button type="button" aria-label="ลบรูป" onClick={() => removeFile(i)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer", lineHeight: 1, fontSize: 13, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        ) : null}
        <input className="control" type="file" accept="image/*" multiple disabled={files.length >= MAX_LOAN_PHOTOS} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <span className="hint">{files.length}/{MAX_LOAN_PHOTOS} รูป · ถ่ายสดจากกล้องหรือเลือกจากเครื่องก็ได้</span>
      </div>
      {err ? <p className="error-text">{err}</p> : null}
    </Modal>
  );
}

function ReturnModal({ api, today, loan, onClose, onSaved }: { api: ItemLoansApi; today: string; loan: ItemLoanView; onClose: () => void; onSaved: () => void }): ReactElement {
  const [returnedQty, setReturnedQty] = useState(String(loan.quantity));
  const [returnedAt, setReturnedAt] = useState(today);
  const [returnNote, setReturnNote] = useState("");
  const [settlementType, setSettlementType] = useState<"replacement" | "cash">("replacement");
  const [cashBaht, setCashBaht] = useState("");
  const [replacementNote, setReplacementNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qty = Math.max(0, Math.min(loan.quantity, Math.floor(Number(returnedQty) || 0)));
  const shortage = loan.quantity - qty;

  async function save(): Promise<void> {
    setBusy(true); setErr(null);
    try {
      const settlement = shortage > 0
        ? settlementType === "cash"
          ? { settlementType: "cash" as const, cashAmountSatang: bahtToSatang(Number(cashBaht) || 0) }
          : { settlementType: "replacement" as const, replacementNote: replacementNote.trim() || undefined }
        : undefined;
      await api.returnLoan(loan.id, { returnedQty: qty, returnedAt, returnNote: returnNote.trim() || undefined, settlement });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } finally { setBusy(false); }
  }
  return (
    <Modal title="คืนสิ่งของ" sub={`${loan.loanNo} · ${loan.itemName} (ยืม ${loan.quantity})`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "กำลังบันทึก…" : "บันทึกการคืน"}</Button></>}>
      <div className="form-grid">
        <div className="field"><label>จำนวนที่คืน</label><input className="control tnum" value={returnedQty} onChange={(e) => setReturnedQty(e.target.value.replace(/[^0-9]/g, ""))} /></div>
        <div className="field"><label>วันที่คืน</label><input className="control tnum" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} /></div>
      </div>
      <div className="field"><label>หมายเหตุการคืน</label><input className="control" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} /></div>
      {shortage > 0 ? (
        <div style={{ marginTop: 4, padding: "12px 14px", borderRadius: "var(--r)", background: "var(--pending-tint)" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>คืนไม่ครบ (ขาด {shortage}) — ต้องระบุการชดใช้</div>
          <div className="seg" style={{ marginBottom: 10 }}>
            <button type="button" className={settlementType === "replacement" ? "active" : ""} onClick={() => setSettlementType("replacement")}>ซื้อมาชดใช้</button>
            <button type="button" className={settlementType === "cash" ? "active" : ""} onClick={() => setSettlementType("cash")}>จ่ายเป็นเงิน</button>
          </div>
          {settlementType === "cash" ? (
            <div className="field"><label>จำนวนเงินชดใช้ (บาท)</label><div className="input-prefix" style={{ maxWidth: 220 }}><span className="pfx">฿</span><input className="control tnum" value={cashBaht} onChange={(e) => setCashBaht(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></div></div>
          ) : (
            <div className="field"><label>รายละเอียดการซื้อมาชดใช้</label><input className="control" value={replacementNote} onChange={(e) => setReplacementNote(e.target.value)} placeholder="เช่น ซื้อเต็นท์ใหม่ 1 หลัง" /></div>
          )}
        </div>
      ) : null}
      {err ? <p className="error-text">{err}</p> : null}
    </Modal>
  );
}
