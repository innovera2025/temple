import { Prisma } from "@prisma/client";
import { projectHttpException } from "../common/errors/project-error";

/**
 * Take a transaction-scoped per-tenant advisory lock so that closing a period
 * and ANY ledger-entry mutation for the same tenant serialize. Without it, under
 * READ COMMITTED a mutation could pass {@link assertDateNotInClosedPeriod} and
 * then commit an entry into a period a concurrent transaction just closed, and
 * two concurrent closes could create overlapping periods. Acquired before the
 * period read/write on every such path; released automatically at commit/rollback.
 */
export async function lockTenantLedger(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || ':ledger')::bigint)`;
}

/**
 * Reject a mutation on a ledger entry whose `entry_date` falls inside a CLOSED
 * reconciliation period. Called from every ledger-entry mutation — manual
 * create/void/reconcile AND donation-driven post/update/void — so a closed
 * accounting period is immutable end-to-end. Runs inside the caller's tenant
 * transaction; RLS scopes the lookup to the tenant.
 */
export async function assertDateNotInClosedPeriod(
  tx: Prisma.TransactionClient,
  date: Date,
): Promise<void> {
  const closed = await tx.reconciliationPeriod.findFirst({
    where: {
      closedAt: { not: null },
      periodStart: { lte: date },
      periodEnd: { gte: date },
    },
    select: { id: true },
  });

  if (closed) {
    throw projectHttpException(
      409,
      "CONFLICT",
      "งวดบัญชีนี้ถูกปิดแล้ว ไม่สามารถแก้ไขรายการในงวดได้",
    );
  }
}
