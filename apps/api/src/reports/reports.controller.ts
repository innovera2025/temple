import { Controller, Get, Inject, Ip, Param, Query, UseGuards } from "@nestjs/common";
import { isReportType, parseReportQuery, toCsv, type ReportView } from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import { ReportsService } from "./reports.service";

// Reports carry money and donor data -> finance roles only.
const REPORT_ROLES = ["admin", "finance"] as const;

@Controller("reports")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get(":type")
  @Roles(...REPORT_ROLES)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("type") type: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ report: ReportView }> {
    if (!isReportType(type)) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ประเภทรายงานไม่ถูกต้อง", [
        { field: "type", message: "ต้องเป็น donations | receipts | ledger" },
      ]);
    }

    const result = await this.reports.build(tenantId, user.sub, type, parseReportQuery(query), ip);
    return { report: { ...result, csv: toCsv(result.columns, result.rows) } };
  }
}
