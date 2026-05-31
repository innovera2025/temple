import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { unauthorized } from "../common/errors/project-error";

interface RegisteredClaims {
  iat: number;
  exp: number;
}

/**
 * Platform tokens are signed with the SAME HMAC secret as tenant tokens, so the
 * `typ` claim is the only thing that separates the two planes. Both verifiers
 * MUST assert their own `typ` — a tenant token (`typ: "access"`) is rejected
 * here, and a platform token (`typ: "platform_access"`) is rejected by the
 * tenant TokenService. Platform payloads carry NO tenant_id.
 */
export interface PlatformAccessTokenPayload extends RegisteredClaims {
  typ: "platform_access";
  sub: string;
  platform_role: string;
  email: string;
}

export interface PlatformRefreshTokenPayload extends RegisteredClaims {
  typ: "platform_refresh";
  sub: string;
  platform_role: string;
  email: string;
  token_id: string;
}

type PlatformJwtPayload = PlatformAccessTokenPayload | PlatformRefreshTokenPayload;

const accessTokenSeconds = 15 * 60;
const refreshTokenSeconds = 30 * 24 * 60 * 60;

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signData(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function readDevSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  return "dev-only-wat-jwt-secret-change-me";
}

@Injectable()
export class PlatformTokenService {
  private readonly secret = readDevSecret();

  signAccessToken(payload: Omit<PlatformAccessTokenPayload, keyof RegisteredClaims | "typ">): string {
    return this.sign({ typ: "platform_access", ...payload }, accessTokenSeconds);
  }

  signRefreshToken(payload: Omit<PlatformRefreshTokenPayload, keyof RegisteredClaims | "typ">): string {
    return this.sign({ typ: "platform_refresh", ...payload }, refreshTokenSeconds);
  }

  verifyAccessToken(token: string): PlatformAccessTokenPayload {
    const payload = this.verify(token);

    if (payload.typ !== "platform_access") {
      throw unauthorized("Invalid access token");
    }

    return payload;
  }

  verifyRefreshToken(token: string): PlatformRefreshTokenPayload {
    const payload = this.verify(token);

    if (payload.typ !== "platform_refresh") {
      throw unauthorized("Invalid refresh token");
    }

    return payload;
  }

  refreshExpiresAt(): Date {
    return new Date(Date.now() + refreshTokenSeconds * 1000);
  }

  private sign(payload: Omit<PlatformJwtPayload, keyof RegisteredClaims>, expiresInSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
    const data = `${base64UrlJson({ alg: "HS256", typ: "JWT" })}.${base64UrlJson(fullPayload)}`;
    const signature = signData(this.secret, data);

    return `${data}.${signature}`;
  }

  private verify(token: string): PlatformJwtPayload {
    const [header, payload, signature] = token.split(".");

    if (!header || !payload || !signature) {
      throw unauthorized("Invalid token");
    }

    const expected = Buffer.from(signData(this.secret, `${header}.${payload}`), "base64url");
    const actual = Buffer.from(signature, "base64url");

    if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
      throw unauthorized("Invalid token");
    }

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PlatformJwtPayload;

    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      throw unauthorized("Expired token");
    }

    return parsed;
  }
}
