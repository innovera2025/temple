import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { MIN_USER_PASSWORD_LENGTH } from "@wat/shared";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { RecoveryService } from "../common/recovery/recovery.service";
import { AuthService, RegistrationResult, SocialProvider, SocialStartResult, TokenPair } from "./auth.service";
import { LoginDto, LogoutDto, RefreshDto, RegisterDto, SocialStartQueryDto } from "./auth.dto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readForgotPasswordBody(body: unknown): { email: string } {
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim() : "";
  if (!EMAIL_RE.test(email)) {
    throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
      { field: "email", message: "กรุณากรอกอีเมลให้ถูกต้อง" },
    ]);
  }
  return { email };
}

export function readResetPasswordBody(body: unknown, minLength: number): { token: string; newPassword: string } {
  const raw = body as { token?: unknown; newPassword?: unknown } | null;
  const token = typeof raw?.token === "string" ? raw.token.trim() : "";
  const newPassword = typeof raw?.newPassword === "string" ? raw.newPassword : "";
  const errors: Array<{ field: string; message: string }> = [];
  if (!/^[0-9a-f]{64}$/.test(token)) {
    errors.push({ field: "token", message: "ลิงก์ไม่ถูกต้อง" });
  }
  if (newPassword.length < minLength || newPassword.length > 200) {
    errors.push({ field: "newPassword", message: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${minLength} ตัวอักษร` });
  }
  if (errors.length > 0) {
    throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", errors);
  }
  return { token, newPassword };
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RecoveryService) private readonly recovery: RecoveryService,
  ) {}

  // Brute-force protection: cap login attempts per client IP (login is pre-auth).
  @Post("login")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Post("register")
  @HttpCode(201)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  register(@Body() dto: RegisterDto): Promise<RegistrationResult> {
    return this.authService.register(dto);
  }

  @Get("oauth/:provider/start")
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60_000 })
  startSocialSignup(
    @Param("provider") provider: SocialProvider,
    @Query() query: SocialStartQueryDto,
  ): SocialStartResult {
    return this.authService.startSocialSignup(provider, {
      redirectUri: query.redirectUri ?? "http://localhost:5173/oauth/callback",
    });
  }

  @Post("refresh")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto);
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Body() dto: LogoutDto): Promise<{ revoked: true }> {
    return this.authService.logout(dto);
  }

  /**
   * Always 202 with the same body whether or not the email exists — no
   * account-enumeration oracle. Tightly rate-limited (mail-sending endpoint).
   */
  @Post("forgot-password")
  @HttpCode(202)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  async forgotPassword(@Body() body: unknown): Promise<{ accepted: true }> {
    const { email } = readForgotPasswordBody(body);
    await this.recovery.requestStaffReset(email);
    return { accepted: true };
  }

  @Post("reset-password")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  async resetPassword(@Body() body: unknown): Promise<{ reset: true }> {
    const { token, newPassword } = readResetPasswordBody(body, MIN_USER_PASSWORD_LENGTH);
    await this.recovery.resetStaffPassword(token, newPassword);
    return { reset: true };
  }
}
