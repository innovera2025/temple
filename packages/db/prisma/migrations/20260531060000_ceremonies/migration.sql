-- Ceremonies / งานบุญ-พิธี (basic records). A normal tenant table: tenant_id +
-- Row-Level Security, edited under wat_app via withTenant. No hard delete —
-- a ceremony is cancelled via status = 'cancelled'. (Full booking/calendar and
-- monk-invitation linking are deferred to MVP-2.)

CREATE TYPE ceremony_type AS ENUM ('merit', 'funeral', 'ordination', 'housewarming', 'robe_offering', 'other');
CREATE TYPE ceremony_status AS ENUM ('planned', 'completed', 'cancelled');

CREATE TABLE ceremonies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  ceremony_type ceremony_type NOT NULL,
  status ceremony_status NOT NULL DEFAULT 'planned',
  title text NOT NULL,
  ceremony_date date NOT NULL,
  time_note text,
  location text,
  requester_name text,
  requester_phone text,
  assigned_monks text,
  monk_count integer,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX ceremonies_tenant_id_idx ON ceremonies(tenant_id);
CREATE INDEX ceremonies_tenant_date_idx ON ceremonies(tenant_id, ceremony_date);

ALTER TABLE ceremonies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceremonies FORCE ROW LEVEL SECURITY;

CREATE POLICY ceremonies_migrate_all
  ON ceremonies
  FOR ALL TO wat_migrate
  USING (true)
  WITH CHECK (true);

CREATE POLICY ceremonies_tenant_select
  ON ceremonies
  FOR SELECT TO wat_app
  USING (tenant_id = current_tenant_id());

CREATE POLICY ceremonies_tenant_insert
  ON ceremonies
  FOR INSERT TO wat_app
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY ceremonies_tenant_update
  ON ceremonies
  FOR UPDATE TO wat_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- New table: needs explicit grants; wat_migrate needs TRUNCATE so the RLS test
-- harness's `TRUNCATE temples ... CASCADE` cascades through the temples FK.
-- No DELETE for wat_app (cancel via status, no hard delete).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ceremonies TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON ceremonies TO wat_app;
