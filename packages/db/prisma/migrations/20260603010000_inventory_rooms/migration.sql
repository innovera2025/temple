-- ห้อง/โรงเก็บพัสดุ (storage rooms) + ผูกกับ inventory_items. A tenant-scoped master of
-- rooms (unique name per tenant so Excel import can map by name); inventory items reference
-- an optional room. RLS forced; wat_app SELECT/INSERT/UPDATE only (no hard delete).

CREATE TABLE storage_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);
CREATE INDEX storage_rooms_tenant_id_idx ON storage_rooms(tenant_id);

ALTER TABLE inventory_items ADD COLUMN room_id uuid;
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_room_fk FOREIGN KEY (tenant_id, room_id) REFERENCES storage_rooms(tenant_id, id);
CREATE INDEX inventory_items_tenant_room_idx ON inventory_items(tenant_id, room_id);

ALTER TABLE storage_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_rooms FORCE ROW LEVEL SECURITY;

CREATE POLICY storage_rooms_migrate_all ON storage_rooms FOR ALL TO wat_migrate USING (true) WITH CHECK (true);
CREATE POLICY storage_rooms_tenant_select ON storage_rooms FOR SELECT TO wat_app USING (tenant_id = current_tenant_id());
CREATE POLICY storage_rooms_tenant_insert ON storage_rooms FOR INSERT TO wat_app WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY storage_rooms_tenant_update ON storage_rooms FOR UPDATE TO wat_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON storage_rooms TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON storage_rooms TO wat_app;
