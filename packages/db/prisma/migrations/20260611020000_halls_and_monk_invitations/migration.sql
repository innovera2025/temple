-- จองศาลา + นิมนต์พระ as real workflows (was free text on ceremonies).
--
-- temple_halls: the temple's bookable places (ศาลา/อุโบสถ/ลานวัด). Normal
-- tenant table: FORCE RLS, no hard delete (is_active flag).
--
-- ceremonies.hall_id: tenant-scoped composite FK so a ceremony can never
-- reference another temple's hall even if RLS were bypassed.
--
-- ceremony_monks: monk invitations linked to the personnel registry (instead
-- of a free-text list) — tenant-scoped composite FKs on both sides.

CREATE TABLE temple_halls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE INDEX temple_halls_tenant_id_idx ON temple_halls(tenant_id);

ALTER TABLE temple_halls ENABLE ROW LEVEL SECURITY;
ALTER TABLE temple_halls FORCE ROW LEVEL SECURITY;

CREATE POLICY temple_halls_migrate_all
  ON temple_halls FOR ALL TO wat_migrate
  USING (true) WITH CHECK (true);
CREATE POLICY temple_halls_tenant_select
  ON temple_halls FOR SELECT TO wat_app
  USING (tenant_id = current_tenant_id());
CREATE POLICY temple_halls_tenant_insert
  ON temple_halls FOR INSERT TO wat_app
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY temple_halls_tenant_update
  ON temple_halls FOR UPDATE TO wat_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON temple_halls TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON temple_halls TO wat_app;

ALTER TABLE ceremonies
  ADD COLUMN hall_id uuid,
  ADD CONSTRAINT ceremonies_hall_fk
    FOREIGN KEY (tenant_id, hall_id) REFERENCES temple_halls(tenant_id, id);

CREATE INDEX ceremonies_tenant_hall_date_idx ON ceremonies(tenant_id, hall_id, ceremony_date);

CREATE TABLE ceremony_monks (
  tenant_id uuid NOT NULL REFERENCES temples(id),
  ceremony_id uuid NOT NULL,
  personnel_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ceremony_id, personnel_id),
  FOREIGN KEY (tenant_id, ceremony_id) REFERENCES ceremonies(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, personnel_id) REFERENCES personnel(tenant_id, id)
);

CREATE INDEX ceremony_monks_tenant_id_idx ON ceremony_monks(tenant_id);
CREATE INDEX ceremony_monks_tenant_personnel_idx ON ceremony_monks(tenant_id, personnel_id);

ALTER TABLE ceremony_monks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceremony_monks FORCE ROW LEVEL SECURITY;

CREATE POLICY ceremony_monks_migrate_all
  ON ceremony_monks FOR ALL TO wat_migrate
  USING (true) WITH CHECK (true);
CREATE POLICY ceremony_monks_tenant_select
  ON ceremony_monks FOR SELECT TO wat_app
  USING (tenant_id = current_tenant_id());
CREATE POLICY ceremony_monks_tenant_insert
  ON ceremony_monks FOR INSERT TO wat_app
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY ceremony_monks_tenant_update
  ON ceremony_monks FOR UPDATE TO wat_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
-- Unlike financial rows, re-picking the invited monks for a ceremony is a
-- legitimate replace-the-set operation: wat_app may DELETE join rows.
CREATE POLICY ceremony_monks_tenant_delete
  ON ceremony_monks FOR DELETE TO wat_app
  USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ceremony_monks TO wat_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE ON ceremony_monks TO wat_app;
