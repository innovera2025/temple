import { Body, Controller, HttpCode, Inject, Ip, Post, UseGuards } from "@nestjs/common";
import { MIN_DEVOTEE_PASSWORD, validateDevoteeLogin, validateDevoteeRegister } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { projectHttpException } from "../common/errors/project-error";
import { RecoveryService } from "../common/recovery/recovery.service";
import { readForgotPasswordBody, readResetPasswordBody } from "../auth/auth.controller";
import { DevoteeAuthService, DevoteeTokenPair } from "./devotee-auth.service";

function readRefreshToken(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { refreshToken?: unknown }).refreshToken === "string"
  ) {
    const token = (body as { refreshToken: string }).refreshToken.trim();
    if (token) {
      return token;
    }
  }
  throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
    { field: "refreshToken", message: "ต้องระบุ refreshToken" },
  ]);
}

@Controller("devotee/auth")
export class DevoteeAuthController {
  constructor(
    @Inject(DevoteeAuthService) private readonly authService: DevoteeAuthService,
    @Inject(RecoveryService) private readonly recovery: RecoveryService,
  ) {}

  /** Always 202 with the same body whether or not the email exists. */
  @Post("forgot-password")
  @HttpCode(202)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  async forgotPassword(@Body() body: unknown): Promise<{ accepted: true }> {
    const { email } = readForgotPasswordBody(body);
    await this.recovery.requestDevoteeReset(email);
    return { accepted: true };
  }

  @Post("reset-password")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  async resetPassword(@Body() body: unknown): Promise<{ reset: true }> {
    const { token, newPassword } = readResetPasswordBody(body, MIN_DEVOTEE_PASSWORD);
    await this.recovery.resetDevoteePassword(token, newPassword);
    return { reset: true };
  }

  @Post("verify-email")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  async verifyEmail(@Body() body: unknown): Promise<{ verified: true }> {
    const token = typeof (body as { token?: unknown })?.token === "string" ? (body as { token: string }).token.trim() : "";
    if (!/^[0-9a-f]{64}$/.test(token)) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
        { field: "token", message: "ลิงก์ไม่ถูกต้อง" },
      ]);
    }
    await this.recovery.verifyDevoteeEmail(token);
    return { verified: true };
  }

  @Post("register")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  async register(@Ip() ip: string, @Body() body: unknown): Promise<DevoteeTokenPair> {
    const result = validateDevoteeRegister(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return this.authService.register(result.data, ip);
  }

  @Post("login")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  async login(@Ip() ip: string, @Body() body: unknown): Promise<DevoteeTokenPair> {
    const result = validateDevoteeLogin(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return this.authService.login(result.data, ip);
  }

  @Post("refresh")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  async refresh(@Body() body: unknown): Promise<DevoteeTokenPair> {
    return this.authService.refresh(readRefreshToken(body));
  }

  @Post("logout")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async logout(@Body() body: unknown): Promise<{ revoked: true }> {
    return this.authService.logout(readRefreshToken(body));
  }
}
