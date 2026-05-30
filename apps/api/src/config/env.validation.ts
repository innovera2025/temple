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

  return {
    ...config,
    NODE_ENV: nodeEnv,
    API_PORT: String(apiPort)
  };
}
