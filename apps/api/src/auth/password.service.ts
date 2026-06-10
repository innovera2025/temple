import { timingSafeEqual, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { argon2idAsync } from "@noble/hashes/argon2";

interface ArgonHashParts {
  memory: number;
  time: number;
  parallelism: number;
  salt: Buffer;
  hash: Buffer;
}

// OWASP Password Storage Cheat Sheet minimum for argon2id: m=19 MiB, t=2, p=1.
// Old hashes (m=1024,t=1) still verify — params are parsed from the stored
// encoding — and get the stronger cost transparently on next password change.
// Tests keep the old light params: the cost factor is not what's under test,
// and ~0.7s per hash (pure-JS argon2) makes auth-heavy specs hit timeouts.
const defaultArgonOptions =
  process.env.NODE_ENV === "test"
    ? { t: 1, m: 1024, p: 1, dkLen: 32 }
    : { t: 2, m: 19_456, p: 1, dkLen: 32 };

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function parseArgonHash(encoded: string): ArgonHashParts | null {
  const [algorithm, version, params, salt, hash] = encoded.split("$").filter(Boolean);

  if (algorithm !== "argon2id" || version !== "v=19" || !params || !salt || !hash) {
    return null;
  }

  const parsedParams = Object.fromEntries(
    params.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, Number(value)];
    }),
  );

  if (!parsedParams.m || !parsedParams.t || !parsedParams.p) {
    return null;
  }

  return {
    memory: parsedParams.m,
    time: parsedParams.t,
    parallelism: parsedParams.p,
    salt: Buffer.from(salt, "base64url"),
    hash: Buffer.from(hash, "base64url"),
  };
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await argon2idAsync(password, salt, defaultArgonOptions);

    return `$argon2id$v=19$m=${defaultArgonOptions.m},t=${defaultArgonOptions.t},p=${defaultArgonOptions.p}$${base64Url(salt)}$${base64Url(hash)}`;
  }

  async verify(encoded: string, password: string): Promise<boolean> {
    const parts = parseArgonHash(encoded);

    if (!parts) {
      return false;
    }

    const hash = Buffer.from(
      await argon2idAsync(password, parts.salt, {
        t: parts.time,
        m: parts.memory,
        p: parts.parallelism,
        dkLen: parts.hash.byteLength,
      }),
    );

    return hash.byteLength === parts.hash.byteLength && timingSafeEqual(hash, parts.hash);
  }

  private dummyHashPromise: Promise<string> | null = null;

  /**
   * Run a full (throwaway) argon2 verify to equalize login timing on the
   * account-missing / inactive / no-password path. Without this, those paths
   * skip the expensive hash and return measurably faster than a wrong-password
   * attempt on a real account — a user-enumeration timing oracle. Always
   * discards the result; callers still throw their own 401.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHashPromise ??= this.hash("wat:login-timing-equalizer:not-a-real-credential");
    await this.verify(await this.dummyHashPromise, password);
  }
}
