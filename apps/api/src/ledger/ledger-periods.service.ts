import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ClosePeriodInput } from "@wat/shared";
import { projectHttpException } from "../common/errors/project-error";
import { PrismaService } from "../common/prisma/prisma.service";
import { lockTenantLedger } from "./ledger-periods";

export interface ReconciliationPeriodRecord {
  id: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  closedAt: Date | null;
  closedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const MAX_TAKE = 200;

/** Parse an ISO `YYYY-MM-DD` date as UTC midnight (matches `@db.Date` storage). */
function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function periodSnapshot(period: ReconciliationPeriodRecord): Prisma.InputJsonObject {
  return {
    id: period.id,
    periodStart: period.periodStart.toISOString().slice(0, 10),
    periodEnd: period.periodEnd.toISOString().slice(0, 10),
    closedAt: period.closedAt ? period.closedAt.toISOString() : null,
    closedByUserId: period.closedByUserId,
  };
}

@Injectable()
export class LedgerPeriodsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Close an accounting period [periodStart, periodEnd]: create a closed
   * ReconciliationPeriod (closedAt + closedBy) and audit `period:close`, in one
   * transaction. Rejects a range overlapping an already-closed period (409) so
   * a date can belong to at most one closed period.
   */
  async closePeriod(
    tenantId: string,
    actorUserId: string,
    input: ClosePeriodInput,
    ip?: string,
  ): Promise<ReconciliationPeriodRecord> {
    const periodStart = toDateOnly(input.periodStart);
    const periodEnd = toDateOnly(input.periodEnd);

    return this.prisma.withTenant(tenantId, async (tx) => {
      await lockTenantLedger(tx, tenantId);
      const overlap = await tx.reconciliationPeriod.findFirst({
        where: {
          closedAt: { not: null },
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
        select: { id: true },
      });
      if (overlap) {
        throw projectHttpException(409, "CONFLICT", "ช่วงงวดทับซ้อนกับงวดบัญชีที่ปิดแล้ว");
      }

      const period = (await tx.reconciliationPeriod.create({
        data: {
          tenantId,
          periodStart,
          periodEnd,
          closedAt: new Date(),
          closedByUserId: actorUserId,
        },
      })) as ReconciliationPeriodRecord;

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: "period:close",
          entityType: "reconciliation_period",
          entityId: period.id,
          after: periodSnapshot(period),
          metadata: {},
          ip,
        },
      });

      return period;
    });
  }

  async listPeriods(tenantId: string): Promise<ReconciliationPeriodRecord[]> {
    return (await this.prisma.withTenant(tenantId, (tx) =>
      tx.reconciliationPeriod.findMany({
        orderBy: [{ periodStart: "desc" }],
        take: MAX_TAKE,
      }),
    )) as ReconciliationPeriodRecord[];
  }
}
