-- Monk / novice / staff management (personnel). A normal tenant table: tenant_id
-- + Row-Level Security, edited under wat_app via withTenant (not withSystemAccess).
-- No hard delete is exposed; records are archived via status = 'inactive'.

CREATE TYPE personnel_type AS ENUM ('monk', 'novice', 'staff');
CREATE TYPE personnel_status AS ENUM ('active', 'inactive');

CREATE TABLE personnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  personnel_type personnel_type NOT NULL,
  status personnel_status NOT NULL DEFAULT 'active',
  display_name text NOT NULL,
  dharma_name text,
  secular_name text,
  rank text,
  position text,
  ordination_date date,
  ordination_temple text,
  preceptor text,
  phansa_count integer,
  date_of_birth date,
  national_id text,
  phone text,
  note text,
  joined_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX personnel_tenant_id_idx ON personnel(tenant_id);
CREATE INDEX personnel_tenant_type_idx ON personnel(tenant_id, personnel_type);

ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel FORCE ROW LEVEL SECURITY;

CREATE POLICY personnel_migrate_all
  ON personnel
  FOR ALL TO wat_migrate
  USING (true)
  WITH CHECK (true);

CREATE POLICY personnel_tenant_select
  ON personnel
  FOR SELECT TO wat_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY personnel_tenant_insert
  ON personnel
  FOR INSERT TO wat_app
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY personnel_tenant_update
  ON personnel
  FOR UPDATE TO wat_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- New table: the foundation ON ALL TABLES grant does not cover it, and it must be
-- TRUNCATE-able by wat_migrate so `TRUNCATE temples ... CASCADE` (RLS test harness)
-- can cascade through the temples FK. No DELETE for wat_app (archive via status).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON personnel TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON personnel TO wat_app;
