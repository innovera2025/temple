import { IsEmail, IsIn, IsOptional, IsString, IsUrl, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RegisterDto {
  @IsString()
  @MinLength(2)
  templeNameTh!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;
}

export class SocialStartDto {
  @IsIn(["google", "facebook"])
  provider!: "google" | "facebook";

  @IsUrl({ require_tld: false })
  redirectUri!: string;
}

export class SocialStartQueryDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  redirectUri?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class LogoutDto extends RefreshDto {}
