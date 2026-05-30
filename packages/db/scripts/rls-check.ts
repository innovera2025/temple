import { checkTenantTableRls, missingRlsTables } from "../src/rls-check.js";

const statuses = await checkTenantTableRls();
const missing = missingRlsTables(statuses);

console.table(statuses);

if (missing.length > 0) {
  console.error(`Missing enabled/forced RLS on: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("All tenant tables have RLS enabled and forced.");
