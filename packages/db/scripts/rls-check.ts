import { checkTenantTableRls, discoverTenantTables, missingRlsTables, tenantTables } from "../src/rls-check.js";

const statuses = await checkTenantTableRls();
const missing = missingRlsTables(statuses);
const discovered = await discoverTenantTables();
const undocumented = discovered.filter((table) => !(tenantTables as readonly string[]).includes(table));

console.table(statuses);

if (missing.length > 0) {
  console.error(`Missing enabled/forced RLS on: ${missing.join(", ")}`);
  process.exit(1);
}

if (undocumented.length > 0) {
  // Informational only — the RLS gate above already covered them dynamically.
  console.warn(`New tenant tables not yet in the documented list: ${undocumented.join(", ")}`);
}

console.log(`All ${statuses.length} tenant tables (every table with a tenant_id column) have RLS enabled and forced.`);
