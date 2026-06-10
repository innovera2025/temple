import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import { validateDevoteePasswordChange, validateDevoteeProfileUpdate } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { projectHttpException, unauthorized } from "../common/errors/project-error";
import { RecoveryService } from "../common/recovery/recovery.service";
import { CurrentDevotee } from "./decorators/current-devotee.decorator";
import { DevoteeGuard } from "./guards/devotee.guard";
import { DevoteeAccountsService, DevoteeProfile } from "./devotee-accounts.service";
import { DevoteePrincipal } from "./types/devotee-request";

interface SerializedProfile {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  emailVerified: boolean;
}

function serialize(p: DevoteeProfile): SerializedProfile {
  return {
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    phone: p.phone,
    emailVerified: p.emailVerifiedAt !== null,
  };
}

/**
 * A devotee's own account settings. Mounts ONLY DevoteeGuard (+ RateLimitGuard).
 * Everything is scoped to the token-derived `devotee.sub` — never a body/param id.
 */
@Controller("devotee/me")
@UseGuards(DevoteeGuard, RateLimitGuard)
export class DevoteeProfileController {
  constructor(
    @Inject(DevoteeAccountsService) private readonly accounts: DevoteeAccountsService,
    @Inject(RecoveryService) private readonly recovery: RecoveryService,
  ) {}

  @Get()
  async profile(@CurrentDevotee() devotee: DevoteePrincipal | undefined): Promise<{ profile: SerializedProfile }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    return { profile: serialize(await this.accounts.requireProfile(devotee.sub)) };
  }

  /** Resend the email-verification link (no-op once verified). */
  @Post("resend-verification")
  @RateLimit({ limit: 3, windowMs: 60_000 })
  async resendVerification(
    @CurrentDevotee() devotee: DevoteePrincipal | undefined,
  ): Promise<{ accepted: true }> {
    if (!devotee) {
      throw unauthorized("Missing access token");
    }
    await this.recovery.sendDevoteeVerification(devotee.sub);
    return { accepted: true };
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
