/**
 * The authenticated devotee (ญาติโยม) principal — NO tenant_id and NO role.
 * A devotee is tenant-independent and picks a temple per request (route param),
 * so its token carries only identity. The selected temple is never in the token.
 */
export interface DevoteePrincipal {
  sub: string;
  email: string;
}

export interface DevoteeRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  devotee?: DevoteePrincipal;
}
