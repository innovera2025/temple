import { isUuid } from "@wat/shared";
import { notFound } from "../common/errors/project-error";

/**
 * Guard a `:id` path param: a malformed UUID would otherwise reach a Prisma
 * `@db.Uuid` filter and raise an unhandled 500. Treat it as not-found (404) —
 * which also avoids confirming/denying existence to an attacker.
 */
export function assertUuidParam(id: string): string {
  if (!isUuid(id)) {
    throw notFound("ไม่พบรายการ");
  }
  return id;
}
