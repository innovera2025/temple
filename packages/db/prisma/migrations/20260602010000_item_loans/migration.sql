-- การยืม-คืนสิ่งของวัด (temple item borrowing/returning). Three tenant tables under RLS:
-- borrowable_items (สิ่งของที่ให้ยืมได้ + จำนวนทั้งหมด), item_loans (การยืม: ใคร/กี่ชิ้น/รูป/สถานะ/คืน),
-- item_loan_settlements (กรณีคืนไม่ครบ: ซื้อมาชดใช้ replacement หรือจ่ายเงิน cash). No hard delete
-- (items archived via status; loans closed via status=returned; settlements append-only).
-- Money is integer satang (bigint). Borrow requires a photo (attachment ownerType=item_loan).

ALTER TYPE attachment_owner_type ADD VALUE IF NOT EXISTS 'item_loan';

CREATE TYPE loan_status AS ENUM ('borrowed', 'returned');
CREATE TYPE loan_settlement_type AS ENUM ('replacement', 'cash');

CREATE TABLE borrowable_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  name text NOT NULL,
  category inventory_category NOT NULL DEFAULT 'equipment',
  unit text,
  total_qty integer NOT NULL DEFAULT 0,
  status inventory_status NOT NULL DEFAULT 'active',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE INDEX borrowable_items_tenant_id_idx ON borrowable_items(tenant_id);

CREATE TABLE item_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  loan_no text NOT NULL,
  item_id uuid NOT NULL,
  borrower_name text NOT NULL,
  borrower_phone text,
  quantity integer NOT NULL,
  borrowed_at date NOT NULL,
  due_at date,
  borrow_photo_id uuid,
  status loan_status NOT NULL DEFAULT 'borrowed',
  returned_at date,
  returned_qty integer,
  return_note text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, loan_no),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, item_id) REFERENCES borrowable_items(tenant_id, id)
);
CREATE INDEX item_loans_tenant_id_idx ON item_loans(tenant_id);
CREATE INDEX item_loans_tenant_item_idx ON item_loans(tenant_id, item_id);
CREATE INDEX item_loans_tenant_status_idx ON item_loans(tenant_id, status);

CREATE TABLE item_loan_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES temples(id),
  loan_id uuid NOT NULL,
  shortage_qty integer NOT NULL,
  settlement_type loan_settlement_type NOT NULL,
  cash_amount_satang bigint,
  replacement_note text,
  settled_at date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, loan_id) REFERENCES item_loans(tenant_id, id)
);
CREATE INDEX item_loan_settlements_tenant_id_idx ON item_loan_settlements(tenant_id);
CREATE INDEX item_loan_settlements_tenant_loan_idx ON item_loan_settlements(tenant_id, loan_id);

-- RLS (per-tenant), identical pattern to the other tenant tables.
ALTER TABLE borrowable_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowable_items FORCE ROW LEVEL SECURITY;
ALTER TABLE item_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_loans FORCE ROW LEVEL SECURITY;
ALTER TABLE item_loan_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_loan_settlements FORCE ROW LEVEL SECURITY;

CREATE POLICY borrowable_items_migrate_all ON borrowable_items FOR ALL TO wat_migrate USING (true) WITH CHECK (true);
CREATE POLICY borrowable_items_tenant_select ON borrowable_items FOR SELECT TO wat_app USING (tenant_id = current_tenant_id());
CREATE POLICY borrowable_items_tenant_insert ON borrowable_items FOR INSERT TO wat_app WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY borrowable_items_tenant_update ON borrowable_items FOR UPDATE TO wat_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY item_loans_migrate_all ON item_loans FOR ALL TO wat_migrate USING (true) WITH CHECK (true);
CREATE POLICY item_loans_tenant_select ON item_loans FOR SELECT TO wat_app USING (tenant_id = current_tenant_id());
CREATE POLICY item_loans_tenant_insert ON item_loans FOR INSERT TO wat_app WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY item_loans_tenant_update ON item_loans FOR UPDATE TO wat_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY item_loan_settlements_migrate_all ON item_loan_settlements FOR ALL TO wat_migrate USING (true) WITH CHECK (true);
CREATE POLICY item_loan_settlements_tenant_select ON item_loan_settlements FOR SELECT TO wat_app USING (tenant_id = current_tenant_id());
CREATE POLICY item_loan_settlements_tenant_insert ON item_loan_settlements FOR INSERT TO wat_app WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY item_loan_settlements_tenant_update ON item_loan_settlements FOR UPDATE TO wat_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- wat_migrate needs TRUNCATE for the temples cascade in the RLS test harness.
-- wat_app gets no DELETE (archive-via-status / append-only).
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON borrowable_items TO wat_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON item_loans TO wat_migrate;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON item_loan_settlements TO wat_migrate;
GRANT SELECT, INSERT, UPDATE ON borrowable_items TO wat_app;
GRANT SELECT, INSERT, UPDATE ON item_loans TO wat_app;
GRANT SELECT, INSERT, UPDATE ON item_loan_settlements TO wat_app;
