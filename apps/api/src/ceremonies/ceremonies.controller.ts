import { Body, Controller, Get, Inject, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { isUuid, parseCeremonyQuery, validateCreateCeremony, validateUpdateCeremony } from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { notFound, projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { CeremonyRecord, CeremoniesService } from "./ceremonies.service";

const CEREMONY_WRITE_ROLES = ["admin", "staff"] as const;
const CEREMONY_READ_ROLES = ["admin", "finance", "staff"] as const;

interface SerializedCeremony {
  id: string;
  ceremonyType: string;
  status: string;
  title: string;
  ceremonyDate: string;
  timeNote: string | null;
  location: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  assignedMonks: string | null;
  monkCount: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(record: CeremonyRecord): SerializedCeremony {
  return {
    id: record.id,
    ceremonyType: record.ceremonyType,
    status: record.status,
    title: record.title,
    ceremonyDate: record.ceremonyDate.toISOString().slice(0, 10),
    timeNote: record.timeNote,
    location: record.location,
    requesterName: record.requesterName,
    requesterPhone: record.requesterPhone,
    assignedMonks: record.assignedMonks,
    monkCount: record.monkCount,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function assertUuid(id: string): void {
  if (!isUuid(id)) {
    throw notFound("ไม่พบงานพิธี");
  }
}

@Controller("ceremonies")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class CeremoniesController {
  constructor(@Inject(CeremoniesService) private readonly ceremonies: CeremoniesService) {}

  @Post()
  @Roles(...CEREMONY_WRITE_ROLES)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ ceremony: SerializedCeremony }> {
    const result = validateCreateCeremony(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { ceremony: serialize(await this.ceremonies.create(tenantId, user.sub, result.data, ip)) };
  }

  @Get()
  @Roles(...CEREMONY_READ_ROLES)
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ ceremonies: SerializedCeremony[] }> {
    const rows = await this.ceremonies.list(tenantId, parseCeremonyQuery(query));
    return { ceremonies: rows.map(serialize) };
  }

  @Get(":id")
  @Roles(...CEREMONY_READ_ROLES)
  async get(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ ceremony: SerializedCeremony }> {
    assertUuid(id);
    return { ceremony: serialize(await this.ceremonies.get(tenantId, id)) };
  }

  @Patch(":id")
  @Roles(...CEREMONY_WRITE_ROLES)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ ceremony: SerializedCeremony }> {
    assertUuid(id);
    const result = validateUpdateCeremony(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { ceremony: serialize(await this.ceremonies.update(tenantId, user.sub, id, result.data, ip)) };
  }
}
