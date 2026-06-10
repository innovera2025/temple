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
import { CeremonyRecord, CeremoniesService, HallBooking, HallRecord, InvitedMonk } from "./ceremonies.service";

const CEREMONY_WRITE_ROLES = ["admin", "staff"] as const;
const CEREMONY_READ_ROLES = ["admin", "finance", "staff"] as const;
// Managing the hall registry shapes what everyone can book -> admin only.
const HALL_MANAGE_ROLES = ["admin"] as const;

interface SerializedCeremony {
  id: string;
  ceremonyType: string;
  status: string;
  title: string;
  ceremonyDate: string;
  timeNote: string | null;
  location: string | null;
  hallId: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  assignedMonks: string | null;
  monkCount: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedHall {
  id: string;
  name: string;
  capacity: number | null;
  note: string | null;
  isActive: boolean;
}

interface SerializedHallBooking {
  ceremonyId: string;
  title: string;
  ceremonyDate: string;
  status: string;
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
    hallId: record.hallId,
    requesterName: record.requesterName,
    requesterPhone: record.requesterPhone,
    assignedMonks: record.assignedMonks,
    monkCount: record.monkCount,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeHall(hall: HallRecord): SerializedHall {
  return { id: hall.id, name: hall.name, capacity: hall.capacity, note: hall.note, isActive: hall.isActive };
}

function serializeBooking(booking: HallBooking): SerializedHallBooking {
  return {
    ceremonyId: booking.ceremonyId,
    title: booking.title,
    ceremonyDate: booking.ceremonyDate.toISOString().slice(0, 10),
    status: booking.status,
  };
}

function assertUuid(id: string): void {
  if (!isUuid(id)) {
    throw notFound("ไม่พบงานพิธี");
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface HallBodyShape {
  name?: unknown;
  capacity?: unknown;
  note?: unknown;
  isActive?: unknown;
}

function readHallBody(body: unknown, requireName: boolean): {
  name?: string;
  capacity?: number | null;
  note?: string | null;
  isActive?: boolean;
} {
  const raw = (body ?? {}) as HallBodyShape;
  const errors: Array<{ field: string; message: string }> = [];
  const out: { name?: string; capacity?: number | null; note?: string | null; isActive?: boolean } = {};

  if (raw.name !== undefined || requireName) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name || name.length > 120) {
      errors.push({ field: "name", message: "กรุณาระบุชื่อศาลา (ไม่เกิน 120 ตัวอักษร)" });
    } else {
      out.name = name;
    }
  }
  if (raw.capacity !== undefined) {
    if (raw.capacity === null || raw.capacity === "") {
      out.capacity = null;
    } else if (typeof raw.capacity === "number" && Number.isInteger(raw.capacity) && raw.capacity > 0 && raw.capacity <= 100_000) {
      out.capacity = raw.capacity;
    } else {
      errors.push({ field: "capacity", message: "ความจุต้องเป็นจำนวนเต็มมากกว่า 0" });
    }
  }
  if (raw.note !== undefined) {
    if (raw.note === null || raw.note === "") {
      out.note = null;
    } else if (typeof raw.note === "string" && raw.note.trim().length <= 500) {
      out.note = raw.note.trim();
    } else {
      errors.push({ field: "note", message: "หมายเหตุต้องไม่เกิน 500 ตัวอักษร" });
    }
  }
  if (raw.isActive !== undefined) {
    if (typeof raw.isActive === "boolean") {
      out.isActive = raw.isActive;
    } else {
      errors.push({ field: "isActive", message: "ค่าการเปิดใช้งานไม่ถูกต้อง" });
    }
  }
  if (errors.length > 0) {
    throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", errors);
  }
  return out;
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

  // ---- halls (ศาลา) — declared BEFORE :id so "halls" never matches it ------

  @Get("halls")
  @Roles(...CEREMONY_READ_ROLES)
  async listHalls(
    @CurrentTenant() tenantId: string,
    @Query("includeInactive") includeInactive?: string,
  ): Promise<{ halls: SerializedHall[] }> {
    const rows = await this.ceremonies.listHalls(tenantId, includeInactive === "true");
    return { halls: rows.map(serializeHall) };
  }

  @Post("halls")
  @Roles(...HALL_MANAGE_ROLES)
  async createHall(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ hall: SerializedHall }> {
    const input = readHallBody(body, true);
    return {
      hall: serializeHall(
        await this.ceremonies.createHall(tenantId, user.sub, { name: input.name ?? "", capacity: input.capacity, note: input.note }, ip),
      ),
    };
  }

  @Patch("halls/:id")
  @Roles(...HALL_MANAGE_ROLES)
  async updateHall(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ hall: SerializedHall }> {
    assertUuid(id);
    const patch = readHallBody(body, false);
    return { hall: serializeHall(await this.ceremonies.updateHall(tenantId, user.sub, id, patch, ip)) };
  }

  /** ตารางจองของศาลา (active bookings) — for the availability view. */
  @Get("halls/:id/bookings")
  @Roles(...CEREMONY_READ_ROLES)
  async hallBookings(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ): Promise<{ bookings: SerializedHallBooking[] }> {
    assertUuid(id);
    for (const [field, value] of [["dateFrom", dateFrom], ["dateTo", dateTo]] as const) {
      if (value !== undefined && !ISO_DATE_RE.test(value)) {
        throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
          { field, message: "รูปแบบวันที่ต้องเป็น YYYY-MM-DD" },
        ]);
      }
    }
    const rows = await this.ceremonies.hallBookings(tenantId, id, { dateFrom, dateTo });
    return { bookings: rows.map(serializeBooking) };
  }

  // ---- ceremonies ----------------------------------------------------------

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
  ): Promise<{ ceremony: SerializedCeremony; invitedMonks: InvitedMonk[] }> {
    assertUuid(id);
    const [ceremony, invitedMonks] = await Promise.all([
      this.ceremonies.get(tenantId, id),
      this.ceremonies.invitedMonks(tenantId, id),
    ]);
    return { ceremony: serialize(ceremony), invitedMonks };
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
