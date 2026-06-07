import { PlatformApi } from "./platform-auth";

/** Shared props for every platform console page. `canWrite` = super_admin (support is read-only). */
export interface PlatformViewProps {
  api: PlatformApi;
  token: string;
  canWrite: boolean;
  onUnauthorized: () => void;
}

/** If the error is a 401, trigger logout and return true (the caller should bail). */
export function on401(err: unknown, onUnauthorized: () => void): boolean {
  if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
    onUnauthorized();
    return true;
  }
  return false;
}
