-- Phase 2: devotee (ญาติโยม) ceremony booking. A devotee can request a ceremony at
-- any ACTIVE temple; the booking is a tenant-scoped `ceremonies` row tagged with the
-- devotee, starting in the new `requested` status until temple staff confirm it.

-- New booking status, ordered first to match schema.prisma. Idempotent; PG16 allows
-- ADD VALUE here because the value is NOT used within this migration.
ALTER TYPE "ceremony_status" ADD VALUE IF NOT EXISTS 'requested' BEFORE 'planned';

-- Link a ceremony to the devotee who requested it (NULL for staff-created records).
-- ceremonies already has RLS + wat_app INSERT/UPDATE (table-level grant covers the
-- new column); the FK to devotee_accounts needs no extra grant on that table.
ALTER TABLE ceremonies ADD COLUMN devotee_account_id uuid REFERENCES devotee_accounts(id);
CREATE INDEX ceremonies_devotee_account_id_idx ON ceremonies(devotee_account_id);
