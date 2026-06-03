import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CreateItemInput,
  type CreateMovementInput,
  type CreateRoomInput,
  type ImportItemInput,
  isUuid,
  type ItemSearchQuery,
  type UpdateItemInput,
  type UpdateRoomInput,
} from "@wat/shared";
import { conflict, notFound, projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";

export interface ItemRecord {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  quantity: number;
  status: string;
  note: string | null;
  roomId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomRecord {
  id: string;
  name: string;
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
    roomId: item.roomId,
  };
}

function roomSnapshot(room: RoomRecord): Prisma.InputJsonObject {
  return { id: room.id, name: room.name, note: room.note };
}

/** Validate an item's room belongs to this tenant (FK + RLS back this; this gives a clean 422). */
async function ensureRoom(tx: Prisma.TransactionClient, roomId: string): Promise<void> {
  if (!isUuid(roomId)) throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ห้อง/โรงเก็บไม่ถูกต้อง");
  const found = await tx.storageRoom.findFirst({ where: { id: roomId }, select: { id: true } });
  if (!found) throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ไม่พบห้อง/โรงเก็บที่เลือก");
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
      if (input.roomId) await ensureRoom(tx, input.roomId);
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
      if (typeof patch.roomId === "string" && patch.roomId) await ensureRoom(tx, patch.roomId);

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

  // ---- storage rooms (ห้อง/โรงเก็บ) ----------------------------------------

  async createRoom(tenantId: string, actorUserId: string, input: CreateRoomInput, ip?: string): Promise<RoomRecord> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      let created: RoomRecord;
      try {
        created = (await tx.storageRoom.create({ data: { ...input, tenantId } as Prisma.StorageRoomUncheckedCreateInput })) as RoomRecord;
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("มีห้อง/โรงเก็บชื่อนี้แล้ว");
        throw error;
      }
      await tx.auditLog.create({ data: { tenantId, actorUserId, action: "inventory:room:create", entityType: "storage_room", entityId: created.id, after: roomSnapshot(created), metadata: {}, ip } });
      return created;
    });
  }

  async listRooms(tenantId: string): Promise<Array<RoomRecord & { itemCount: number }>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const rooms = (await tx.storageRoom.findMany({ orderBy: [{ name: "asc" }], take: 500 })) as RoomRecord[];
      const grouped = await tx.inventoryItem.groupBy({ by: ["roomId"], _count: { _all: true } });
      const counts = new Map(grouped.filter((g) => g.roomId).map((g) => [g.roomId as string, g._count._all]));
      return rooms.map((r) => ({ ...r, itemCount: counts.get(r.id) ?? 0 }));
    });
  }

  async updateRoom(tenantId: string, actorUserId: string, id: string, patch: UpdateRoomInput, ip?: string): Promise<RoomRecord> {
    if (!isUuid(id)) throw notFound("ไม่พบห้อง/โรงเก็บ");
    return this.prisma.withTenant(tenantId, async (tx) => {
      const before = (await tx.storageRoom.findFirst({ where: { id } })) as RoomRecord | null;
      if (!before) throw notFound("ไม่พบห้อง/โรงเก็บ");
      let after: RoomRecord;
      try {
        after = (await tx.storageRoom.update({ where: { tenantId_id: { tenantId, id } }, data: { ...patch, updatedAt: new Date() } })) as RoomRecord;
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict("มีห้อง/โรงเก็บชื่อนี้แล้ว");
        throw error;
      }
      await tx.auditLog.create({ data: { tenantId, actorUserId, action: "inventory:room:update", entityType: "storage_room", entityId: id, before: roomSnapshot(before), after: roomSnapshot(after), metadata: {}, ip } });
      return after;
    });
  }

  /**
   * Bulk import (นำเข้า Excel): resolve/create rooms by name, create each item, and record an
   * initial `receive` movement for any positive quantity so the balance stays movement-backed.
   * Atomic — the whole import succeeds or rolls back.
   */
  async importItems(
    tenantId: string,
    actorUserId: string,
    rows: ImportItemInput[],
    ip?: string,
  ): Promise<{ itemsCreated: number; roomsCreated: number }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.storageRoom.findMany({ select: { id: true, name: true } });
      const roomByName = new Map(existing.map((r) => [r.name, r.id]));
      let roomsCreated = 0;
      const movementDate = new Date();

      for (const row of rows) {
        let roomId: string | null = null;
        if (row.roomName) {
          let rid = roomByName.get(row.roomName);
          if (!rid) {
            const room = await tx.storageRoom.create({ data: { tenantId, name: row.roomName } as Prisma.StorageRoomUncheckedCreateInput });
            rid = room.id;
            roomByName.set(row.roomName, rid);
            roomsCreated += 1;
            await tx.auditLog.create({ data: { tenantId, actorUserId, action: "inventory:room:create", entityType: "storage_room", entityId: rid, after: { id: rid, name: row.roomName } as Prisma.InputJsonObject, metadata: { via: "import" }, ip } });
          }
          roomId = rid;
        }
        const item = (await tx.inventoryItem.create({
          data: { tenantId, name: row.name, category: row.category ?? "other", unit: row.unit ?? null, note: row.note ?? null, roomId } as Prisma.InventoryItemUncheckedCreateInput,
        })) as ItemRecord;
        const qty = row.quantity ?? 0;
        if (qty > 0) {
          await tx.inventoryItem.update({ where: { tenantId_id: { tenantId, id: item.id } }, data: { quantity: qty } });
          await tx.inventoryMovement.create({
            data: { tenantId, itemId: item.id, movementType: "receive", quantity: qty, balanceAfter: qty, movementDate, reason: "นำเข้าจาก Excel", reference: null, note: null },
          });
        }
      }

      await tx.auditLog.create({ data: { tenantId, actorUserId, action: "inventory:import", entityType: "inventory_item", entityId: null, after: { itemsCreated: rows.length, roomsCreated } as Prisma.InputJsonObject, metadata: {}, ip } });
      return { itemsCreated: rows.length, roomsCreated };
    });
  }
}
