import { psqlJson } from "./psql.js";

export const tenantTables = [
  "users",
  "donors",
  "donations",
  "receipts",
  "ledger_accounts",
  "ledger_entries",
  "reconciliation_periods",
  "doc_counters",
  "attachments",
  "audit_logs",
  "auth_refresh_tokens",
  "borrowable_items",
  "item_loans",
  "item_loan_settlements",
] as const;

export interface RlsTableStatus {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

export async function checkTenantTableRls(): Promise<RlsTableStatus[]> {
  return psqlJson<RlsTableStatus>(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY (ARRAY[${tenantTables.map((table) => `'${table}'`).join(", ")}])
    ORDER BY c.relname
  `);
}

export function missingRlsTables(statuses: RlsTableStatus[]): string[] {
  const byTable = new Map(statuses.map((status) => [status.table_name, status]));

  return tenantTables.filter((table) => {
    const status = byTable.get(table);
    return !status?.rls_enabled || !status.rls_forced;
  });
}
