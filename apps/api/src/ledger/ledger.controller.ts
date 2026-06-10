import {
  Body,
  Controller,
  Get,
  Inject,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  directionForAccountType,
  parseLedgerEntrySearchQuery,
  parseLedgerSummaryQuery,
  periodStatus,
  validateClosePeriod,
  validateCreateLedgerEntry,
  validateVoidLedgerEntry,
  type LedgerAccountType,
  type LedgerDirection,
  type LedgerEntryStatus,
  type ReconciliationPeriodStatus,
} from "@wat/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { projectHttpException } from "../common/errors/project-error";
import { AuthGuard } from "../common/guards/auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TenantGuard } from "../common/guards/tenant.guard";
import { AuthenticatedUser } from "../common/types/authenticated-request";
import {
  LedgerAccountRecord,
  LedgerEntriesService,
  LedgerEntryDetail,
  LedgerSummaryResult,
} from "./ledger-entries.service";
import { LedgerPeriodsService, ReconciliationPeriodRecord } from "./ledger-periods.service";

/** Money fields are serialized as **strings** of integer satang (JSON has no BigInt). */
interface SerializedLedgerEntry {
  id: string;
  entryNo: string;
  accountId: string;
  accountCode: string;
  accountNameTh: string;
  accountType: LedgerAccountType;
  direction: LedgerDirection | null;
  amountSatang: string;
  entryDate: string;
  status: LedgerEntryStatus;
  payee: string | null;
  description: string | null;
  reconciledAt: string | null;
  donationId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedLedgerAccount {
  id: string;
  code: string;
  nameTh: string;
  accountType: LedgerAccountType;
  direction: LedgerDirection | null;
  isActive: boolean;
}

interface SerializedLedgerSummary {
  dateFrom: string;
  dateTo: string;
  incomeSatang: string;
  expenseSatang: string;
  balanceSatang: string;
  incomeCount: number;
  expenseCount: number;
}

function serializeEntry(entry: LedgerEntryDetail): SerializedLedgerEntry {
  return {
    id: entry.id,
    entryNo: entry.entryNo,
    accountId: entry.accountId,
    accountCode: entry.account.code,
    accountNameTh: entry.account.nameTh,
    accountType: entry.account.accountType as LedgerAccountType,
    direction: directionForAccountType(entry.account.accountType),
    amountSatang: entry.amountSatang.toString(),
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    status: entry.status as LedgerEntryStatus,
    payee: entry.payee,
    description: entry.description,
    reconciledAt: entry.reconciledAt ? entry.reconciledAt.toISOString() : null,
    donationId: entry.donationId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function serializeAccount(account: LedgerAccountRecord): SerializedLedgerAccount {
  return {
    id: account.id,
    code: account.code,
    nameTh: account.nameTh,
    accountType: account.accountType as LedgerAccountType,
    direction: directionForAccountType(account.accountType),
    isActive: account.isActive,
  };
}

function serializeSummary(summary: LedgerSummaryResult): SerializedLedgerSummary {
  return {
    dateFrom: summary.dateFrom,
    dateTo: summary.dateTo,
    incomeSatang: summary.incomeSatang.toString(),
    expenseSatang: summary.expenseSatang.toString(),
    balanceSatang: summary.balanceSatang.toString(),
    incomeCount: summary.incomeCount,
    expenseCount: summary.expenseCount,
  };
}

interface SerializedPeriod {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: ReconciliationPeriodStatus;
  closedAt: string | null;
  closedByUserId: string | null;
}

function serializePeriod(period: ReconciliationPeriodRecord): SerializedPeriod {
  const closedAt = period.closedAt ? period.closedAt.toISOString() : null;
  return {
    id: period.id,
    periodStart: period.periodStart.toISOString().slice(0, 10),
    periodEnd: period.periodEnd.toISOString().slice(0, 10),
    status: periodStatus(closedAt),
    closedAt,
    closedByUserId: period.closedByUserId,
  };
}

// Recording/voiding ledger entries and reading aggregate financial metrics is
// finance work; chart-of-accounts and entry reads are open to staff too.
const LEDGER_WRITE_ROLES = ["admin", "finance"] as const;
const LEDGER_READ_ROLES = ["admin", "finance", "staff"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject a malformed :id path param with 422 before it hits Postgres as an
 *  invalid-uuid cast (which would otherwise surface as an unhandled 500). */
function assertUuidParam(id: string): void {
  if (!UUID_RE.test(id)) {
    throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", [
      { field: "id", message: "รูปแบบรหัสไม่ถูกต้อง" },
    ]);
  }
}

@Controller("ledger")
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class LedgerController {
  constructor(
    @Inject(LedgerEntriesService) private readonly ledger: LedgerEntriesService,
    @Inject(LedgerPeriodsService) private readonly periods: LedgerPeriodsService,
  ) {}

  @Get("accounts")
  @Roles(...LEDGER_READ_ROLES)
  async accounts(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ accounts: SerializedLedgerAccount[] }> {
    const activeOnly = query.activeOnly !== "false";
    const accounts = await this.ledger.listAccounts(tenantId, { activeOnly });
    return { accounts: accounts.map(serializeAccount) };
  }

  @Get("summary")
  @Roles(...LEDGER_WRITE_ROLES)
  async summary(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ summary: SerializedLedgerSummary }> {
    const summary = await this.ledger.summary(tenantId, parseLedgerSummaryQuery(query));
    return { summary: serializeSummary(summary) };
  }

  @Post("entries")
  @Roles(...LEDGER_WRITE_ROLES)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ entry: SerializedLedgerEntry }> {
    const result = validateCreateLedgerEntry(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const entry = await this.ledger.createEntry(tenantId, user.sub, result.data, ip);
    return { entry: serializeEntry(entry) };
  }

  @Get("entries")
  @Roles(...LEDGER_READ_ROLES)
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ entries: SerializedLedgerEntry[] }> {
    const entries = await this.ledger.list(tenantId, parseLedgerEntrySearchQuery(query));
    return { entries: entries.map(serializeEntry) };
  }

  @Get("entries/:id")
  @Roles(...LEDGER_READ_ROLES)
  async getOne(
    @CurrentTenant() tenantId: string,
    @Param("id") id: string,
  ): Promise<{ entry: SerializedLedgerEntry }> {
    assertUuidParam(id);
    const entry = await this.ledger.getById(tenantId, id);
    return { entry: serializeEntry(entry) };
  }

  @Post("entries/:id/void")
  @Roles(...LEDGER_WRITE_ROLES)
  async void(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ entry: SerializedLedgerEntry }> {
    assertUuidParam(id);
    const result = validateVoidLedgerEntry(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const entry = await this.ledger.void(tenantId, user.sub, id, result.data.reason, ip);
    return { entry: serializeEntry(entry) };
  }

  @Post("entries/:id/reconcile")
  @Roles(...LEDGER_WRITE_ROLES)
  async reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
  ): Promise<{ entry: SerializedLedgerEntry }> {
    assertUuidParam(id);
    const entry = await this.ledger.reconcile(tenantId, user.sub, id, ip);
    return { entry: serializeEntry(entry) };
  }

  // Required first step before mutating a reconciled entry (mutations 409 while
  // reconciledAt is set). Reuses the void validator: a mandatory Thai reason.
  @Post("entries/:id/unreconcile")
  @Roles(...LEDGER_WRITE_ROLES)
  async unreconcile(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ entry: SerializedLedgerEntry }> {
    assertUuidParam(id);
    const result = validateVoidLedgerEntry(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const entry = await this.ledger.unreconcile(tenantId, user.sub, id, result.data.reason, ip);
    return { entry: serializeEntry(entry) };
  }

  @Post("periods/close")
  @Roles(...LEDGER_WRITE_ROLES)
  async closePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Ip() ip: string,
    @Body() body: unknown,
  ): Promise<{ period: SerializedPeriod }> {
    const result = validateClosePeriod(body);
    if (!result.success) {
      throw projectHttpException(422, "UNPROCESSABLE_ENTITY", "ข้อมูลไม่ถูกต้อง", result.errors);
    }
    const period = await this.periods.closePeriod(tenantId, user.sub, result.data, ip);
    return { period: serializePeriod(period) };
  }

  @Get("periods")
  @Roles(...LEDGER_READ_ROLES)
  async listPeriods(@CurrentTenant() tenantId: string): Promise<{ periods: SerializedPeriod[] }> {
    const periods = await this.periods.listPeriods(tenantId);
    return { periods: periods.map(serializePeriod) };
  }
}
