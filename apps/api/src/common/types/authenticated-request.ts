export interface AuthenticatedUser {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  user?: AuthenticatedUser;
  currentTenantId?: string;
}
