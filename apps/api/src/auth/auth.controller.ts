import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../common/guards/rate-limit.guard";
import { AuthService, TokenPair } from "./auth.service";
import { LoginDto, LogoutDto, RefreshDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  // Brute-force protection: cap login attempts per client IP (login is pre-auth).
  @Post("login")
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
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
}
