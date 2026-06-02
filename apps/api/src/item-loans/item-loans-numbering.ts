import { Prisma } from "@prisma/client";
import { projectHttpException } from "../common/errors/project-error";

/**
 * Allocate the next loan number for a tenant, atomically, inside the caller's
 * transaction. Same row-locking `INSERT ... ON CONFLICT DO UPDATE` pattern as the
 * ledger numbering (doc_counters doc_type='item_loan'); the (tenant_id, loan_no)
 * unique index is the backstop. Returns LOAN-NNNNNN (6-digit zero-padded).
 */
export async function allocateLoanNo(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ allocated_value: bigint }>>`
    INSERT INTO doc_counters (tenant_id, doc_type, next_value)
    VALUES (${tenantId}::uuid, 'item_loan', 2)
    ON CONFLICT (tenant_id, doc_type)
    DO UPDATE SET next_value = doc_counters.next_value + 1, updated_at = now()
    RETURNING next_value - 1 AS allocated_value
  `;
  const allocated = rows[0]?.allocated_value;
  if (allocated === undefined || allocated === null) {
    throw projectHttpException(409, "CONFLICT", "ไม่สามารถออกเลขที่การยืมได้");
  }
  return `LOAN-${String(allocated).padStart(6, "0")}`;
}
