import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Ip,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  isAttachmentOwnerType,
  isUuid,
  sanitizeFileName,
  validateDeleteAttachment,
  validateUploadAttachment,
  type AttachmentOwnerType,
} from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { notFound, projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { AttachmentRecord, AttachmentsService } from "./attachments.service";

interface SerializedAttachment {
  id: string;
  ownerType: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  byteSize: string;
  createdAt: string;
}

interface ResponseHeaders {
  set(headers: Record<string, string>): void;
}

function serialize(record: AttachmentRecord): SerializedAttachment {
  return {
    id: record.id,
    ownerType: record.ownerType,
    ownerId: record.ownerId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteSize: record.byteSize.toString(),
    createdAt: record.createdAt.toISOString(),
  };
}

function assertUuid(id: string): void {
  if (!isUuid(id)) {
    throw notFound("ไม่พบไฟล์แนบ");
  }
}

// Evidence files for finance/operations entities -> any tenant member may manage.
@Controller("attachments")
@UseGuards(AuthGuard, TenantGuard, RolesGuard, RateLimitGuard)
@Roles("admin", "finance", "staff")
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachments: AttachmentsService) {}

  // Upload is the heaviest endpoint (a ~6.7MB body buffered per call) -> rate-limit
  // per user. RateLimitGuard runs after AuthGuard, so the key is the user id.
  @Post()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async upload(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ attachment: SerializedAttachment }> {
    const result = validateUploadAttachment(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { attachment: serialize(await this.attachments.upload(tenantId, actor.sub, result.data, ip)) };
  }

  @Get()
  async list(
    @CurrentTenant() tenantId: string,
    @Query("ownerType") ownerType: string,
    @Query("ownerId") ownerId: string,
  ): Promise<{ attachments: SerializedAttachment[] }> {
    if (!isAttachmentOwnerType(ownerType) || !isUuid(ownerId)) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "ownerType/ownerId", message: "ต้องระบุ ownerType และ ownerId ที่ถูกต้อง" },
      ]);
    }
    const rows = await this.attachments.listByOwner(tenantId, ownerType as AttachmentOwnerType, ownerId);
    return { attachments: rows.map(serialize) };
  }

  @Get(":id/download")
  async download(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: ResponseHeaders,
  ): Promise<StreamableFile> {
    assertUuid(id);
    const file = await this.attachments.download(tenantId, id);
    const safe = sanitizeFileName(file.fileName);
    // RFC 5987: an ASCII-only fallback (a Thai name has no Latin-1 bytes and would
    // make res.set throw ERR_INVALID_CHAR -> 500) plus a UTF-8 percent-encoded form.
    const asciiFallback = safe.replace(/[^\x20-\x7e]/g, "_");
    res.set({
      "Content-Type": file.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
    });
    return new StreamableFile(file.data);
  }

  @Delete(":id")
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ deleted: true }> {
    assertUuid(id);
    const parsed = validateDeleteAttachment(body);
    if (!parsed.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", parsed.errors);
    }
    await this.attachments.remove(tenantId, actor.sub, actor.role, id, parsed.data.reason, ip);
    return { deleted: true };
  }
}
