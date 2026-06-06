import { Body, Controller, Inject, Ip, Param, Post, UseGuards } from "@nestjs/common";
import { validateDevoteeCeremony } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { projectHttpException, unauthorized } from "../common/errors/project-error";
import { CeremonyRecord } from "../ceremonies/ceremonies.service";
import { CurrentDevotee } from "./decorators/current-devotee.decorator";
import { DevoteeGuard } from "./guards/devotee.guard";
import { DevoteeCeremoniesService } from "./devotee-ceremonies.service";
import { DevoteePrincipal } from "./types/devotee-request";
import { assertUuidParam } from "../platform/uuid-param";

interface SerializedBooking {
  id: string;
  ceremonyType: string;
  status: string;
  title: string;
  ceremonyDate: string;
  timeNote: string | null;
  location: string | null;
  note: string | null;
  createdAt: string;
}

function serialize(record: CeremonyRecord): SerializedBooking {
  return {
    id: record.id,
    ceremonyType: record.ceremonyType,
    status: record.status,
    title: record.title,
    ceremonyDate: record.ceremonyDate.toISOString().slice(0, 10),
    timeNote: record.timeNote,
    location: record.location,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * A devotee booking a ceremony at a selected temple. Mounts ONLY DevoteeGuard
 * (+ RateLimitGuard). The temple is the `:templeId` route param; the service
 * validates it is active and runs the write under RLS.
 */
@Controller("devotee/temples/:templeId/ceremonies")
@UseGuards(DevoteeGuard, RateLimitGuard)
export class DevoteeCeremoniesController {
  constructor(@Inject(DevoteeCeremoniesService) private readonly ceremonies: DevoteeCeremoniesService) {}

  @Post()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async create(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
    @Param("templeId") templeId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ booking: SerializedBooking }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    const result = validateDevoteeCeremony(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const booking = await this.ceremonies.book(devotee, assertUuidParam(templeId), result.data, ip);
    return { booking: serialize(booking) };
  }
}
