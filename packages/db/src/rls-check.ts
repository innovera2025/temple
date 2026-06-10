import { psqlJson } from "./psql.js";

/**
 * Known tenant tables, kept for reference/documentation. The actual gate is
 * DYNAMIC (see checkTenantTableRls): every ordinary table in public with a
 * tenant_id column must have RLS enabled AND forced — a new tenant table can
 * never silently ship without RLS just because nobody added it to a list
 * (this bit personnel and ceremonies once).
 */
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
  "inventory_items",
  "inventory_movements",
  "storage_rooms",
  "personnel",
  "ceremonies",
  "break_glass_grants",
  "temple_halls",
  "ceremony_monks",
] as const;

export interface RlsTableStatus {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

/** Every ordinary table in public with a tenant_id column is a tenant table. */
export async function discoverTenantTables(): Promise<string[]> {
  const rows = await psqlJson<{ table_name: string }>(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  return rows.map((row) => row.table_name);
}

export async function checkTenantTableRls(): Promise<RlsTableStatus[]> {
  return psqlJson<RlsTableStatus>(`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `);
}

export function missingRlsTables(statuses: RlsTableStatus[]): string[] {
  return statuses
    .filter((status) => !status.rls_enabled || !status.rls_forced)
    .map((status) => status.table_name);
}
