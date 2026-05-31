/** The authenticated platform principal — NO tenant_id (platform plane). */
export interface PlatformPrincipal {
  sub: string;
  platform_role: string;
  email: string;
}

export interface PlatformRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  platformUser?: PlatformPrincipal;
}
