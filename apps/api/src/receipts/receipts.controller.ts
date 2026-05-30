import {
  Body,
  Controller,
  Get,
  Inject,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  RECEIPT_STATUSES,
  validateIssueReceipt,
  validateReissueReceipt,
  validateVoidReceipt,
  type ReceiptPreview,
} from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { ReceiptListQuery, ReceiptRecord, ReceiptsService } from "./receipts.service";

interface SerializedReceipt {
  id: string;
  donationId: string;
  receiptNo: string;
  status: string;
  issuedAt: string;
  supersededByReceiptId: string | null;
  createdAt: string;
  updatedAt: string;
}

function serializeReceipt(receipt: ReceiptRecord): SerializedReceipt {
  return {
    id: receipt.id,
    donationId: receipt.donationId,
    receiptNo: receipt.receiptNo,
    status: receipt.status,
    issuedAt: receipt.issuedAt.toISOString(),
    supersededByReceiptId: receipt.supersededByReceiptId,
    createdAt: receipt.createdAt.toISOString(),
    updatedAt: receipt.updatedAt.toISOString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseReceiptListQuery(raw: Record<string, unknown>): ReceiptListQuery {
  const query: ReceiptListQuery = {};
  if (typeof raw.donationId === "string" && UUID_RE.test(raw.donationId)) {
    query.donationId = raw.donationId;
  }
  if (typeof raw.status === "string" && (RECEIPT_STATUSES as readonly string[]).includes(raw.status)) {
    query.status = raw.status;
  }
  return query;
}

/** Reject a malformed :id path param with 422 before it reaches Postgres as an
 *  invalid-uuid cast (which would otherwise surface as a 500, not the error model). */
function assertUuidParam(id: string): void {
  if (!UUID_RE.test(id)) {
    throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
      { field: "id", message: "รูปแบบรหัสไม่ถูกต้อง" },
    ]);
  }
}

// Issuing/voiding/reissuing a financial document is restricted to admin/finance;
// reads (list/get/preview) are also open to staff.
const RECEIPT_WRITE_ROLES = ["admin", "finance"] as const;
const RECEIPT_READ_ROLES = ["admin", "finance", "staff"] as const;

@Controller("receipts")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class ReceiptsController {
  constructor(@Inject(ReceiptsService) private readonly receipts: ReceiptsService) {}

  @Post()
  @Roles(...RECEIPT_WRITE_ROLES)
  async issue(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ receipt: SerializedReceipt }> {
    const result = validateIssueReceipt(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const receipt = await this.receipts.issue(tenantId, user.sub, result.data.donationId, ip);
    return { receipt: serializeReceipt(receipt) };
  }

  @Get()
  @Roles(...RECEIPT_READ_ROLES)
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ receipts: SerializedReceipt[] }> {
    const receipts = await this.receipts.list(tenantId, parseReceiptListQuery(query));
    return { receipts: receipts.map(serializeReceipt) };
  }

  @Get(":id")
  @Roles(...RECEIPT_READ_ROLES)
  async getOne(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ receipt: SerializedReceipt }> {
    assertUuidParam(id);
    const receipt = await this.receipts.getById(tenantId, id);
    return { receipt: serializeReceipt(receipt) };
  }

  @Get(":id/preview")
  @Roles(...RECEIPT_READ_ROLES)
  async preview(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ preview: ReceiptPreview }> {
    assertUuidParam(id);
    const preview = await this.receipts.preview(tenantId, id);
    return { preview };
  }

  @Post(":id/void")
  @Roles(...RECEIPT_WRITE_ROLES)
  async void(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ receipt: SerializedReceipt }> {
    assertUuidParam(id);
    const result = validateVoidReceipt(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const receipt = await this.receipts.void(tenantId, user.sub, id, result.data.reason, ip);
    return { receipt: serializeReceipt(receipt) };
  }

  @Post(":id/reissue")
  @Roles(...RECEIPT_WRITE_ROLES)
  async reissue(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ superseded: SerializedReceipt; receipt: SerializedReceipt }> {
    assertUuidParam(id);
    const result = validateReissueReceipt(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const { superseded, created } = await this.receipts.reissue(
      tenantId,
      user.sub,
      id,
      result.data.reason,
      ip,
    );
    return { superseded: serializeReceipt(superseded), receipt: serializeReceipt(created) };
  }
}
