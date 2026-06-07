import { Body, Controller, Get, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import { type PublicEventSummary, validateDevoteeItemLoanRequest } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { projectHttpException, unauthorized } from "../common/errors/project-error";
import { LoanRow } from "../item-loans/item-loans.service";
import { CurrentDevotee } from "./decorators/current-devotee.decorator";
import { DevoteeGuard } from "./guards/devotee.guard";
import { DevoteeBorrowableItemView, DevoteeItemLoansService } from "./devotee-item-loans.service";
import { DevoteePrincipal } from "./types/devotee-request";
import { assertUuidParam } from "../platform/uuid-param";

interface SerializedRequest {
  id: string;
  loanNo: string;
  itemId: string;
  itemName: string;
  quantity: number;
  borrowedAt: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
}

function serialize(loan: LoanRow): SerializedRequest {
  return {
    id: loan.id,
    loanNo: loan.loanNo,
    itemId: loan.itemId,
    itemName: loan.itemName,
    quantity: loan.quantity,
    borrowedAt: loan.borrowedAt ? loan.borrowedAt.toISOString().slice(0, 10) : null,
    dueAt: loan.dueAt ? loan.dueAt.toISOString().slice(0, 10) : null,
    status: loan.status,
    createdAt: loan.createdAt.toISOString(),
  };
}

/**
 * Devotee-facing browse + borrow-request for a selected temple. Mounts ONLY
 * DevoteeGuard (+ RateLimitGuard). Reads expose public-safe columns; the request
 * write is server-controlled (status=requested, no stock decrement, no photo).
 */
@Controller("devotee/temples/:templeId")
@UseGuards(DevoteeGuard, RateLimitGuard)
export class DevoteeItemLoansController {
  constructor(@Inject(DevoteeItemLoansService) private readonly service: DevoteeItemLoansService) {}

  @Get("borrowable-items")
  async items(@Param("templeId") templeId: string): Promise<{ items: DevoteeBorrowableItemView[] }> {
    return { items: await this.service.listItems(assertUuidParam(templeId)) };
  }

  @Get("events")
  async events(@Param("templeId") templeId: string): Promise<{ events: PublicEventSummary[] }> {
    return { events: await this.service.listEvents(assertUuidParam(templeId)) };
  }

  @Post("item-loans")
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async request(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
    @Param("templeId") templeId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ request: SerializedRequest }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    const result = validateDevoteeItemLoanRequest(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { request: serialize(await this.service.request(devotee, assertUuidParam(templeId), result.data, ip)) };
  }
}
