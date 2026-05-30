import {
  Body,
  Controller,
  Get,
  Inject,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  parseDonorSearchQuery,
  validateCreateDonor,
  validateUpdateDonor,
} from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DonorRecord, DonorsService } from "./donors.service";

interface SerializedDonor {
  id: string;
  displayName: string;
  legalName: string | null;
  donorType: string;
  email: string | null;
  phone: string | null;
  lineId: string | null;
  address: string | null;
  taxId: string | null;
  tags: string[];
  notes: string | null;
  consent: boolean;
  createdAt: string;
  updatedAt: string;
}

function serializeDonor(donor: DonorRecord): SerializedDonor {
  return {
    id: donor.id,
    displayName: donor.displayName,
    legalName: donor.legalName,
    donorType: donor.donorType,
    email: donor.email,
    phone: donor.phone,
    lineId: donor.lineId,
    address: donor.address,
    taxId: donor.taxId,
    tags: donor.tags,
    notes: donor.notes,
    consent: donor.consent,
    createdAt: donor.createdAt.toISOString(),
    updatedAt: donor.updatedAt.toISOString(),
  };
}

// Role enum is admin | finance | staff; auditor/viewer roles do not exist yet,
// so reads are granted to the same set rather than inventing new roles.
const DONOR_ROLES = ["admin", "finance", "staff"] as const;

@Controller("donors")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class DonorsController {
  constructor(@Inject(DonorsService) private readonly donors: DonorsService) {}

  @Post()
  @Roles(...DONOR_ROLES)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ donor: SerializedDonor }> {
    const result = validateCreateDonor(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }

    const donor = await this.donors.create(tenantId, user.sub, result.data, ip);
    return { donor: serializeDonor(donor) };
  }

  @Get()
  @Roles(...DONOR_ROLES)
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ donors: SerializedDonor[] }> {
    const donors = await this.donors.list(tenantId, parseDonorSearchQuery(query));
    return { donors: donors.map(serializeDonor) };
  }

  @Get(":id")
  @Roles(...DONOR_ROLES)
  async getOne(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ donor: SerializedDonor }> {
    const donor = await this.donors.getById(tenantId, id);
    return { donor: serializeDonor(donor) };
  }

  @Patch(":id")
  @Roles(...DONOR_ROLES)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ donor: SerializedDonor }> {
    const result = validateUpdateDonor(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }

    const donor = await this.donors.update(tenantId, user.sub, id, result.data, ip);
    return { donor: serializeDonor(donor) };
  }
}
