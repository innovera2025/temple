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

  // DATABASE_URL: Prisma reads it itself, but failing at boot beats failing on
  // the first query. Required in production; must look like a postgres URL.
  const databaseUrl = typeof config.DATABASE_URL === "string" ? config.DATABASE_URL : undefined;
  if (nodeEnv === "production" && !databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URL");
  }

  // REDIS_URL is optional (rate limiting falls back to in-memory), but if set
  // it must be a redis URL — a typo should fail loudly, not silently degrade.
  const redisUrl = typeof config.REDIS_URL === "string" && config.REDIS_URL.trim() !== "" ? config.REDIS_URL : undefined;
  if (redisUrl && !/^rediss?:\/\//.test(redisUrl)) {
    throw new Error("REDIS_URL must be a redis:// or rediss:// URL");
  }

  // TRUST_PROXY is a hop COUNT. `true` would trust any client-supplied
  // X-Forwarded-For, letting rate-limit keys be spoofed — reject it.
  const trustProxy = typeof config.TRUST_PROXY === "string" ? config.TRUST_PROXY.trim() : "";
  if (trustProxy) {
    const hops = Number(trustProxy);
    if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
      throw new Error("TRUST_PROXY must be an integer hop count between 0 and 10 (never 'true')");
    }
  }

  // CORS_ORIGINS: optional comma-separated absolute origins.
  const corsOrigins = typeof config.CORS_ORIGINS === "string" ? config.CORS_ORIGINS.trim() : "";
  if (corsOrigins) {
    for (const origin of corsOrigins.split(",").map((o) => o.trim()).filter(Boolean)) {
      if (!/^https?:\/\/[^/]+$/.test(origin)) {
        throw new Error(`CORS_ORIGINS entry "${origin}" must be an absolute http(s) origin without a path`);
      }
    }
  }

  // OAuth client ids/redirects come in pairs — half-configured providers
  // produce confusing 503s at runtime, so fail at boot instead.
  for (const provider of ["GOOGLE", "FACEBOOK"] as const) {
    const clientId = config[`${provider}_OAUTH_CLIENT_ID`];
    const redirectUri = config[`${provider}_OAUTH_REDIRECT_URI`];
    if (Boolean(clientId) !== Boolean(redirectUri)) {
      throw new Error(`${provider}_OAUTH_CLIENT_ID and ${provider}_OAUTH_REDIRECT_URI must be set together`);
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    API_PORT: String(apiPort)
  };
}
