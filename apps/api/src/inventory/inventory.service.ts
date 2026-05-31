import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CreateItemInput,
  type CreateMovementInput,
  type ItemSearchQuery,
  type UpdateItemInput,
} from "@wat/shared";
import { conflict, notFound } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface ItemRecord {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  quantity: number;
  status: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MovementRecord {
  id: string;
  itemId: string;
  movementType: string;
  quantity: number;
  balanceAfter: number;
  movementDate: Date;
  reason: string | null;
  reference: string | null;
  note: string | null;
  createdAt: Date;
}

// Safely below int4 max (2,147,483,647); a cumulative balance beyond this is
// rejected (409) so it can never overflow the integer column as a raw 500.
const MAX_INVENTORY_BALANCE = 2_000_000_000;

function itemSnapshot(item: ItemRecord): Prisma.InputJsonObject {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    quantity: item.quantity,
    status: item.status,
    note: item.note,
  };
}

function movementSnapshot(movement: MovementRecord): Prisma.InputJsonObject {
  return {
    id: movement.id,
    itemId: movement.itemId,
    movementType: movement.movementType,
    quantity: movement.quantity,
    balanceAfter: movement.balanceAfter,
    movementDate: movement.movementDate.toISOString().slice(0, 10),
    reason: movement.reason,
    reference: movement.reference,
    note: movement.note,
  };
}

@Injectable()
export class InventoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createItem(
    tenantId: string,
    actorUserId: string,
    input: CreateItemInput,
    ip?: string,
  ): Promise<ItemRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const created = (await tx.inventoryItem.create({
        // quantity is NOT settable here — it starts at 0 and only changes via movements.
        data: { ...input, tenantId } as Prisma.InventoryItemUncheckedCreateInput,
      })) as ItemRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "inventory:item:create",
          entityType: "inventory_item",
          entityId: created.id,
          after: itemSnapshot(created),
          metadata: {},
          ip,
        },
      });

      return created;
    });
  }

  async listItems(tenantId: string, query: ItemSearchQuery): Promise<ItemRecord[]> {
    const where: Prisma.InventoryItemWhereInput = {};
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.q) where.name = { contains: query.q, mode: "insensitive" };

    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.inventoryItem.findMany({
        where,
        orderBy: [{ name: "asc" }],
        take: query.take ?? 200,
        skip: query.skip ?? 0,
      }),
    )) as ItemRecord[];
  }

  async getItem(tenantId: string, id: string): Promise<ItemRecord> {
    const item = (await this.prisma.withTenant(tenantId, (tx) =>
      tx.inventoryItem.findFirst({ where: { id } }),
    )) as ItemRecord | null;
    if (!item) {
      throw notFound("ไม่พบรายการพัสดุ");
    }
    return item;
  }

  async updateItem(
    tenantId: string,
    actorUserId: string,
    id: string,
    patch: UpdateItemInput,
    ip?: string,
  ): Promise<ItemRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.inventoryItem.findFirst({ where: { id } })) as ItemRecord | null;
      if (!before) {
        throw notFound("ไม่พบรายการพัสดุ");
      }

      let after: ItemRecord;
      try {
        after = (await tx.inventoryItem.update({
          where: { id },
          data: { ...patch, updatedAt: new Date() },
        })) as ItemRecord;
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw notFound("ไม่พบรายการพัสดุ");
        }
        throw error;
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "inventory:item:update",
          entityType: "inventory_item",
          entityId: id,
          before: itemSnapshot(before),
          after: itemSnapshot(after),
          metadata: {},
          ip,
        },
      });

      return after;
    });
  }

  async listMovements(tenantId: string, itemId: string): Promise<MovementRecord[]> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const item = await tx.inventoryItem.findFirst({ where: { id: itemId }, select: { id: true } });
      if (!item) {
        throw notFound("ไม่พบรายการพัสดุ");
      }
      return (await tx.inventoryMovement.findMany({
        where: { itemId },
        // id tiebreaker keeps ordering stable when createdAt collides under load
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 500,
      })) as MovementRecord[];
    });
  }

  /**
   * Record a stock movement and update the item balance ATOMICALLY. The item row
   * is locked FOR UPDATE so concurrent movements on the same item serialize (no
   * lost update, no negative-balance race). Issuing more than on hand -> 409.
   */
  async recordMovement(
    tenantId: string,
    actorUserId: string,
    itemId: string,
    input: CreateMovementInput,
    ip?: string,
  ): Promise<{ movement: MovementRecord; item: ItemRecord }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // RLS-scoped row lock; the explicit tenant_id predicate is defence-in-depth
      // beyond RLS. 0 rows if the item is missing or belongs to another tenant.
      const locked = await tx.$queryRaw<Array<{ quantity: number; status: string }>>`
        SELECT quantity, status FROM inventory_items
        WHERE id = ${itemId}::uuid AND tenant_id = current_tenant_id()
        FOR UPDATE`;
      const current = locked[0];
      if (!current) {
        throw notFound("ไม่พบรายการพัสดุ");
      }
      if (current.status !== "active") {
        throw conflict("รายการนี้ถูกเก็บถาวรแล้ว ไม่สามารถเคลื่อนไหวสต็อกได้");
      }

      const delta = input.movementType === "receive" ? input.quantity : -input.quantity;
      const newBalance = current.quantity + delta;
      if (newBalance < 0) {
        throw conflict("ยอดคงเหลือไม่พอสำหรับการเบิกออก");
      }
      if (newBalance > MAX_INVENTORY_BALANCE) {
        throw conflict("ยอดคงเหลือเกินกว่าที่ระบบรองรับ");
      }

      // Composite (tenant_id, id) keys the update so tenant correctness is in the
      // statement, not only via RLS. The returned row is authoritative (no re-read).
      const item = (await tx.inventoryItem.update({
        where: { tenantId_id: { tenantId, id: itemId } },
        data: { quantity: newBalance, updatedAt: new Date() },
      })) as ItemRecord;

      const movement = (await tx.inventoryMovement.create({
        data: {
          tenantId,
          itemId,
          movementType: input.movementType,
          quantity: input.quantity,
          balanceAfter: newBalance,
          movementDate: new Date(`${input.movementDate}T00:00:00.000Z`),
          reason: input.reason ?? null,
          reference: input.reference ?? null,
          note: input.note ?? null,
        },
      })) as MovementRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "inventory:movement:create",
          entityType: "inventory_movement",
          entityId: movement.id,
          after: movementSnapshot(movement),
          metadata: {},
          ip,
        },
      });

      return { movement, item };
    });
  }
}
