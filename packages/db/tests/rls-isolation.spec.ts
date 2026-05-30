import { describe, expect, it } from "vitest";
import { createTenantClient, rawQuery } from "../src/tenant-context";
import {
  asAppTenantJson,
  psql,
  resetTenantFixtures,
  tenantA,
  tenantB,
  uniqueEmail,
} from "./db-test-utils";

describe("tenant RLS isolation", () => {
  it("does not leak rows without tenant context and isolates tenant reads", async () => {
    await resetTenantFixtures();

    await psql(`
      SET ROLE wat_migrate;
      INSERT INTO donors (id, tenant_id, display_name, donor_type)
      VALUES (gen_random_uuid(), '${tenantA}', 'Tenant A donor', 'person'),
             (gen_random_uuid(), '${tenantB}', 'Tenant B donor', 'person');
      RESET ROLE;
    `);

    const withoutTenant = await asAppTenantJson<{ display_name: string }>(
      null,
      "SELECT display_name FROM donors ORDER BY display_name",
    );
    expect(withoutTenant).toEqual([]);

    const tenantARows = await asAppTenantJson<{ display_name: string }>(
      tenantA,
      "SELECT display_name FROM donors ORDER BY display_name",
    );
    expect(tenantARows).toEqual([{ display_name: "Tenant A donor" }]);

    const tenantBRows = await asAppTenantJson<{ display_name: string }>(
      tenantB,
      "SELECT display_name FROM donors ORDER BY display_name",
    );
    expect(tenantBRows).toEqual([{ display_name: "Tenant B donor" }]);
  });

  it("rejects writes for a different tenant than the active context", async () => {
    await resetTenantFixtures();

    await expect(
      rawQuery(
        tenantA,
        `INSERT INTO users (id, tenant_id, email, display_name, role)
         VALUES (gen_random_uuid(), '${tenantB}', '${uniqueEmail("wrong-tenant")}', 'Wrong tenant', 'staff')`,
      ),
    ).rejects.toThrow(/row-level security policy|violates row-level security/i);
  });

  it("rejects cross-tenant references inside tenant-owned tables", async () => {
    await resetTenantFixtures();

    const donorB = await psql(`
      SET ROLE wat_migrate;
      INSERT INTO donors (id, tenant_id, display_name, donor_type)
      VALUES (gen_random_uuid(), '${tenantB}', 'Tenant B donor ref', 'person')
      RETURNING id;
      RESET ROLE;
    `);

    await expect(
      rawQuery(
        tenantA,
        `INSERT INTO donations (id, tenant_id, donor_id, amount_satang, currency, donation_date, status)
         VALUES (gen_random_uuid(), '${tenantA}', '${donorB}', 10000, 'THB', CURRENT_DATE, 'confirmed')`,
      ),
    ).rejects.toThrow(/foreign key|violates foreign key/i);

    const donationB = await psql(`
      SET ROLE wat_migrate;
      WITH donor AS (
        INSERT INTO donors (id, tenant_id, display_name, donor_type)
        VALUES (gen_random_uuid(), '${tenantB}', 'Tenant B receipt donor', 'person')
        RETURNING id
      )
      INSERT INTO donations (id, tenant_id, donor_id, amount_satang, currency, donation_date, status)
      SELECT gen_random_uuid(), '${tenantB}', id, 10000, 'THB', CURRENT_DATE, 'confirmed'
      FROM donor
      RETURNING id;
      RESET ROLE;
    `);

    await expect(
      rawQuery(
        tenantA,
        `INSERT INTO receipts (id, tenant_id, donation_id, receipt_no, status)
         VALUES (gen_random_uuid(), '${tenantA}', '${donationB}', 'CROSS-RCPT-001', 'issued')`,
      ),
    ).rejects.toThrow(/foreign key|violates foreign key/i);

    const accountB = await psql(`
      SET ROLE wat_migrate;
      INSERT INTO ledger_accounts (id, tenant_id, code, name_th, account_type)
      VALUES (gen_random_uuid(), '${tenantB}', '8888', 'บัญชีข้ามวัด', 'revenue')
      RETURNING id;
      RESET ROLE;
    `);

    await expect(
      rawQuery(
        tenantA,
        `INSERT INTO ledger_entries (id, tenant_id, entry_no, account_id, amount_satang, entry_date, status)
         VALUES (gen_random_uuid(), '${tenantA}', 'CROSS-LEDG-001', '${accountB}', 10000, CURRENT_DATE, 'posted')`,
      ),
    ).rejects.toThrow(/foreign key|violates foreign key/i);
  });

  it("does not grant tenant app role access to platform tables", async () => {
    await expect(
      rawQuery(
        tenantA,
        "SELECT id FROM platform_users LIMIT 1",
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("sets tenant context through the exported helper", async () => {
    await resetTenantFixtures();
    const tenantClient = createTenantClient(tenantA);

    await tenantClient.transaction(async (tx) => {
      const current = await tx.query<{ current_tenant_id: string }>("SELECT current_tenant_id()");
      expect(current[0]?.current_tenant_id).toBe(tenantA);
    });
  });
});
