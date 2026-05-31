-- Task 8: reconciliation + close period.
--
-- Additive only. Existing row-level RLS (tenant_id) on ledger_entries and
-- reconciliation_periods covers the new columns; no new policies/grants needed.
--
-- ledger_entries.reconciled_at: timestamp set when an entry is marked reconciled
-- (null = not reconciled). reconciliation_periods.closed_by_user_id records who
-- closed the period, via a tenant-scoped COMPOSITE FK to users (matching the
-- foundation pattern, so it can never point at another tenant's user).

ALTER TABLE ledger_entries
  ADD COLUMN reconciled_at timestamptz;

ALTER TABLE reconciliation_periods
  ADD COLUMN closed_by_user_id uuid;

ALTER TABLE reconciliation_periods
  ADD CONSTRAINT reconciliation_periods_closed_by_fkey
  FOREIGN KEY (tenant_id, closed_by_user_id) REFERENCES users(tenant_id, id);
