-- Attachments can be the evidence (หลักฐาน) behind donations, receipts, and
-- ledger entries, so they fall under the no-hard-delete product rule after all.
-- Replace the hard DELETE capability with soft delete:
--   * deleted_at / deleted_by_user_id / delete_reason columns,
--   * drop the tenant DELETE policy added by 20260531081000,
--   * revoke DELETE from wat_app at the grant level (same enforcement as
--     donations / receipts / ledger_entries).
-- The blob stays in the row for the retention window; reads exclude
-- deleted rows in the application layer.

ALTER TABLE attachments
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_user_id uuid,
  ADD COLUMN delete_reason text;

DROP POLICY IF EXISTS attachments_tenant_delete ON attachments;

REVOKE DELETE ON attachments FROM wat_app;
