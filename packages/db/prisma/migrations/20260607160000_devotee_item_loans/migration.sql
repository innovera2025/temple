-- Devotee (ญาติโยม) item borrowing: a devotee submits a borrow REQUEST that temple
-- staff later approve (hand-over with the required photo + stock decrement) or reject.

-- New loan statuses. `requested` = devotee request awaiting staff confirmation (no
-- photo, no stock decrement yet); `cancelled` = staff-rejected/withdrawn request.
-- Idempotent; PG16 allows ADD VALUE here because the values are not used in this
-- migration. (Same pattern already validated for ceremony_status.)
ALTER TYPE "loan_status" ADD VALUE IF NOT EXISTS 'requested' BEFORE 'borrowed';
ALTER TYPE "loan_status" ADD VALUE IF NOT EXISTS 'cancelled';

-- Link a loan to the devotee who requested it (NULL for staff-created walk-in loans).
-- item_loans already has RLS + wat_app INSERT/UPDATE (table-level grant covers the new
-- column); the FK to devotee_accounts needs no extra grant on that table.
ALTER TABLE item_loans ADD COLUMN devotee_account_id uuid REFERENCES devotee_accounts(id);
CREATE INDEX item_loans_devotee_account_id_idx ON item_loans (devotee_account_id);
