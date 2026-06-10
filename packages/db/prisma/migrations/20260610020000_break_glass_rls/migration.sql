-- break_glass_grants carries a tenant_id but was created as a platform-plane
-- table with no RLS (wat_app has no grants on it, so it was safe at the grant
-- level only). The rls:check gate is now dynamic — every table with a
-- tenant_id column must have RLS enabled AND forced — so give it the same
-- defense-in-depth as everything else: FORCE RLS with only the migrate_all
-- policy (platform plane runs as wat_migrate). wat_app still has no path in.

ALTER TABLE break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_glass_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY break_glass_grants_migrate_all
  ON break_glass_grants
  FOR ALL TO wat_migrate
  USING (true)
  WITH CHECK (true);
