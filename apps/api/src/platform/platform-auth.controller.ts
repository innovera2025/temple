import { Body, Controller, Inject, Ip, Post } from "@nestjs/common";
import { validatePlatformLogin } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { PlatformAuthService, TokenPair } from "./platform-auth.service";

function readRefreshToken(body: unknown): string {
  if (typeof body === "object" && body !== null && typeof (body as { refreshToken?: unknown }).refreshToken === "string") {
    const token = (body as { refreshToken: string }).refreshToken.trim();
    if (token) {
      return token;
    }
  }
  throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
    { field: "refreshToken", message: "ต้องระบุ refreshToken" },
  ]);
}

@Controller("platform/auth")
export class PlatformAuthController {
  constructor(@Inject(PlatformAuthService) private readonly authService: PlatformAuthService) {}

  @Post("login")
  async login(@Ip() ip: string, @Body() body: unknown): Promise<TokenPair> {
    const result = validatePlatformLogin(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    return this.authService.login(result.data, ip);
  }

  @Post("refresh")
  async refresh(@Body() body: unknown): Promise<TokenPair> {
    return this.authService.refresh(readRefreshToken(body));
  }

  @Post("logout")
  async logout(@Body() body: unknown): Promise<{ revoked: true }> {
    return this.authService.logout(readRefreshToken(body));
  }
}
