import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import { validateDevoteePasswordChange, validateDevoteeProfileUpdate } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { projectHttpException, unauthorized } from "../common/errors/project-error";
import { CurrentDevotee } from "./decorators/current-devotee.decorator";
import { DevoteeGuard } from "./guards/devotee.guard";
import { DevoteeAccountsService, DevoteeProfile } from "./devotee-accounts.service";
import { DevoteePrincipal } from "./types/devotee-request";

interface SerializedProfile {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
}

function serialize(p: DevoteeProfile): SerializedProfile {
  return { id: p.id, email: p.email, displayName: p.displayName, phone: p.phone };
}

/**
 * A devotee's own account settings. Mounts ONLY DevoteeGuard (+ RateLimitGuard).
 * Everything is scoped to the token-derived `devotee.sub` — never a body/param id.
 */
@Controller("devotee/me")
@UseGuards(DevoteeGuard, RateLimitGuard)
export class DevoteeProfileController {
  constructor(@Inject(DevoteeAccountsService) private readonly accounts: DevoteeAccountsService) {}

  @Get()
  async profile(@CurrentDevotee() devotee: DevoteePrincipal | undefined): Promise<{ profile: SerializedProfile }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    return { profile: serialize(await this.accounts.requireProfile(devotee.sub)) };
  }

  @Patch()
  @RateLimit({ limit: 20, windowMs: 60_000 })
  async update(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
    @Body() body: unknown,
  ): Promise<{ profile: SerializedProfile }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    const result = validateDevoteeProfileUpdate(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return { profile: serialize(await this.accounts.updateProfile(devotee.sub, result.data)) };
  }

  @Post("password")
  @RateLimit({ limit: 10, windowMs: 60_000 })
  async changePassword(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
    @Body() body: unknown,
  ): Promise<{ changed: true }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    const result = validateDevoteePasswordChange(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    await this.accounts.changePassword(devotee.sub, result.data.currentPassword, result.data.newPassword);
    return { changed: true };
  }
}
