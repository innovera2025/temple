// บันทึกการใช้งาน (audit trail) — read-only client for GET /audit.

export interface AuditLogView {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorType: string;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  actionPrefix?: string;
  entityId?: string;
  take?: number;
  skip?: number;
}

export interface AuditApi {
  list(query?: AuditLogQuery): Promise<AuditLogView[]>;
}

export interface AuditApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function buildAuditQuery(query: AuditLogQuery = {}): string {
  const params = new URLSearchParams();
  if (query.actionPrefix) params.set("actionPrefix", query.actionPrefix);
  if (query.entityId) params.set("entityId", query.entityId);
  if (query.take !== undefined) params.set("take", String(query.take));
  if (query.skip !== undefined) params.set("skip", String(query.skip));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function createAuditApiClient(options: AuditApiClientOptions): AuditApi {
  const doFetch = options.fetchFn ?? fetch;

  const headers = (): Record<string, string> => {
    const token = options.getToken();
    return {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  };

  return {
    async list(query) {
      const response = await doFetch(`${options.baseUrl}/audit${buildAuditQuery(query)}`, {
        headers: headers(),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ApiErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ");
      }
      return (body.logs as AuditLogView[]) ?? [];
    },
  };
}
