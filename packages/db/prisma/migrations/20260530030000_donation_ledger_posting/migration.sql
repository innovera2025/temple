-- Task 5: donation payment method + optional fund account, and a donation -> ledger
-- link so a donation can auto-post an income ledger entry in the same transaction
-- (and have that entry reversed on void).
--
-- Additive only. Row-level RLS (tenant_id) on donations/ledger_entries already
-- covers the new columns, and DELETE stays revoked from wat_app on both tables,
-- so the no-hard-delete rule still holds.
--
-- The new cross-entity FKs are tenant-scoped COMPOSITE FKs, matching the
-- foundation pattern (donors/receipts/ledger_entries all use
-- FOREIGN KEY (tenant_id, x) REFERENCES parent(tenant_id, id)). Postgres FK
-- integrity checks bypass RLS, so the composite FK is the DB-level guarantee
-- that fund_account_id / donation_id can never point at another tenant's row.

CREATE TYPE donation_method AS ENUM ('cash', 'bank_transfer', 'qr', 'other');

ALTER TABLE donations
  ADD COLUMN method donation_method NOT NULL DEFAULT 'cash',
  ADD COLUMN fund_account_id uuid;

ALTER TABLE donations
  ADD CONSTRAINT donations_fund_account_fkey
  FOREIGN KEY (tenant_id, fund_account_id) REFERENCES ledger_accounts(tenant_id, id);

ALTER TABLE ledger_entries
  ADD COLUMN donation_id uuid;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_donation_fkey
  FOREIGN KEY (tenant_id, donation_id) REFERENCES donations(tenant_id, id);

CREATE INDEX ledger_entries_donation_id_idx ON ledger_entries(donation_id);
