import { Body, Controller, Get, Inject, Ip, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { isUuid, parseUserQuery, validateCreateUser, validateUpdateUser } from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { notFound, projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { UserRecord, UsersService } from "./users.service";

interface SerializedUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function serialize(user: UserRecord): SerializedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function assertUuid(id: string): void {
  if (!isUuid(id)) {
    throw notFound("ไม่พบผู้ใช้");
  }
}

// Managing who can sign in (and their role) is admin-only.
@Controller("users")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
@Roles("admin")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ users: SerializedUser[] }> {
    const rows = await this.users.list(tenantId, parseUserQuery(query));
    return { users: rows.map(serialize) };
  }

  @Get(":id")
  async get(@CurrentTenant() tenantId: string, @Param("id") id: string): Promise<{ user: SerializedUser }> {
    assertUuid(id);
    return { user: serialize(await this.users.get(tenantId, id)) };
  }

  @Post()
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ user: SerializedUser }> {
    const result = validateCreateUser(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { user: serialize(await this.users.create(tenantId, actor.sub, result.data, ip)) };
  }

  @Patch(":id")
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ user: SerializedUser }> {
    assertUuid(id);
    const result = validateUpdateUser(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { user: serialize(await this.users.update(tenantId, actor.sub, id, result.data, ip)) };
  }
}
