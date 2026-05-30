-- Task 6: receipt (ใบอนุโมทนา) issuance — void + reissue (supersession) support.
--
-- Additive only. Row-level RLS (tenant_id) on receipts already covers the new
-- column, and DELETE stays revoked from wat_app on receipts, so the
-- no-hard-delete rule still holds (reissue marks the old receipt 'superseded',
-- it is never deleted).
--
-- The supersession link is a tenant-scoped COMPOSITE self-FK, matching the
-- foundation pattern, so a receipt can never be superseded by another tenant's
-- receipt (Postgres FK checks bypass RLS).

-- New status for a receipt replaced by a reissue (distinct from 'voided').
ALTER TYPE receipt_status ADD VALUE IF NOT EXISTS 'superseded';

ALTER TABLE receipts
  ADD COLUMN superseded_by_receipt_id uuid;

-- Composite (tenant_id, id) unique is required as the self-FK target.
ALTER TABLE receipts
  ADD CONSTRAINT receipts_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE receipts
  ADD CONSTRAINT receipts_superseded_by_fkey
  FOREIGN KEY (tenant_id, superseded_by_receipt_id) REFERENCES receipts(tenant_id, id);

CREATE INDEX receipts_superseded_by_receipt_id_idx ON receipts(superseded_by_receipt_id);
