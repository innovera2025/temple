/**
 * Public (unauthenticated) browsing API — temple directory + upcoming public events.
 * No tokens, no session. Backed by the API's /public/* endpoints (rate-limited per IP).
 */
import type { PublicEventSummary, PublicTempleSummary } from "@wat/shared";

export type { PublicEventSummary, PublicTempleSummary } from "@wat/shared";

export interface PublicApi {
  listTemples(): Promise<PublicTempleSummary[]>;
  listEvents(): Promise<PublicEventSummary[]>;
}

export interface PublicApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ";
  if (error instanceof Error && error.message) return error.message;
  return "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่";
}

export function createPublicApiClient(options: PublicApiClientOptions): PublicApi {
  const doFetch = options.fetchFn ?? fetch;

  async function readJson<T>(response: Response, fallback: string): Promise<T> {
    const body = (await response.json().catch(() => null)) as (ApiErrorBody & T) | null;
    if (!response.ok || body === null) {
      throw new Error(body?.error?.message ?? `${fallback} (${response.status})`);
    }
    return body;
  }

  return {
    async listTemples() {
      const response = await doFetch(`${options.baseUrl}/public/temples`);
      const body = await readJson<{ temples: PublicTempleSummary[] }>(response, "โหลดรายชื่อวัดไม่สำเร็จ");
      return body.temples;
    },
    async listEvents() {
      const response = await doFetch(`${options.baseUrl}/public/events`);
      const body = await readJson<{ events: PublicEventSummary[] }>(response, "โหลดกิจกรรมไม่สำเร็จ");
      return body.events;
    },
  };
}
