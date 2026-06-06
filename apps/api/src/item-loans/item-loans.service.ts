import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CreateBorrowableItemInput,
  type CreateLoanInput,
  isUuid,
  loanShortage,
  type ReturnLoanInput,
  type UpdateBorrowableItemInput,
} from "@wat/shared";
import { conflict, notFound, projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { allocateLoanNo } from "./item-loans-numbering";

export interface ItemRow {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  totalQty: number;
  status: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface ItemWithAvailable extends ItemRow {
  availableQty: number;
}

export interface SettlementRow {
  id: string;
  shortageQty: number;
  settlementType: string;
  cashAmountSatang: bigint | null;
  replacementNote: string | null;
  settledAt: Date;
  note: string | null;
}
export interface LoanRow {
  id: string;
  loanNo: string;
  itemId: string;
  itemName: string;
  borrowerName: string;
  borrowerPhone: string | null;
  quantity: number;
  borrowedAt: Date;
  dueAt: Date | null;
  borrowPhotoId: string | null;
  borrowPhotoIds: string[];
  status: string;
  returnedAt: Date | null;
  returnedQty: number | null;
  returnNote: string | null;
  shortageQty: number;
  settlement: SettlementRow | null;
  createdAt: Date;
  updatedAt: Date;
}

type LoanWithRelations = Prisma.ItemLoanGetPayload<{
  include: { item: { select: { name: true } }; settlements: true };
}>;

/** Borrow photos: the JSON array column if present, else the legacy single id, else []. */
function loanPhotoIds(raw: Prisma.JsonValue | null | undefined, primary: string | null): string[] {
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === "string");
  return primary ? [primary] : [];
}

function toLoanRow(loan: LoanWithRelations): LoanRow {
  const settlement = loan.settlements[0] ?? null;
  return {
    id: loan.id,
    loanNo: loan.loanNo,
    itemId: loan.itemId,
    itemName: loan.item.name,
    borrowerName: loan.borrowerName,
    borrowerPhone: loan.borrowerPhone,
    quantity: loan.quantity,
    borrowedAt: loan.borrowedAt,
    dueAt: loan.dueAt,
    borrowPhotoId: loan.borrowPhotoId,
    borrowPhotoIds: loanPhotoIds(loan.borrowPhotoIds, loan.borrowPhotoId),
    status: loan.status,
    returnedAt: loan.returnedAt,
    returnedQty: loan.returnedQty,
    returnNote: loan.returnNote,
    shortageQty: loan.returnedQty === null ? 0 : loanShortage(loan.quantity, loan.returnedQty),
    settlement: settlement
      ? {
          id: settlement.id,
          shortageQty: settlement.shortageQty,
          settlementType: settlement.settlementType,
          cashAmountSatang: settlement.cashAmountSatang,
          replacementNote: settlement.replacementNote,
          settledAt: settlement.settledAt,
          note: settlement.note,
        }
      : null,
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt,
  };
}

function itemSnapshot(item: ItemRow): Prisma.InputJsonObject {
  return { id: item.id, name: item.name, category: item.category, unit: item.unit, totalQty: item.totalQty, status: item.status, note: item.note };
}

@Injectable()
export class ItemLoansService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ---- items --------------------------------------------------------------

  async createItem(tenantId: string, actorUserId: string, input: CreateBorrowableItemInput, ip?: string): Promise<ItemWithAvailable> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const created = (await tx.borrowableItem.create({
        data: { ...input, tenantId } as Prisma.BorrowableItemUncheckedCreateInput,
      })) as ItemRow;
      await tx.auditLog.create({
        data: { tenantId, actorUserId, action: "item_loan:item:create", entityType: "borrowable_item", entityId: created.id, after: itemSnapshot(created), metadata: {}, ip },
      });
      return { ...created, availableQty: created.totalQty };
    });
  }

  async updateItem(tenantId: string, actorUserId: string, id: string, patch: UpdateBorrowableItemInput, ip?: string): Promise<ItemWithAvailable> {
    if (!isUuid(id)) throw notFound("ไม่พบสิ่งของ");
    return this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.borrowableItem.findFirst({ where: { id } })) as ItemRow | null;
      if (!before) throw notFound("ไม่พบสิ่งของ");
      const after = (await tx.borrowableItem.update({ where: { tenantId_id: { tenantId, id } }, data: { ...patch, updatedAt: new Date() } })) as ItemRow;
      await tx.auditLog.create({
        data: { tenantId, actorUserId, action: "item_loan:item:update", entityType: "borrowable_item", entityId: id, before: itemSnapshot(before), after: itemSnapshot(after), metadata: {}, ip },
      });
      const outstanding = await this.outstandingFor(tx, id);
      return { ...after, availableQty: after.totalQty - outstanding };
    });
  }

  async listItems(tenantId: string, query: { q?: string; status?: string }): Promise<ItemWithAvailable[]> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const where: Prisma.BorrowableItemWhereInput = {};
      if (query.status === "active" || query.status === "inactive") where.status = query.status;
      if (query.q) where.name = { contains: query.q, mode: "insensitive" };
      const items = (await tx.borrowableItem.findMany({ where, orderBy: [{ name: "asc" }], take: 500 })) as ItemRow[];
      const grouped = await tx.itemLoan.groupBy({ by: ["itemId"], where: { status: "borrowed" }, _sum: { quantity: true } });
      const outstanding = new Map(grouped.map((g) => [g.itemId, g._sum.quantity ?? 0]));
      return items.map((item) => ({ ...item, availableQty: item.totalQty - (outstanding.get(item.id) ?? 0) }));
    });
  }

  async getItem(tenantId: string, id: string): Promise<ItemWithAvailable> {
    if (!isUuid(id)) throw notFound("ไม่พบสิ่งของ");
    return this.prisma.withTenant(tenantId, async (tx) => {
      const item = (await tx.borrowableItem.findFirst({ where: { id } })) as ItemRow | null;
      if (!item) throw notFound("ไม่พบสิ่งของ");
      const outstanding = await this.outstandingFor(tx, id);
      return { ...item, availableQty: item.totalQty - outstanding };
    });
  }

  private async outstandingFor(tx: Prisma.TransactionClient, itemId: string): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ outstanding: number }>>`
      SELECT COALESCE(SUM(quantity), 0)::int AS outstanding
      FROM item_loans WHERE item_id = ${itemId}::uuid AND tenant_id = current_tenant_id() AND status = 'borrowed'`;
    return rows[0]?.outstanding ?? 0;
  }

  // ---- loans --------------------------------------------------------------

  /** Borrow: validates the photo + available qty under a row lock, allocates LOAN-NNNNNN. */
  async createLoan(tenantId: string, actorUserId: string, input: CreateLoanInput, ip?: string): Promise<LoanRow> {
    if (!isUuid(input.itemId)) throw notFound("ไม่พบสิ่งของ");
    const photoIds = [...new Set(input.borrowPhotoIds ?? (input.borrowPhotoId ? [input.borrowPhotoId] : []))];
    if (photoIds.length === 0 || !photoIds.every(isUuid)) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ต้องแนบรูปถ่ายตอนยืมก่อนบันทึก");
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Lock the item row so concurrent borrows of the same item serialize.
      const locked = await tx.$queryRaw<Array<{ total_qty: number; status: string }>>`
        SELECT total_qty, status FROM borrowable_items
        WHERE id = ${input.itemId}::uuid AND tenant_id = current_tenant_id() FOR UPDATE`;
      const item = locked[0];
      if (!item) throw notFound("ไม่พบสิ่งของ");
      if (item.status !== "active") throw conflict("สิ่งของนี้ถูกปิดใช้งานแล้ว ยืมไม่ได้");

      // All photos must already be uploaded for this tenant (ถ่ายรูปก่อนยืม).
      const found = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM attachments
        WHERE id IN (${Prisma.join(photoIds.map((id) => Prisma.sql`${id}::uuid`))}) AND tenant_id = current_tenant_id()`);
      if (found.length !== photoIds.length) throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ไม่พบรูปที่แนบ กรุณาอัปโหลดรูปก่อนยืม");

      const outstanding = await this.outstandingFor(tx, input.itemId);
      const available = item.total_qty - outstanding;
      if (input.quantity > available) {
        throw conflict(`ยืมได้ไม่เกินจำนวนคงเหลือ (คงเหลือ ${available})`);
      }

      const loanNo = await allocateLoanNo(tx, tenantId);
      const created = await tx.itemLoan.create({
        data: {
          tenantId,
          loanNo,
          itemId: input.itemId,
          borrowerName: input.borrowerName,
          borrowerPhone: input.borrowerPhone ?? null,
          quantity: input.quantity,
          borrowedAt: new Date(`${input.borrowedAt}T00:00:00.000Z`),
          dueAt: input.dueAt ? new Date(`${input.dueAt}T00:00:00.000Z`) : null,
          borrowPhotoId: photoIds[0],
          borrowPhotoIds: photoIds as unknown as Prisma.InputJsonValue,
          status: "borrowed",
          note: input.note ?? null,
        },
        include: { item: { select: { name: true } }, settlements: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "item_loan:create",
          entityType: "item_loan",
          entityId: created.id,
          after: { loanNo, itemId: input.itemId, borrowerName: input.borrowerName, quantity: input.quantity, borrowPhotoIds: photoIds } as Prisma.InputJsonObject,
          metadata: {},
          ip,
        },
      });
      return toLoanRow(created);
    });
  }

  /** Return: closes the loan; a shortage (returnedQty < quantity) requires a settlement. */
  async returnLoan(tenantId: string, actorUserId: string, loanId: string, input: ReturnLoanInput, ip?: string): Promise<LoanRow> {
    if (!isUuid(loanId)) throw notFound("ไม่พบรายการยืม");
    return this.prisma.withTenant(tenantId, async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; quantity: number; status: string }>>`
        SELECT id, quantity, status FROM item_loans
        WHERE id = ${loanId}::uuid AND tenant_id = current_tenant_id() FOR UPDATE`;
      const loan = locked[0];
      if (!loan) throw notFound("ไม่พบรายการยืม");
      if (loan.status !== "borrowed") throw conflict("รายการนี้คืนแล้ว");
      if (input.returnedQty > loan.quantity) {
        throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "จำนวนที่คืนมากกว่าที่ยืม");
      }

      const shortage = loanShortage(loan.quantity, input.returnedQty);
      if (shortage > 0 && !input.settlement) {
        throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "คืนไม่ครบ ต้องระบุการชดใช้ (ซื้อมาคืน หรือจ่ายเงิน)", [
          { field: "settlement", message: "ต้องระบุการชดใช้กรณีคืนไม่ครบ" },
        ]);
      }

      const updated = await tx.itemLoan.update({
        where: { tenantId_id: { tenantId, id: loanId } },
        data: {
          status: "returned",
          returnedAt: new Date(`${input.returnedAt}T00:00:00.000Z`),
          returnedQty: input.returnedQty,
          returnNote: input.returnNote ?? null,
          updatedAt: new Date(),
        },
        include: { item: { select: { name: true } }, settlements: true },
      });

      if (shortage > 0 && input.settlement) {
        const s = input.settlement;
        await tx.itemLoanSettlement.create({
          data: {
            tenantId,
            loanId,
            shortageQty: shortage,
            settlementType: s.settlementType,
            cashAmountSatang: s.settlementType === "cash" && s.cashAmountSatang != null ? BigInt(s.cashAmountSatang) : null,
            replacementNote: s.settlementType === "replacement" ? s.replacementNote ?? null : null,
            settledAt: new Date(`${input.returnedAt}T00:00:00.000Z`),
            note: s.note ?? null,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: "item_loan:settle",
            entityType: "item_loan",
            entityId: loanId,
            after: { shortageQty: shortage, settlementType: s.settlementType, cashAmountSatang: s.cashAmountSatang ?? null } as Prisma.InputJsonObject,
            metadata: {},
            ip,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "item_loan:return",
          entityType: "item_loan",
          entityId: loanId,
          after: { returnedQty: input.returnedQty, shortageQty: shortage } as Prisma.InputJsonObject,
          metadata: {},
          ip,
        },
      });

      // Re-read with the (possibly just-created) settlement included.
      const full = (await tx.itemLoan.findFirst({
        where: { id: loanId },
        include: { item: { select: { name: true } }, settlements: true },
      })) as LoanWithRelations;
      return toLoanRow(full ?? updated);
    });
  }

  async listLoans(tenantId: string, query: { itemId?: string; status?: string; q?: string }): Promise<LoanRow[]> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const where: Prisma.ItemLoanWhereInput = {};
      if (query.itemId && isUuid(query.itemId)) where.itemId = query.itemId;
      if (query.status === "borrowed" || query.status === "returned") where.status = query.status;
      if (query.q) where.borrowerName = { contains: query.q, mode: "insensitive" };
      const loans = (await tx.itemLoan.findMany({
        where,
        include: { item: { select: { name: true } }, settlements: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 500,
      })) as LoanWithRelations[];
      return loans.map(toLoanRow);
    });
  }

  async getLoan(tenantId: string, id: string): Promise<LoanRow> {
    if (!isUuid(id)) throw notFound("ไม่พบรายการยืม");
    const loan = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.itemLoan.findFirst({ where: { id }, include: { item: { select: { name: true } }, settlements: true } }),
    )) as LoanWithRelations | null;
    if (!loan) throw notFound("ไม่พบรายการยืม");
    return toLoanRow(loan);
  }
}
