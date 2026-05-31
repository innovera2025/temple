import { Body, Controller, Get, Inject, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { isUuid, parsePersonnelQuery, validateCreatePersonnel, validateUpdatePersonnel } from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { notFound, projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { PersonnelRecord, PersonnelService } from "./personnel.service";

// Clergy/staff records are managed by temple admins + staff; finance is read-only.
const PERSONNEL_WRITE_ROLES = ["admin", "staff"] as const;
const PERSONNEL_READ_ROLES = ["admin", "finance", "staff"] as const;

interface SerializedPersonnel {
  id: string;
  personnelType: string;
  status: string;
  displayName: string;
  dharmaName: string | null;
  secularName: string | null;
  rank: string | null;
  position: string | null;
  ordinationDate: string | null;
  ordinationTemple: string | null;
  preceptor: string | null;
  phansaCount: number | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  phone: string | null;
  note: string | null;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function serialize(record: PersonnelRecord): SerializedPersonnel {
  return {
    id: record.id,
    personnelType: record.personnelType,
    status: record.status,
    displayName: record.displayName,
    dharmaName: record.dharmaName,
    secularName: record.secularName,
    rank: record.rank,
    position: record.position,
    ordinationDate: dateOnly(record.ordinationDate),
    ordinationTemple: record.ordinationTemple,
    preceptor: record.preceptor,
    phansaCount: record.phansaCount,
    dateOfBirth: dateOnly(record.dateOfBirth),
    nationalId: record.nationalId,
    phone: record.phone,
    note: record.note,
    joinedAt: dateOnly(record.joinedAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function assertUuid(id: string): void {
  if (!isUuid(id)) {
    throw notFound("ไม่พบบุคลากร");
  }
}

@Controller("personnel")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class PersonnelController {
  constructor(@Inject(PersonnelService) private readonly personnel: PersonnelService) {}

  @Post()
  @Roles(...PERSONNEL_WRITE_ROLES)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ personnel: SerializedPersonnel }> {
    const result = validateCreatePersonnel(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { personnel: serialize(await this.personnel.create(tenantId, user.sub, result.data, ip)) };
  }

  @Get()
  @Roles(...PERSONNEL_READ_ROLES)
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ personnel: SerializedPersonnel[] }> {
    const rows = await this.personnel.list(tenantId, parsePersonnelQuery(query));
    return { personnel: rows.map(serialize) };
  }

  @Get(":id")
  @Roles(...PERSONNEL_READ_ROLES)
  async get(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ personnel: SerializedPersonnel }> {
    assertUuid(id);
    return { personnel: serialize(await this.personnel.get(tenantId, id)) };
  }

  @Patch(":id")
  @Roles(...PERSONNEL_WRITE_ROLES)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ personnel: SerializedPersonnel }> {
    assertUuid(id);
    const result = validateUpdatePersonnel(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { personnel: serialize(await this.personnel.update(tenantId, user.sub, id, result.data, ip)) };
  }
}
