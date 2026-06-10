import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuditLogListItem, AuditService } from "./audit.service";

interface SerializedAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

function serialize(item: AuditLogListItem): SerializedAuditLog {
  return {
    id: item.id,
    action: item.action,
    entityType: item.entityType,
    entityId: item.entityId,
    actorType: item.actorType,
    actorName: item.actorName,
    actorRole: item.actorRole,
    reason: item.reason,
    ip: item.ip,
    createdAt: item.createdAt.toISOString(),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Action names are short ascii like "donation:void" — bound what reaches SQL.
const ACTION_PREFIX_RE = /^[a-z_:.-]{1,40}$/;

/**
 * ประวัติการแก้ไข — read-only view of the tenant audit trail. Reading the
 * money trail is admin/finance work; the trail itself stays append-only at
 * the DB grant level regardless of role.
 */
@Controller("audit")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @Roles("admin", "finance")
  async list(
    @CurrentTenant() tenantId: string,
    @Query("actionPrefix") actionPrefix?: string,
    @Query("entityId") entityId?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ): Promise<{ logs: SerializedAuditLog[] }> {
    if (actionPrefix !== undefined && !ACTION_PREFIX_RE.test(actionPrefix)) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "actionPrefix", message: "รูปแบบตัวกรองไม่ถูกต้อง" },
      ]);
    }
    if (entityId !== undefined && !UUID_RE.test(entityId)) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "entityId", message: "รูปแบบรหัสไม่ถูกต้อง" },
      ]);
    }
    const takeNum = take !== undefined ? Number(take) : undefined;
    const skipNum = skip !== undefined ? Number(skip) : undefined;
    if (
      (takeNum !== undefined && (!Number.isInteger(takeNum) || takeNum < 1)) ||
      (skipNum !== undefined && (!Number.isInteger(skipNum) || skipNum < 0))
    ) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "take/skip", message: "ค่าการแบ่งหน้าไม่ถูกต้อง" },
      ]);
    }

    const logs = await this.audit.list(tenantId, {
      ...(actionPrefix ? { actionPrefix } : {}),
      ...(entityId ? { entityId } : {}),
      ...(takeNum !== undefined ? { take: takeNum } : {}),
      ...(skipNum !== undefined ? { skip: skipNum } : {}),
    });
    return { logs: logs.map(serialize) };
  }
}
