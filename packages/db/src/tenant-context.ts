import { psql, sqlLiteral } from "./psql.js";

const docPrefixes: Record<string, string> = {
  ledger: "LEDG",
  receipt: "RCPT",
};

export interface TenantTransaction {
  query<T>(sql: string): Promise<T[]>;
  execute(sql: string): Promise<string>;
}

export interface TenantClient {
  transaction<T>(fn: (tx: TenantTransaction) => Promise<T>): Promise<T>;
}

export function createTenantClient(tenantId: string): TenantClient {
  return {
    async transaction<T>(fn: (tx: TenantTransaction) => Promise<T>): Promise<T> {
      const tx: TenantTransaction = {
        query: async <R>(sql: string) => queryTenantJson<R>(tenantId, sql),
        execute: async (sql: string) => rawQuery(tenantId, sql),
      };

      return fn(tx);
    },
  };
}

export async function rawQuery(tenantId: string, sql: string): Promise<string> {
  const statement = sql.replace(/;+\s*$/, "");

  return psql(`
    BEGIN;
    SET LOCAL ROLE wat_app;
    SET LOCAL app.tenant_id = ${sqlLiteral(tenantId)};
    ${statement};
    COMMIT;
  `);
}

async function queryTenantJson<T>(tenantId: string, sql: string): Promise<T[]> {
  const rows = await psql(`
    BEGIN;
    SET LOCAL ROLE wat_app;
    SET LOCAL app.tenant_id = ${sqlLiteral(tenantId)};
    WITH q AS (${sql.replace(/;+\s*$/, "")})
    SELECT COALESCE(json_agg(q), '[]'::json) FROM q;
    COMMIT;
  `);

  return JSON.parse(rows || "[]") as T[];
}

export async function nextDocumentNumber(
  tenantId: string,
  docType: "receipt" | "ledger" | string,
): Promise<string> {
  const prefix = docPrefixes[docType] ?? docType.toUpperCase();
  const rows = JSON.parse(
    await psql(`
      BEGIN;
      SET LOCAL ROLE wat_app;
      SET LOCAL app.tenant_id = ${sqlLiteral(tenantId)};
      WITH q AS (
        INSERT INTO doc_counters (tenant_id, doc_type, next_value)
        VALUES (${sqlLiteral(tenantId)}, ${sqlLiteral(docType)}, 2)
        ON CONFLICT (tenant_id, doc_type)
        DO UPDATE SET next_value = doc_counters.next_value + 1, updated_at = now()
        RETURNING next_value - 1 AS allocated_value
      )
      SELECT COALESCE(json_agg(q), '[]'::json) FROM q;
      COMMIT;
    `) || "[]",
  ) as Array<{ allocated_value: number }>;
  const allocatedValue = rows[0]?.allocated_value;

  if (!allocatedValue) {
    throw new Error(`Could not allocate ${docType} number for tenant ${tenantId}`);
  }

  return `${prefix}-${allocatedValue.toString().padStart(6, "0")}`;
}
