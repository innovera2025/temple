import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { AuthService, TokenPair } from "./auth.service";
import { LoginDto, LogoutDto, RefreshDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto);
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Body() dto: LogoutDto): Promise<{ revoked: true }> {
    return this.authService.logout(dto);
  }
}
