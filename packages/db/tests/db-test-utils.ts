import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const tenantA = "11111111-1111-4111-8111-111111111111";
export const tenantB = "22222222-2222-4222-8222-222222222222";

export async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "docker",
    [
      "exec",
      "-i",
      "wat-dev-db",
      "psql",
      "-U",
      process.env.POSTGRES_USER ?? "wat_dev",
      "-d",
      process.env.POSTGRES_DB ?? "wat_dev",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-At",
      "-c",
      sql,
    ],
    { maxBuffer: 1024 * 1024 },
  );

  return stdout.trim();
}

export async function psqlJson<T>(sql: string): Promise<T[]> {
  const rows = await psql(
    `WITH q AS (${sql.replace(/;+\s*$/, "")}) SELECT COALESCE(json_agg(q), '[]'::json) FROM q;`,
  );

  return JSON.parse(rows || "[]") as T[];
}

export async function resetTenantFixtures(): Promise<void> {
  await psql(`
    SET ROLE wat_migrate;
    RESET app.tenant_id;
    TRUNCATE receipts, donations, ledger_entries, doc_counters, donors, users, temples RESTART IDENTITY CASCADE;
    INSERT INTO temples (id, slug, name_th, status)
    VALUES ('${tenantA}', 'wat-test-a', 'วัดทดสอบ ก', 'active'),
           ('${tenantB}', 'wat-test-b', 'วัดทดสอบ ข', 'active');
    RESET ROLE;
  `);
}

export async function asAppTenantJson<T>(
  tenantId: string | null,
  sql: string,
): Promise<T[]> {
  const tenantSetting = tenantId
    ? `SET LOCAL app.tenant_id = '${tenantId}';`
    : "";

  const rows = await psql(`
    BEGIN;
    SET LOCAL ROLE wat_app;
    ${tenantSetting}
    WITH q AS (${sql.replace(/;+\s*$/, "")})
    SELECT COALESCE(json_agg(q), '[]'::json) FROM q;
    COMMIT;
  `);

  return JSON.parse(rows || "[]") as T[];
}

export async function asAppTenant(tenantId: string | null, sql: string): Promise<string> {
  const tenantSetting = tenantId
    ? `SET LOCAL app.tenant_id = '${tenantId}';`
    : "";
  const statement = sql.replace(/;+\s*$/, "");

  return psql(`
    BEGIN;
    SET LOCAL ROLE wat_app;
    ${tenantSetting}
    ${statement};
    COMMIT;
  `);
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}
