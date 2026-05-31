import { Body, Controller, Get, Inject, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  isUuid,
  parseItemQuery,
  validateCreateItem,
  validateCreateMovement,
  validateUpdateItem,
} from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { notFound, projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { InventoryService, ItemRecord, MovementRecord } from "./inventory.service";

const INVENTORY_WRITE_ROLES = ["admin", "staff"] as const;
const INVENTORY_READ_ROLES = ["admin", "finance", "staff"] as const;

interface SerializedItem {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  quantity: number;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedMovement {
  id: string;
  itemId: string;
  movementType: string;
  quantity: number;
  balanceAfter: number;
  movementDate: string;
  reason: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

function serializeItem(item: ItemRecord): SerializedItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    quantity: item.quantity,
    status: item.status,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeMovement(movement: MovementRecord): SerializedMovement {
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
    createdAt: movement.createdAt.toISOString(),
  };
}

function assertUuid(id: string): void {
  if (!isUuid(id)) {
    throw notFound("ไม่พบรายการพัสดุ");
  }
}

@Controller("inventory")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Post("items")
  @Roles(...INVENTORY_WRITE_ROLES)
  async createItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ item: SerializedItem }> {
    const result = validateCreateItem(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { item: serializeItem(await this.inventory.createItem(tenantId, user.sub, result.data, ip)) };
  }

  @Get("items")
  @Roles(...INVENTORY_READ_ROLES)
  async listItems(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ items: SerializedItem[] }> {
    const rows = await this.inventory.listItems(tenantId, parseItemQuery(query));
    return { items: rows.map(serializeItem) };
  }

  @Get("items/:id")
  @Roles(...INVENTORY_READ_ROLES)
  async getItem(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ item: SerializedItem }> {
    assertUuid(id);
    return { item: serializeItem(await this.inventory.getItem(tenantId, id)) };
  }

  @Patch("items/:id")
  @Roles(...INVENTORY_WRITE_ROLES)
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ item: SerializedItem }> {
    assertUuid(id);
    const result = validateUpdateItem(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { item: serializeItem(await this.inventory.updateItem(tenantId, user.sub, id, result.data, ip)) };
  }

  @Get("items/:id/movements")
  @Roles(...INVENTORY_READ_ROLES)
  async listMovements(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ movements: SerializedMovement[] }> {
    assertUuid(id);
    const rows = await this.inventory.listMovements(tenantId, id);
    return { movements: rows.map(serializeMovement) };
  }

  @Post("items/:id/movements")
  @Roles(...INVENTORY_WRITE_ROLES)
  async recordMovement(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ movement: SerializedMovement; item: SerializedItem }> {
    assertUuid(id);
    const result = validateCreateMovement(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const { movement, item } = await this.inventory.recordMovement(tenantId, user.sub, id, result.data, ip);
    return { movement: serializeMovement(movement), item: serializeItem(item) };
  }
}
