-- Inventory / คลังของบริจาค-พัสดุ-สังฆทาน. Two tenant tables under RLS:
-- inventory_items (master + denormalised running quantity) and inventory_movements
-- (immutable receive/issue transactions). Quantity changes ONLY via a movement,
-- applied atomically with a row lock. No hard delete (items archived via status;
-- movements are append-only — corrections are new movements).

CREATE TYPE inventory_category AS ENUM ('sangha_offering', 'supplies', 'equipment', 'other');
CREATE TYPE inventory_status AS ENUM ('active', 'inactive');
CREATE TYPE inventory_movement_type AS ENUM ('receive', 'issue');

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  name text NOT NULL,
  category inventory_category NOT NULL DEFAULT 'other',
  unit text,
  quantity integer NOT NULL DEFAULT 0,
  status inventory_status NOT NULL DEFAULT 'active',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX inventory_items_tenant_id_idx ON inventory_items(tenant_id);
CREATE INDEX inventory_items_tenant_category_idx ON inventory_items(tenant_id, category);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  item_id uuid NOT NULL,
  movement_type inventory_movement_type NOT NULL,
  quantity integer NOT NULL,
  balance_after integer NOT NULL,
  movement_date date NOT NULL,
  reason text,
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, item_id) REFERENCES inventory_items(tenant_id, id)
);

CREATE INDEX inventory_movements_tenant_id_idx ON inventory_movements(tenant_id);
CREATE INDEX inventory_movements_tenant_item_idx ON inventory_movements(tenant_id, item_id);

-- RLS on both tables (per-tenant), identical to the other tenant tables.
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;

CREATE POLICY inventory_items_migrate_all ON inventory_items FOR ALL TO wat_migrate USING (true) WITH CHECK (true);
CREATE POLICY inventory_items_tenant_select ON inventory_items FOR SELECT TO wat_app USING (tenant_id = current_tenant_id());
CREATE POLICY inventory_items_tenant_insert ON inventory_items FOR INSERT TO wat_app WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY inventory_items_tenant_update ON inventory_items FOR UPDATE TO wat_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY inventory_movements_migrate_all ON inventory_movements FOR ALL TO wat_migrate USING (true) WITH CHECK (true);
CREATE POLICY inventory_movements_tenant_select ON inventory_movements FOR SELECT TO wat_app USING (tenant_id = current_tenant_id());
CREATE POLICY inventory_movements_tenant_insert ON inventory_movements FOR INSERT TO wat_app WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY inventory_movements_tenant_update ON inventory_movements FOR UPDATE TO wat_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- New tables: explicit grants; wat_migrate needs TRUNCATE for the temples cascade
-- in the RLS test harness. wat_app gets no DELETE (append-only / archive-via-status).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON inventory_items TO wat_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON inventory_movements TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON inventory_items TO wat_app;
GRANT SELECT, INSERT, UPDATE ON inventory_movements TO wat_app;
