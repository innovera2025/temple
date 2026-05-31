import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { DashboardView } from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { DashboardResult, DashboardService } from "./dashboard.service";

// Roles allowed to see the money figures. Others get the operational view only.
const FINANCE_ROLES = ["admin", "finance"];

function serializeDashboard(result: DashboardResult): DashboardView {
  return {
    month: result.month,
    financial: result.financial
      ? {
          month: result.financial.month,
          incomeSatang: result.financial.incomeSatang.toString(),
          expenseSatang: result.financial.expenseSatang.toString(),
          balanceSatang: result.financial.balanceSatang.toString(),
        }
      : null,
    newDonorsThisMonth: result.newDonorsThisMonth,
    awaitingReceiptCount: result.awaitingReceiptCount,
    awaitingReconciliationCount: result.awaitingReconciliationCount,
    recentDonations: result.recentDonations.map((donation) => ({
      id: donation.id,
      donorName: donation.donorName,
      amountSatang: donation.amountSatang.toString(),
      method: donation.method,
      donationDate: donation.donationDate.toISOString().slice(0, 10),
      status: donation.status,
    })),
  };
}

@Controller("dashboard")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  @Roles("admin", "finance", "staff")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
  ): Promise<{ dashboard: DashboardView }> {
    const includeFinancials = FINANCE_ROLES.includes(user.role);
    const result = await this.dashboard.getDashboard(tenantId, { includeFinancials });
    return { dashboard: serializeDashboard(result) };
  }
}
