import { Prisma } from "@prisma/client";
import { projectHttpException } from "../common/errors/project-error";

/**
 * Allocate the next ledger entry number for a tenant, atomically, inside the
 * caller's transaction. `INSERT ... ON CONFLICT DO UPDATE` row-locks the
 * tenant's `doc_counters` row, so concurrent allocations serialize and can never
 * hand out the same value; the `(tenant_id, entry_no)` unique index is the
 * backstop. Donation auto-posted income (Task 5) and manual entries (Task 7)
 * BOTH call this, so they share one monotonic `ledger_entry` sequence per tenant
 * and can never collide on a number.
 */
export async function allocateLedgerEntryNo(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ allocated_value: bigint }>>`
    INSERT INTO doc_counters (tenant_id, doc_type, next_value)
    VALUES (${tenantId}::uuid, 'ledger_entry', 2)
    ON CONFLICT (tenant_id, doc_type)
    DO UPDATE SET next_value = doc_counters.next_value + 1, updated_at = now()
    RETURNING next_value - 1 AS allocated_value
  `;
  const allocated = rows[0]?.allocated_value;
  if (allocated === undefined || allocated === null) {
    throw projectHttpException(409, "CONFLICT", "ไม่สามารถออกเลขที่รายการบัญชีได้");
  }

  // Zero-padded to 6 digits; the suffix widens naturally past 1,000,000 entries
  // (e.g. LEDG-1000000). Numbers stay unique, monotonic, and lexically ordered.
  return `LEDG-${String(allocated).padStart(6, "0")}`;
}
