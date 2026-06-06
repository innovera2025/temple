const allowedNodeEnvs = new Set(["development", "test", "production"]);

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = String(config.NODE_ENV ?? "development");
  if (!allowedNodeEnvs.has(nodeEnv)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const apiPort = Number(config.API_PORT ?? 3000);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  // JWT_SECRET signs every plane's tokens (tenant / platform / devotee) with HS256;
  // the planes are separated only by the `typ` claim, so a weak secret that is
  // brute-forced offline lets an attacker forge ANY plane's token (e.g. a tenant
  // token with arbitrary tenant_id/role). Fail fast at boot in production rather
  // than silently accepting a short/default secret. Dev/test fall back to the
  // documented dev-only secret in the *TokenService classes.
  const jwtSecret = typeof config.JWT_SECRET === "string" ? config.JWT_SECRET : undefined;
  if (nodeEnv === "production") {
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is required in production");
    }
    if (jwtSecret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters in production");
    }
    if (jwtSecret === "dev-only-wat-jwt-secret-change-me") {
      throw new Error("JWT_SECRET must not be the development default in production");
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    API_PORT: String(apiPort)
  };
}
