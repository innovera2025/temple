import { describe, expect, it } from "vitest";
import {
  asAppTenant,
  psql,
  resetTenantFixtures,
  tenantA,
  uniqueEmail,
} from "./db-test-utils";

describe("hard delete protections", () => {
  it("prevents the app role from deleting protected financial rows", async () => {
    await resetTenantFixtures();

    await psql(`
      SET ROLE wat_migrate;
      WITH donor AS (
        INSERT INTO donors (id, tenant_id, display_name, donor_type)
        VALUES (gen_random_uuid(), '${tenantA}', 'Donor', 'person')
        RETURNING id
      ), donation AS (
        INSERT INTO donations (id, tenant_id, donor_id, amount_satang, currency, donation_date, status)
        SELECT gen_random_uuid(), '${tenantA}', id, 10000, 'THB', CURRENT_DATE, 'confirmed'
        FROM donor
        RETURNING id
      ), account AS (
        INSERT INTO ledger_accounts (id, tenant_id, code, name_th, account_type)
        VALUES (gen_random_uuid(), '${tenantA}', '9999', 'บัญชีทดสอบ', 'revenue')
        RETURNING id
      )
      INSERT INTO receipts (id, tenant_id, donation_id, receipt_no, status)
      SELECT gen_random_uuid(), '${tenantA}', id, 'TEST-RCPT-001', 'issued'
      FROM donation;
      INSERT INTO ledger_entries (id, tenant_id, entry_no, account_id, amount_satang, entry_date, status)
      SELECT gen_random_uuid(), '${tenantA}', id::text, id, 10000, CURRENT_DATE, 'posted'
      FROM (SELECT id FROM ledger_accounts WHERE tenant_id = '${tenantA}' AND code = '9999' LIMIT 1) account;
      INSERT INTO doc_counters (tenant_id, doc_type, next_value)
      VALUES ('${tenantA}', 'test-delete', 2);
      INSERT INTO users (id, tenant_id, email, display_name, role)
      VALUES (gen_random_uuid(), '${tenantA}', '${uniqueEmail("audit")}', 'Audit User', 'admin');
      INSERT INTO audit_logs (id, tenant_id, actor_user_id, action, entity_type, entity_id)
      SELECT gen_random_uuid(), tenant_id, id, 'create', 'donation', gen_random_uuid()
      FROM users
      WHERE tenant_id = '${tenantA}'
      LIMIT 1;
      RESET ROLE;
    `);

    await expect(asAppTenant(tenantA, "DELETE FROM donations")).rejects.toThrow(/permission denied/i);
    await expect(asAppTenant(tenantA, "DELETE FROM receipts")).rejects.toThrow(/permission denied/i);
    await expect(asAppTenant(tenantA, "DELETE FROM ledger_entries")).rejects.toThrow(/permission denied/i);
    await expect(asAppTenant(tenantA, "DELETE FROM doc_counters")).rejects.toThrow(/permission denied/i);

    await expect(
      asAppTenant(tenantA, "UPDATE audit_logs SET action = 'tamper'"),
    ).rejects.toThrow(/permission denied/i);

    await expect(asAppTenant(tenantA, "DELETE FROM audit_logs")).rejects.toThrow(/permission denied/i);
  });
});
