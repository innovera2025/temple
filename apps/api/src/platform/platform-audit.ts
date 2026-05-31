import { Prisma } from "@prisma/client";

/**
 * Append a row to `platform_audit_logs` inside the caller's transaction, so a
 * platform mutation and its audit row commit (or roll back) together. The table
 * has no reason/ip/before/after columns, so those live in `metadata` (jsonb).
 */
export async function recordPlatformAudit(
  tx: Prisma.TransactionClient,
  params: {
    actorPlatformUserId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    ip?: string;
  },
): Promise<void> {
  const metadata = {
    ...(params.metadata ?? {}),
    ...(params.ip ? { ip: params.ip } : {}),
  };

  await tx.platformAuditLog.create({
    data: {
      actorPlatformUserId: params.actorPlatformUserId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}
