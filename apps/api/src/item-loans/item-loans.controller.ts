import { Body, Controller, Get, Inject, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  isUuid,
  validateCreateBorrowableItem,
  validateCreateLoan,
  validateReturnLoan,
  validateUpdateBorrowableItem,
} from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { notFound, projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { ItemLoansService, ItemWithAvailable, LoanRow } from "./item-loans.service";

const WRITE_ROLES = ["admin", "finance", "staff"] as const;
const READ_ROLES = ["admin", "finance", "staff"] as const;

const date = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

interface SerializedItem {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  totalQty: number;
  availableQty: number;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedSettlement {
  id: string;
  shortageQty: number;
  settlementType: string;
  cashAmountSatang: string | null;
  replacementNote: string | null;
  settledAt: string | null;
  note: string | null;
}

interface SerializedLoan {
  id: string;
  loanNo: string;
  itemId: string;
  itemName: string;
  borrowerName: string;
  borrowerPhone: string | null;
  quantity: number;
  borrowedAt: string | null;
  dueAt: string | null;
  borrowPhotoId: string | null;
  status: string;
  returnedAt: string | null;
  returnedQty: number | null;
  returnNote: string | null;
  shortageQty: number;
  settlement: SerializedSettlement | null;
  createdAt: string;
  updatedAt: string;
}

function serializeItem(item: ItemWithAvailable): SerializedItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    totalQty: item.totalQty,
    availableQty: item.availableQty,
    status: item.status,
    note: item.note,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeLoan(loan: LoanRow): SerializedLoan {
  return {
    id: loan.id,
    loanNo: loan.loanNo,
    itemId: loan.itemId,
    itemName: loan.itemName,
    borrowerName: loan.borrowerName,
    borrowerPhone: loan.borrowerPhone,
    quantity: loan.quantity,
    borrowedAt: date(loan.borrowedAt),
    dueAt: date(loan.dueAt),
    borrowPhotoId: loan.borrowPhotoId,
    status: loan.status,
    returnedAt: date(loan.returnedAt),
    returnedQty: loan.returnedQty,
    returnNote: loan.returnNote,
    shortageQty: loan.shortageQty,
    settlement: loan.settlement
      ? {
          id: loan.settlement.id,
          shortageQty: loan.settlement.shortageQty,
          settlementType: loan.settlement.settlementType,
          cashAmountSatang: loan.settlement.cashAmountSatang === null ? null : loan.settlement.cashAmountSatang.toString(),
          replacementNote: loan.settlement.replacementNote,
          settledAt: date(loan.settlement.settledAt),
          note: loan.settlement.note,
        }
      : null,
    createdAt: loan.createdAt.toISOString(),
    updatedAt: loan.updatedAt.toISOString(),
  };
}

function assertUuid(id: string): void {
  if (!isUuid(id)) throw notFound("ไม่พบข้อมูล");
}

@Controller("item-loans")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class ItemLoansController {
  constructor(@Inject(ItemLoansService) private readonly service: ItemLoansService) {}

  // ---- items ----
  @Post("items")
  @Roles(...WRITE_ROLES)
  async createItem(@CurrentUser() user: AuthenticatedUser, @CurrentTenant() tenantId: string, @Ip() ip: string, @Body() body: unknown) {
    const result = validateCreateBorrowableItem(body);
    if (!result.success) throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    return { item: serializeItem(await this.service.createItem(tenantId, user.sub, result.data, ip)) };
  }

  @Get("items")
  @Roles(...READ_ROLES)
  async listItems(@CurrentTenant() tenantId: string, @Query() query: Record<string, unknown>) {
    const q = typeof query.q === "string" ? query.q : undefined;
    const status = typeof query.status === "string" ? query.status : undefined;
    return { items: (await this.service.listItems(tenantId, { q, status })).map(serializeItem) };
  }

  @Get("items/:id")
  @Roles(...READ_ROLES)
  async getItem(@CurrentTenant() tenantId: string, @Param("id") id: string) {
    assertUuid(id);
    return { item: serializeItem(await this.service.getItem(tenantId, id)) };
  }

  @Patch("items/:id")
  @Roles(...WRITE_ROLES)
  async updateItem(@CurrentUser() user: AuthenticatedUser, @CurrentTenant() tenantId: string, @Ip() ip: string, @Param("id") id: string, @Body() body: unknown) {
    assertUuid(id);
    const result = validateUpdateBorrowableItem(body);
    if (!result.success) throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    return { item: serializeItem(await this.service.updateItem(tenantId, user.sub, id, result.data, ip)) };
  }

  // ---- loans ----
  @Post("loans")
  @Roles(...WRITE_ROLES)
  async createLoan(@CurrentUser() user: AuthenticatedUser, @CurrentTenant() tenantId: string, @Ip() ip: string, @Body() body: unknown) {
    const result = validateCreateLoan(body);
    if (!result.success) throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    return { loan: serializeLoan(await this.service.createLoan(tenantId, user.sub, result.data, ip)) };
  }

  @Get("loans")
  @Roles(...READ_ROLES)
  async listLoans(@CurrentTenant() tenantId: string, @Query() query: Record<string, unknown>) {
    return {
      loans: (
        await this.service.listLoans(tenantId, {
          itemId: typeof query.itemId === "string" ? query.itemId : undefined,
          status: typeof query.status === "string" ? query.status : undefined,
          q: typeof query.q === "string" ? query.q : undefined,
        })
      ).map(serializeLoan),
    };
  }

  @Get("loans/:id")
  @Roles(...READ_ROLES)
  async getLoan(@CurrentTenant() tenantId: string, @Param("id") id: string) {
    assertUuid(id);
    return { loan: serializeLoan(await this.service.getLoan(tenantId, id)) };
  }

  @Post("loans/:id/return")
  @Roles(...WRITE_ROLES)
  async returnLoan(@CurrentUser() user: AuthenticatedUser, @CurrentTenant() tenantId: string, @Ip() ip: string, @Param("id") id: string, @Body() body: unknown) {
    assertUuid(id);
    const result = validateReturnLoan(body);
    if (!result.success) throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    return { loan: serializeLoan(await this.service.returnLoan(tenantId, user.sub, id, result.data, ip)) };
  }
}
